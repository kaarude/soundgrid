import { SoundClip } from "./types.js";

export type ClipBus = "mic" | "monitor";

export function clipBuses(clip: SoundClip, micOnly: boolean): ClipBus[] {
  const buses: ClipBus[] = [];
  if (clip.broadcast) buses.push("mic");
  if (!micOnly) buses.push("monitor");
  return buses;
}
