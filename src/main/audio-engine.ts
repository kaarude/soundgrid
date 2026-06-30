import { SoundClip } from "../shared/types.js";

// ---------------------------------------------------------------------------
// AudioEngine
//
// SoundGrid uses TWO independent audio buses, exactly as the plan describes:
//
//   mic bus     -> the selected "mic output" device (virtual audio cable).
//                  This is what other apps (Discord, OBS, games) hear as your mic.
//   monitor bus -> your headset / headphones. Only YOU hear this.
//
// Each bus has its own play / pause / stop / volume / mute state. They are
// fully decoupled: pausing the mic bus does NOT pause the monitor bus.
//
// IMPLEMENTATION NOTE (the hard part):
// Real "play into the microphone" is not a capability of the Web Audio API or
// of Electron on its own. It requires a virtual audio device on the system.
// On Windows the user installs a free virtual cable (e.g. VB-CABLE) and we
// send the mic bus to that device's name; other apps then select that cable
// as their microphone. Mixing in the real physical mic is done by capturing
// it via getUserMedia and summing into the mic-bus graph.
//
// On macOS (dev) we cannot truly inject into a mic, so the mic bus falls back
// to a normal output device so the UI/transport can be developed and tested.
// The Windows production build uses a native WASAPI helper (planned) to
// render the mic bus to the chosen virtual device directly.
// ---------------------------------------------------------------------------

interface PlayingClip {
  clip: SoundClip;
  startedAt: number;
  paused: boolean;
}

export class AudioEngine {
  // On a real build these are AudioContext graphs. We keep lightweight state
  // here so the UI transport works during development and the surface matches
  // what the native audio helper will plug into.
  private micPlaying: Map<string, PlayingClip> = new Map();
  private monitorPlaying: PlayingClip | null = null;

  private micMuted = false;
  private micVolume = 0.9;
  private monitorVolume = 0.8;

  // ---- Mic bus ----
  async playToMic(clip: SoundClip | undefined) {
    if (!clip) return;
    this.micPlaying.set(clip.id, {
      clip,
      startedAt: Date.now(),
      paused: false,
    });
    // TODO(win): route decoded PCM to the selected virtual audio cable device.
  }

  pauseMic() {
    for (const p of this.micPlaying.values()) p.paused = true;
  }

  resumeMic() {
    for (const p of this.micPlaying.values()) p.paused = false;
  }

  stopMic() {
    this.micPlaying.clear();
  }

  stopAll() {
    this.stopMic();
    this.stopMonitor();
  }

  setMicMute(muted: boolean) {
    this.micMuted = muted;
  }

  toggleMicMute() {
    this.micMuted = !this.micMuted;
    return this.micMuted;
  }

  setMicVolume(v: number) {
    this.micVolume = Math.max(0, Math.min(1, v));
  }

  isMicMuted() {
    return this.micMuted;
  }

  // ---- Monitor bus (headphones only) ----
  async playToMonitor(clip: SoundClip | undefined) {
    if (!clip) return;
    this.monitorPlaying = { clip, startedAt: Date.now(), paused: false };
    // TODO: play through the Web Audio API to the selected monitor device.
  }

  pauseMonitor() {
    if (this.monitorPlaying) this.monitorPlaying.paused = true;
  }

  stopMonitor() {
    this.monitorPlaying = null;
  }

  setMonitorVolume(v: number) {
    this.monitorVolume = Math.max(0, Math.min(1, v));
  }

  getMicVolume() {
    return this.micVolume;
  }

  getMonitorVolume() {
    return this.monitorVolume;
  }
}
