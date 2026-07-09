import { app } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  AudioDevices,
  AudioEngineEvent,
  Settings,
  SoundClip,
} from "../shared/types.js";
import { clipBuses } from "../shared/routing.js";

type Bus = "mic" | "monitor";

interface NativeDevice {
  id: string;
  label: string;
}

type NativeEvent =
  | { type: "ready" }
  | { type: "devices"; outputs: NativeDevice[]; inputs: NativeDevice[] }
  | { type: "meter"; mic: number; monitor: number }
  | { type: "clipEnded"; bus: Bus; clipId: string }
  | { type: "error"; message: string };

export interface AudioEngineOptions {
  // Override native executable resolution. Test seam; production resolves via
  // findNativeExecutable() (SOUNDGRID_AUDIO_ENGINE env, packaged resources, or
  // the cargo target directory).
  executableCommand?: { command: string; args: string[] };
  startupTimeout?: number;
  deviceTimeout?: number;
}

export class AudioEngine {
  private process?: ChildProcessWithoutNullStreams;
  private ready = false;
  private currentSettings?: Settings;
  private deviceWaiters: Array<(devices: AudioDevices) => void> = [];
  private eventHandler?: (event: AudioEngineEvent) => void;
  private micMuted = false;
  private monitorMuted = false;
  private readonly executableCommand?: { command: string; args: string[] };
  private readonly startupTimeout: number;
  private readonly deviceTimeout: number;

  constructor(options?: AudioEngineOptions) {
    this.executableCommand = options?.executableCommand;
    this.startupTimeout = options?.startupTimeout ?? 5_000;
    this.deviceTimeout = options?.deviceTimeout ?? 2_000;
  }

