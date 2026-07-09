import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Electron's main-process APIs can't load in a plain Node test runner, and we
// never need them here (the executable is injected). Mock the module so the
// transitive `import { app } from "electron"` in audio-engine.ts resolves.
vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => "", resourcesPath: "" },
}));

import { AudioEngine } from "./audio-engine";
import {
  DEFAULT_SETTINGS,
  type AudioEngineEvent,
  type Settings,
  type SoundClip,
} from "../shared/types";

// A scriptable fake of the Rust sidecar. It speaks the same JSON-line protocol
// (stdin commands / stdout events) and logs every received command to a
// transcript file so tests can assert exactly what the bridge sent. Behavior
// flags are read from the environment so each test can shape the session.
const FAKE_SCRIPT = `
import { appendFileSync } from "node:fs";
const transcript = process.env.FAKE_TRANSCRIPT;
const log = (cmd) => { if (transcript) appendFileSync(transcript, JSON.stringify(cmd) + "\\n"); };
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\\n");

if (process.env.FAKE_NO_READY !== "1") send({ type: "ready" });
if (process.env.FAKE_METER === "1") send({ type: "meter", mic: 0.5, monitor: 0.25 });
if (process.env.FAKE_ERROR === "1") send({ type: "error", message: "boom" });
if (process.env.FAKE_EXIT === "1") setTimeout(() => process.exit(1), 50);
// Trap SIGTERM so the shutdown fallback is observable.
process.on("SIGTERM", () => { log({ type: "terminated" }); process.exit(0); });

let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    let cmd;
    try { cmd = JSON.parse(line); } catch { continue; }
    log(cmd);
    if (cmd.type === "listDevices" && process.env.FAKE_NO_DEVICES !== "1") {
      send({ type: "devices", outputs: [{ id: "0:Speakers", label: "Speakers" }, { id: "1:Cable", label: "CABLE Input" }], inputs: cmd.includeInputs === false ? [] : [{ id: "0:Mic", label: "Microphone" }] });
    } else if (cmd.type === "play" && process.env.FAKE_CLIP_ENDED === "1") {
      send({ type: "clipEnded", bus: cmd.bus, clipId: cmd.clipId });
    } else if (cmd.type === "shutdown" && process.env.FAKE_IGNORE_SHUTDOWN !== "1") {
      process.exit(0);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

const ENV_FLAGS = [
  "FAKE_TRANSCRIPT",
  "FAKE_NO_READY",
  "FAKE_METER",
  "FAKE_ERROR",
  "FAKE_EXIT",
  "FAKE_NO_DEVICES",
  "FAKE_CLIP_ENDED",
  "FAKE_IGNORE_SHUTDOWN",
];

let tmp = "";
let fakeScript = "";
const engines: AudioEngine[] = [];

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "soundgrid-audio-test-"));
  fakeScript = path.join(tmp, "fake-audio-engine.mjs");
  await writeFile(fakeScript, FAKE_SCRIPT);
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

afterEach(() => {
  for (const engine of engines.splice(0)) {
    try {
      engine.shutdown();
    } catch {
      /* already down */
    }
  }
  for (const key of ENV_FLAGS) delete process.env[key];
});

function makeEngine(
  env: Record<string, string> = {},
  timeouts?: { startupTimeout?: number; deviceTimeout?: number },
) {
  for (const key of ENV_FLAGS) delete process.env[key];
  Object.assign(process.env, env);
  const transcript = path.join(
    tmp,
    `t-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
  );
  process.env.FAKE_TRANSCRIPT = transcript;
  const events: AudioEngineEvent[] = [];
  const engine = new AudioEngine({
    executableCommand: { command: process.execPath, args: [fakeScript] },
    startupTimeout: timeouts?.startupTimeout ?? 1500,
    deviceTimeout: timeouts?.deviceTimeout ?? 400,
  });
  engine.onEvent((event) => events.push(event));
  engines.push(engine);
  return { engine, events, transcript };
}

