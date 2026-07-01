import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/types";
import { sanitizeSettings } from "./settings";

describe("settings validation", () => {
  it("clamps volume and rejects unsupported enum values", () => {
    const settings = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      masterMicVolume: 9,
      monitorVolume: -2,
      theme: "sepia" as "dark",
      overlap: "replace" as "stop",
    });

    expect(settings.masterMicVolume).toBe(1);
    expect(settings.monitorVolume).toBe(0);
    expect(settings.theme).toBe("dark");
    expect(settings.overlap).toBe("stop");
  });

  it("prevents contradictory local listening modes", () => {
    const settings = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      micOnly: true,
      headsetOnly: true,
    });

    expect(settings.micOnly).toBe(true);
    expect(settings.headsetOnly).toBe(false);
  });
});
