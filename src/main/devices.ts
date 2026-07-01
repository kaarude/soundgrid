import { AudioDevices } from "../shared/types.js";
import { AudioEngine } from "./audio-engine.js";

// ---------------------------------------------------------------------------
// DeviceManager
//
// Enumerates the audio devices we need to populate the settings dropdowns:
//
//   micOutputs  - devices we can send the "mic bus" to. On Windows this is
//                 typically the user's installed virtual audio cable(s).
//                 We list playback devices here because, for a virtual cable,
//                 you "play" audio to it and other apps read it as a mic.
//   monitors    - real playback devices (headphones, speakers). The monitor
//                 bus goes here. When `headsetOnly` is on, we restrict this to
//                 headphone-style devices so nothing leaks to speakers.
//   realMics    - physical microphones we mix in (passthrough).
//
// A full implementation uses the native WASAPI/CoreAudio enumeration. On the
// dev platform we fall back to MediaDevices in the renderer, surfaced here
// as an empty list and filled in lazily.
// ---------------------------------------------------------------------------

export class DeviceManager {
  constructor(private readonly audio: AudioEngine) {}

  list(): Promise<AudioDevices> {
    return this.audio.listDevices();
  }
}