  async start(settings: Settings): Promise<void> {
    this.currentSettings = settings;
    const target = this.executableCommand ?? resolveNativeExecutable();
    if (!target) {
      this.emit({
        type: "error",
        message:
          "The native audio engine is not built. Run `pnpm build:native` and restart SoundGrid.",
      });
      return;
    }

    await new Promise<void>((resolve) => {
      const child = spawn(target.command, target.args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      this.process = child;
      const timeout = setTimeout(() => {
        this.emit({
          type: "error",
          message: "Native audio engine startup timed out.",
        });
        resolve();
      }, this.startupTimeout);

      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        let event: NativeEvent;
        try {
          event = JSON.parse(line) as NativeEvent;
        } catch {
          this.emit({
            type: "error",
            message: `Invalid native audio response: ${line}`,
          });
          return;
        }
        if (event.type === "ready" && !this.ready) {
          clearTimeout(timeout);
          this.ready = true;
          this.configure(settings);
          resolve();
        }
        this.handleNativeEvent(event);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        this.emit({ type: "error", message: chunk.toString("utf8").trim() });
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        this.emit({
          type: "error",
          message: `Cannot start audio engine: ${error.message}`,
        });
        resolve();
      });
      child.on("exit", (code, signal) => {
        this.ready = false;
        this.process = undefined;
        if (code !== 0 && signal !== "SIGTERM") {
          this.emit({
            type: "error",
            message: `Audio engine stopped unexpectedly (${code ?? signal ?? "unknown"}).`,
          });
        }
      });
    });
  }

  onEvent(handler: (event: AudioEngineEvent) => void): void {
    this.eventHandler = handler;
  }

  async listDevices(): Promise<AudioDevices> {
    if (!this.ready) return emptyDevices();
    return new Promise<AudioDevices>((resolve) => {
      const waiter = (devices: AudioDevices) => {
        clearTimeout(timeout);
        resolve(devices);
      };
      const timeout = setTimeout(() => {
        const index = this.deviceWaiters.indexOf(waiter);
        if (index >= 0) this.deviceWaiters.splice(index, 1);
        resolve(emptyDevices());
      }, this.deviceTimeout);
      this.deviceWaiters.push(waiter);
      this.send({ type: "listDevices" });
    });
  }

  applySettings(settings: Settings): void {
    const previous = this.currentSettings;
    this.currentSettings = settings;
    if (!previous || routingChanged(previous, settings))
      this.configure(settings);
    else {
      this.setMicVolume(settings.masterMicVolume);
      this.setMonitorVolume(settings.monitorVolume);
    }
  }

  async playBoth(clip: SoundClip | undefined): Promise<void> {
    if (!clip) return;
    const settings = this.currentSettings;
    const jobs = clipBuses(clip, settings?.micOnly ?? false).map((bus) =>
      bus === "mic" ? this.playToMic(clip) : this.playToMonitor(clip),
    );
    await Promise.all(jobs);
  }

  async playToMic(clip: SoundClip | undefined): Promise<void> {
    if (!clip || !clip.broadcast) return;
    this.play("mic", clip);
    this.emit({
      type: "transport",
      bus: "mic",
      state: "playing",
      clipId: clip.id,
      name: clip.name,
    });
  }

  async playToMonitor(clip: SoundClip | undefined): Promise<void> {
    // Mic-only is an output-routing guarantee, not merely a shortcut default:
    // direct Preview actions and IPC calls must not revive local playback.
    if (!clip || this.currentSettings?.micOnly) return;
    this.play("monitor", clip);
    this.emit({
      type: "transport",
      bus: "monitor",
      state: "playing",
      clipId: clip.id,
      name: clip.name,
    });
  }

  pauseMic(): void {
    this.send({ type: "pause", bus: "mic" });
    this.emit({ type: "transport", bus: "mic", state: "paused" });
  }
  resumeMic(): void {
    this.send({ type: "resume", bus: "mic" });
    this.emit({ type: "transport", bus: "mic", state: "playing" });
  }
  stopMic(): void {
    this.send({ type: "stop", bus: "mic" });
    this.emit({ type: "transport", bus: "mic", state: "stopped" });
  }
  pauseMonitor(): void {
    this.send({ type: "pause", bus: "monitor" });
    this.emit({ type: "transport", bus: "monitor", state: "paused" });
  }
  resumeMonitor(): void {
    this.send({ type: "resume", bus: "monitor" });
    this.emit({ type: "transport", bus: "monitor", state: "playing" });
  }
  stopMonitor(): void {
    this.send({ type: "stop", bus: "monitor" });
    this.emit({ type: "transport", bus: "monitor", state: "stopped" });
  }
  stopAll(): void {
    this.send({ type: "stopAll" });
    this.emit({ type: "transport", bus: "mic", state: "stopped" });
    this.emit({ type: "transport", bus: "monitor", state: "stopped" });
  }
  setMicMute(muted: boolean): void {
    this.micMuted = muted;
    this.send({ type: "setMute", bus: "mic", muted });
    this.emit({ type: "mute", bus: "mic", muted });
  }
  toggleMicMute(): boolean {
    this.setMicMute(!this.micMuted);
    return this.micMuted;
  }
  setMonitorMute(muted: boolean): void {
    this.monitorMuted = muted;
    this.send({ type: "setMute", bus: "monitor", muted });
    this.emit({ type: "mute", bus: "monitor", muted });
  }
  setMicVolume(volume: number): void {
    this.send({ type: "setVolume", bus: "mic", volume: clamp01(volume) });
  }
  setMonitorVolume(volume: number): void {
    this.send({ type: "setVolume", bus: "monitor", volume: clamp01(volume) });
  }

  shutdown(): void {
    this.send({ type: "shutdown" });
    this.process?.kill();
    this.process = undefined;
    this.ready = false;
  }

  private play(bus: Bus, clip: SoundClip): void {
    this.send({
      type: "play",
      bus,
      clipId: clip.id,
      path: clip.filePath,
      volume: clamp01(clip.volume),
      trimStart: Math.max(0, clip.trimStart),
      trimEnd: Math.max(0, clip.trimEnd),
      looped: clip.loop,
    });
  }

  private configure(settings: Settings): void {
    this.send({
      type: "configure",
      micOutputDeviceId: settings.micOutputDeviceId,
      monitorDeviceId: settings.monitorDeviceId,
      realMicDeviceId: settings.realMicDeviceId,
      passthrough: settings.passthrough,
      micVolume: clamp01(settings.masterMicVolume),
      monitorVolume: clamp01(settings.monitorVolume),
      monitorEnabled: !settings.micOnly,
      overlap: settings.overlap,
    });
  }

  private send(command: Record<string, unknown>): void {
    if (!this.ready || !this.process?.stdin.writable) return;
    this.process.stdin.write(`${JSON.stringify(command)}\n`);
  }

  private handleNativeEvent(event: NativeEvent): void {
    if (event.type === "devices") {
      const devices: AudioDevices = {
        micOutputs: event.outputs,
        monitors: event.outputs,
        realMics: event.inputs,
      };
      for (const resolve of this.deviceWaiters.splice(0)) resolve(devices);
    } else if (event.type === "meter") {
      this.emit({ type: "meter", mic: event.mic, monitor: event.monitor });
    } else if (event.type === "clipEnded") {
      this.emit(event);
    } else if (event.type === "error") {
      this.emit(event);
    }
  }

  private emit(event: AudioEngineEvent): void {
    this.eventHandler?.(event);
  }
}

function resolveNativeExecutable():
  { command: string; args: string[] } | undefined {
  const executable = findNativeExecutable();
  return executable ? { command: executable, args: [] } : undefined;
}

function findNativeExecutable(): string | undefined {
  const filename =
    process.platform === "win32" ? "soundgrid-audio.exe" : "soundgrid-audio";
  const candidates = [
    app.isPackaged ? undefined : process.env.SOUNDGRID_AUDIO_ENGINE,
    app.isPackaged
      ? path.join(process.resourcesPath, "native", filename)
      : undefined,
    path.join(
      app.getAppPath(),
      "native",
      "audio-engine",
      "target",
      "release",
      filename,
    ),
    path.join(
      app.getAppPath(),
      "native",
      "audio-engine",
      "target",
      "debug",
      filename,
    ),
  ].filter((value): value is string => Boolean(value));
  return candidates.find(existsSync);
}

function routingChanged(a: Settings, b: Settings): boolean {
  return (
    a.micOutputDeviceId !== b.micOutputDeviceId ||
    a.monitorDeviceId !== b.monitorDeviceId ||
    a.realMicDeviceId !== b.realMicDeviceId ||
    a.passthrough !== b.passthrough ||
    a.micOnly !== b.micOnly ||
    a.overlap !== b.overlap
  );
}

function emptyDevices(): AudioDevices {
  return { micOutputs: [], monitors: [], realMics: [] };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
