// Shared types exchanged across the main <-> preload <-> renderer boundary.

export type OverlapBehavior = "stop" | "overlap" | "queue";

export interface SoundClip {
  id: string;
  name: string;
  filePath: string; // absolute path inside the library folder
  category: string;
  hotkey?: string;
  volume: number; // 0..1 per-clip gain
  loop: boolean;
  broadcast: boolean; // sent to mic output when true; monitor-only when false
}

export type SoundClipPatch = Partial<
  Pick<SoundClip, "name" | "category" | "hotkey" | "volume" | "loop" | "broadcast">
>;

export interface AudioDevices {
  micOutputs: AudioDevice[]; // virtual cables + playback devices we can route "mic" audio to
  monitors: AudioDevice[]; // real playback devices (headphones, speakers)
  realMics: AudioDevice[]; // real microphones we may mix in
}

export interface AudioDevice {
  id: string;
  label: string;
}

export type AudioEngineEvent =
  | { type: "meter"; mic: number; monitor: number }
  | { type: "clipEnded"; bus: "mic" | "monitor"; clipId: string }
  | {
      type: "transport";
      bus: "mic" | "monitor";
      state: "playing" | "paused" | "stopped";
      clipId?: string;
      name?: string;
    }
  | { type: "mute"; bus: "mic" | "monitor"; muted: boolean }
  | { type: "error"; message: string };

export interface CableStatus {
  supported: boolean;
  installed: boolean;
  canInstall: boolean;
  rebootRequired: boolean;
  message: string;
}

export interface Settings {
  micOutputDeviceId: string | null;
  monitorDeviceId: string | null;
  realMicDeviceId: string | null; // mixed in when passthrough ON
  passthrough: boolean; // mix real mic into the mic output
  masterMicVolume: number; // 0..1
  monitorVolume: number; // 0..1
  overlap: OverlapBehavior;
  stopAllHotkey?: string;
  micMuteHotkey?: string;
  headsetOnly: boolean; // never leak monitor audio to speakers
  micOnly: boolean; // send to mic only, silence locally
  theme: "dark" | "light" | "system";
  runOnStartup: boolean;
  minimizeToTray: boolean;
  autoSelectMic: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  micOutputDeviceId: null,
  monitorDeviceId: null,
  realMicDeviceId: null,
  passthrough: true,
  masterMicVolume: 0.9,
  monitorVolume: 0.8,
  overlap: "stop",
  stopAllHotkey: undefined,
  micMuteHotkey: undefined,
  headsetOnly: true,
  micOnly: false,
  theme: "dark",
  runOnStartup: false,
  minimizeToTray: true,
  autoSelectMic: true,
};

export interface LibraryFile {
  clips: SoundClip[];
}
