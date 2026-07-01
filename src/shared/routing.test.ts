import { describe, expect, it } from "vitest";
import { clipBuses } from "./routing";
import { SoundClip } from "./types";

const clip = (broadcast: boolean): SoundClip => ({
  id: "clip",
  name: "Clip",
  filePath: "/clip.wav",
  favorite: false,
  volume: 1,
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
