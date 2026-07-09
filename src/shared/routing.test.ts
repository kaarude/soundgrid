import { describe, expect, it } from "vitest";
import {
  clipBuses,
  reconcileAudioRouting,
  selectableMonitorDevices,
} from "./routing";
import { AudioDevices, DEFAULT_SETTINGS, Settings, SoundClip } from "./types";

const clip = (broadcast: boolean): SoundClip => ({
  id: "clip",
  name: "Clip",
  filePath: "/clip.wav",
  favorite: false,
  volume: 1,
  trimStart: 0,
  trimEnd: 0,
  loop: false,
  broadcast,
});

describe("clipBuses", () => {
  it("routes broadcast clips to both buses", () => {
    expect(clipBuses(clip(true), false)).toEqual(["mic", "monitor"]);
  });

  it("never routes monitor-only clips to the mic", () => {
    expect(clipBuses(clip(false), false)).toEqual(["monitor"]);
    expect(clipBuses(clip(false), true)).toEqual([]);
  });

  it("honors global mic-only mode", () => {
    expect(clipBuses(clip(true), true)).toEqual(["mic"]);
  });
});

const devices: AudioDevices = {
  micOutputs: [
    { id: "speaker", label: "Desktop speakers" },
    { id: "cable", label: "CABLE Input (VB-Audio Virtual Cable)" },
  ],
  monitors: [
    { id: "speaker", label: "Desktop speakers" },
    { id: "headphones", label: "USB Headphones" },
  ],
  realMics: [{ id: "mic", label: "Studio Microphone" }],
};

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe("selectableMonitorDevices", () => {
  it("filters speaker-like outputs while headset-only mode is enabled", () => {
    expect(
      selectableMonitorDevices(devices, settings({ headsetOnly: true })),
    ).toEqual([{ id: "headphones", label: "USB Headphones" }]);
  });

  it("allows every monitor output when headset-only mode is disabled", () => {
    expect(
      selectableMonitorDevices(devices, settings({ headsetOnly: false })),
    ).toEqual(devices.monitors);
  });

  it("recognizes localized headphones and falls back safely for unknown labels", () => {
    const localized: AudioDevices = {
      ...devices,
      monitors: [
        { id: "a50", label: "Kopfhörer (A50 X Game)", kind: "headphones" },
        { id: "boxen", label: "Lautsprecher", kind: "speaker" },
      ],
    };
    expect(
      selectableMonitorDevices(localized, settings({ headsetOnly: true })),
    ).toEqual([localized.monitors[0]]);

    const unknown: AudioDevices = {
      ...devices,
      monitors: [{ id: "mystery", label: "Audioausgabe" }],
    };
    expect(
      selectableMonitorDevices(unknown, settings({ headsetOnly: true })),
    ).toEqual(unknown.monitors);
  });
});

describe("reconcileAudioRouting", () => {
  it("does not auto-enable microphone passthrough from defaults", () => {
    expect(DEFAULT_SETTINGS.passthrough).toBe(false);
    expect(
      reconcileAudioRouting(
        settings({
          micOutputDeviceId: null,
          monitorDeviceId: null,
          realMicDeviceId: null,
          autoSelectMic: true,
          headsetOnly: true,
        }),
        devices,
      ),
    ).toEqual({
      micOutputDeviceId: "cable",
      monitorDeviceId: "headphones",
    });
  });

  it("auto-selects the cable, headphones, and real mic when routes are empty", () => {
    expect(
      reconcileAudioRouting(
        settings({
          micOutputDeviceId: null,
          monitorDeviceId: null,
          realMicDeviceId: null,
          autoSelectMic: true,
          headsetOnly: true,
          passthrough: true,
        }),
        devices,
      ),
    ).toEqual({
      micOutputDeviceId: "cable",
      monitorDeviceId: "headphones",
      realMicDeviceId: "mic",
    });
  });

  it("clears a speaker monitor when headset-only mode is enabled", () => {
    expect(
      reconcileAudioRouting(
        settings({
          monitorDeviceId: "speaker",
          autoSelectMic: false,
          headsetOnly: true,
        }),
        devices,
      ),
    ).toEqual({ monitorDeviceId: null });
  });

  it("leaves incomplete routes alone when auto-select is off", () => {
    expect(
      reconcileAudioRouting(
        settings({
          micOutputDeviceId: null,
          monitorDeviceId: null,
          realMicDeviceId: null,
          autoSelectMic: false,
          headsetOnly: false,
        }),
        devices,
      ),
    ).toEqual({});
  });

  it("selects BlackHole for the mic bus without treating it as a monitor", () => {
    const macDevices: AudioDevices = {
      micOutputs: [
        { id: "speakers", label: "MacBook Pro Speakers", kind: "speaker" },
        { id: "blackhole", label: "BlackHole 2ch", kind: "virtual" },
      ],
      monitors: [
        { id: "speakers", label: "MacBook Pro Speakers", kind: "speaker" },
        { id: "blackhole", label: "BlackHole 2ch", kind: "virtual" },
      ],
      realMics: [
        { id: "mic", label: "MacBook Pro Microphone", kind: "microphone" },
      ],
    };
    expect(
      reconcileAudioRouting(
        settings({ headsetOnly: false, autoSelectMic: true }),
        macDevices,
      ),
    ).toEqual({
      micOutputDeviceId: "blackhole",
      monitorDeviceId: "speakers",
    });
  });

  it("does not route the mic bus to physical speakers when no cable exists", () => {
    const physicalOnly: AudioDevices = {
      micOutputs: [{ id: "speakers", label: "MacBook Pro Speakers" }],
      monitors: [{ id: "speakers", label: "MacBook Pro Speakers" }],
      realMics: [],
    };
    expect(
      reconcileAudioRouting(
        settings({ headsetOnly: false, autoSelectMic: true }),
        physicalOnly,
      ),
    ).toEqual({ monitorDeviceId: "speakers" });
  });
});