async function waitForCommands(
  transcript: string,
  count: number,
  timeout = 2000,
): Promise<unknown[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const raw = await readFile(transcript, "utf8");
      const lines = raw.split("\n").filter(Boolean);
      if (lines.length >= count) return lines.map((line) => JSON.parse(line));
    } catch {
      /* transcript not written yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  try {
    return (await readFile(transcript, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function waitForEvent<T extends AudioEngineEvent["type"]>(
  events: AudioEngineEvent[],
  type: T,
  timeout = 1500,
): Promise<Extract<AudioEngineEvent, { type: T }>> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = events.find((event) => event.type === type) as
      Extract<AudioEngineEvent, { type: T }> | undefined;
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`event "${type}" not received within ${timeout}ms`);
}

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  micOutputDeviceId: "1:Cable",
  monitorDeviceId: "0:Speakers",
  masterMicVolume: 0.9,
  monitorVolume: 0.8,
  overlap: "stop",
};

function clip(overrides: Partial<SoundClip> & { id: string }): SoundClip {
  return {
    id: overrides.id,
    name: overrides.name ?? "clip",
    filePath: overrides.filePath ?? "/clip.wav",
    favorite: false,
    volume: overrides.volume ?? 1,
    trimStart: overrides.trimStart ?? 0,
    trimEnd: overrides.trimEnd ?? 0,
    loop: overrides.loop ?? false,
    broadcast: overrides.broadcast ?? true,
  };
}

describe("AudioEngine bridge", () => {
  it("completes the ready handshake and sends configure on start", async () => {
    const { engine, transcript } = makeEngine();
    await engine.start(baseSettings);
    const [configure] = (await waitForCommands(transcript, 1)) as [
      Record<string, unknown>,
    ];
    expect(configure).toEqual({
      type: "configure",
      micOutputDeviceId: "1:Cable",
      monitorDeviceId: "0:Speakers",
      realMicDeviceId: null,
      passthrough: false,
      micVolume: 0.9,
      monitorVolume: 0.8,
      monitorEnabled: true,
      overlap: "stop",
    });
  });

  it("maps listDevices output into micOutputs/monitors/realMics", async () => {
    const { engine } = makeEngine();
    await engine.start(baseSettings);
    const devices = await engine.listDevices();
    expect(devices.micOutputs).toEqual([
      { id: "0:Speakers", label: "Speakers" },
      { id: "1:Cable", label: "CABLE Input" },
    ]);
    expect(devices.monitors).toEqual(devices.micOutputs);
    expect(devices.realMics).toEqual([{ id: "0:Mic", label: "Microphone" }]);
  });

  it("can enumerate outputs without touching permission-gated inputs", async () => {
    const { engine, transcript } = makeEngine();
    await engine.start(baseSettings);

    const devices = await engine.listDevices(false);
    expect(devices.micOutputs).toHaveLength(2);
    expect(devices.monitors).toHaveLength(2);
    expect(devices.realMics).toEqual([]);

    const commands = (await waitForCommands(transcript, 2)) as Record<
      string,
      unknown
    >[];
    expect(commands.find((command) => command.type === "listDevices")).toEqual({
      type: "listDevices",
      includeInputs: false,
    });
  });

  it("routes a broadcast clip to both buses and a monitor-only clip to one", async () => {
    const { engine, transcript } = makeEngine();
    await engine.start({ ...baseSettings, micOnly: false });

    await engine.playBoth(
      clip({
        id: "c1",
        name: "A",
        filePath: "/a.wav",
        volume: 0.6,
        trimStart: 0.25,
        trimEnd: 0.5,
        loop: true,
      }),
    );
    await engine.playBoth(
      clip({
        id: "c2",
        name: "B",
        filePath: "/b.wav",
        volume: 0.4,
        broadcast: false,
      }),
    );

    const plays = (await waitForCommands(transcript, 3)).filter(
      (cmd) => (cmd as { type: string }).type === "play",
    );
    expect(plays).toEqual([
      {
        type: "play",
        bus: "mic",
        clipId: "c1",
        path: "/a.wav",
        volume: 0.6,
        trimStart: 0.25,
        trimEnd: 0.5,
        looped: true,
      },
      {
        type: "play",
        bus: "monitor",
        clipId: "c1",
        path: "/a.wav",
        volume: 0.6,
        trimStart: 0.25,
        trimEnd: 0.5,
        looped: true,
      },
      {
        type: "play",
        bus: "monitor",
        clipId: "c2",
        path: "/b.wav",
        volume: 0.4,
        trimStart: 0,
        trimEnd: 0,
        looped: false,
      },
    ]);
  });

  it("fully disables native monitor routing in mic-only mode", async () => {
    const { engine, transcript } = makeEngine();
    await engine.start({ ...baseSettings, micOnly: true });

    await engine.playBoth(clip({ id: "mic-only" }));
    await engine.playToMonitor(clip({ id: "preview" }));

    const commands = (await waitForCommands(transcript, 2)) as Record<
      string,
      unknown
    >[];
    expect(commands[0]).toMatchObject({
      type: "configure",
      monitorEnabled: false,
    });
    expect(commands.filter((command) => command.type === "play")).toEqual([
      expect.objectContaining({ bus: "mic", clipId: "mic-only" }),
    ]);
  });

  it("emits synthetic transport events alongside the native commands", async () => {
    const { engine, events, transcript } = makeEngine();
    await engine.start(baseSettings);

    engine.pauseMic();
    engine.stopMonitor();
    engine.stopAll();

    const cmds = (await waitForCommands(transcript, 4)) as Record<
      string,
      unknown
    >[];
    const of = (type: string) => cmds.filter((cmd) => cmd.type === type);
    expect(of("pause")).toEqual([{ type: "pause", bus: "mic" }]);
    expect(of("stop")).toEqual([{ type: "stop", bus: "monitor" }]);
    expect(of("stopAll")).toEqual([{ type: "stopAll" }]);

    expect(events.filter((event) => event.type === "transport")).toEqual([
      { type: "transport", bus: "mic", state: "paused" },
      { type: "transport", bus: "monitor", state: "stopped" },
      { type: "transport", bus: "mic", state: "stopped" },
      { type: "transport", bus: "monitor", state: "stopped" },
    ]);
  });

  it("clamps bus volume to 0..1 and forwards mute commands", async () => {
    const { engine, events, transcript } = makeEngine();
    await engine.start(baseSettings);

    engine.setMicVolume(5);
    engine.setMonitorVolume(-1);
    engine.setMicMute(true);

    const cmds = (await waitForCommands(transcript, 4)) as Record<
      string,
      unknown
    >[];
    expect(cmds.filter((cmd) => cmd.type === "setVolume")).toContainEqual({
      type: "setVolume",
      bus: "mic",
      volume: 1,
    });
    expect(cmds.filter((cmd) => cmd.type === "setVolume")).toContainEqual({
      type: "setVolume",
      bus: "monitor",
      volume: 0,
    });
    expect(cmds.filter((cmd) => cmd.type === "setMute")).toEqual([
      { type: "setMute", bus: "mic", muted: true },
    ]);
    expect(events.filter((event) => event.type === "mute")).toEqual([
      { type: "mute", bus: "mic", muted: true },
    ]);
  });

  it("forwards meter, clipEnded, and error events from the sidecar", async () => {
    const meterSession = makeEngine({ FAKE_METER: "1" });
    await meterSession.engine.start(baseSettings);
    const meter = await waitForEvent(meterSession.events, "meter");
    expect(meter).toEqual({ type: "meter", mic: 0.5, monitor: 0.25 });

    const endedSession = makeEngine({ FAKE_CLIP_ENDED: "1" });
    await endedSession.engine.start(baseSettings);
    await endedSession.engine.playToMonitor(
      clip({ id: "c9", filePath: "/x.wav" }),
    );
    const ended = await waitForEvent(endedSession.events, "clipEnded");
    expect(ended).toEqual({ type: "clipEnded", bus: "monitor", clipId: "c9" });

    const errorSession = makeEngine({ FAKE_ERROR: "1" });
    await errorSession.engine.start(baseSettings);
    const error = await waitForEvent(errorSession.events, "error");
    expect(error.message).toBe("boom");
  });

  it("reconfigures only when routing fields change, else just adjusts volume", async () => {
    const { engine, transcript } = makeEngine();
    await engine.start(baseSettings); // configure (#1)

    engine.applySettings(baseSettings); // same routing -> setVolume x2 (#2, #3)
    engine.applySettings({ ...baseSettings, monitorDeviceId: "9:Other" }); // configure (#4)

    const cmds = (await waitForCommands(transcript, 4)) as Record<
      string,
      unknown
    >[];
    expect(cmds[1]).toEqual({ type: "setVolume", bus: "mic", volume: 0.9 });
    expect(cmds[2]).toEqual({ type: "setVolume", bus: "monitor", volume: 0.8 });
    expect(cmds[3]).toEqual({
      type: "configure",
      micOutputDeviceId: "1:Cable",
      monitorDeviceId: "9:Other",
      realMicDeviceId: null,
      passthrough: false,
      micVolume: 0.9,
      monitorVolume: 0.8,
      monitorEnabled: true,
      overlap: "stop",
    });
  });

  it("reports a startup error when the sidecar never signals ready", async () => {
    const { engine, events } = makeEngine(
      { FAKE_NO_READY: "1" },
      { startupTimeout: 200 },
    );
    await engine.start(baseSettings);
    const error = await waitForEvent(events, "error");
    expect(error.message).toMatch(/timed out/);
  });

  it("reports an error when the sidecar exits unexpectedly", async () => {
    const { engine, events } = makeEngine({ FAKE_EXIT: "1" });
    await engine.start(baseSettings);
    const error = await waitForEvent(events, "error");
    expect(error.message).toMatch(/unexpectedly/);
  });

  it("returns empty devices when listDevices times out", async () => {
    const { engine } = makeEngine(
      { FAKE_NO_DEVICES: "1" },
      { deviceTimeout: 150 },
    );
    await engine.start(baseSettings);
    expect(await engine.listDevices()).toEqual({
      micOutputs: [],
      monitors: [],
      realMics: [],
    });
  });

  it("sends shutdown and terminates the sidecar", async () => {
    const { engine, transcript } = makeEngine();
    await engine.start(baseSettings);
    engine.shutdown();
    // The bridge gives the sidecar a short graceful-exit window before its
    // kill fallback and drops readiness immediately so later calls are no-ops.
    const cmds = (await waitForCommands(transcript, 2)) as Record<
      string,
      unknown
    >[];
    const types = cmds.map((cmd) => cmd.type);
    expect(types.some((t) => t === "shutdown" || t === "terminated")).toBe(
      true,
    );
    expect(await engine.listDevices()).toEqual({
      micOutputs: [],
      monitors: [],
      realMics: [],
    });
  });

  it("kills a sidecar that is blocked during graceful shutdown", async () => {
    const { engine, transcript } = makeEngine({
      FAKE_IGNORE_SHUTDOWN: "1",
    });
    await engine.start(baseSettings);
    engine.shutdown();

    const commands = (await waitForCommands(transcript, 3)) as Record<
      string,
      unknown
    >[];
    expect(commands.map((command) => command.type)).toEqual(
      expect.arrayContaining(["shutdown", "terminated"]),
    );
  });
});
