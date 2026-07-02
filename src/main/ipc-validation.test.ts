import { describe, expect, it } from "vitest";
import {
  requireFiniteNumber,
  requireStringArray,
  validateBulkClipPatch,
  validateHotkeyBindings,
  validateSettingsPatch,
  validateSoundClipPatch,
} from "./ipc-validation";

describe("IPC validation", () => {
  it("rejects malformed file import arguments", () => {
    expect(requireStringArray(["/tmp/a.wav"], "filePaths")).toEqual([
      "/tmp/a.wav",
    ]);
    expect(() => requireStringArray([""], "filePaths")).toThrow("filePaths[0]");
    expect(() => requireStringArray("not-an-array", "filePaths")).toThrow(
      "filePaths",
    );
  });

  it("rejects unknown settings fields instead of persisting them", () => {
    expect(validateSettingsPatch({ passthrough: false })).toEqual({
      passthrough: false,
    });
    expect(() => validateSettingsPatch({ passthrough: "yes" })).toThrow(
      "passthrough",
    );
    expect(() => validateSettingsPatch({ admin: true })).toThrow(
      "Unsupported settings field",
    );
  });

  it("rejects non-finite numeric IPC values", () => {
    expect(requireFiniteNumber(0.5, "volume")).toBe(0.5);
    expect(() => requireFiniteNumber(Number.NaN, "volume")).toThrow("volume");
    expect(() => requireFiniteNumber(Infinity, "volume")).toThrow("volume");
  });

  it("validates clip patch and hotkey binding shapes", () => {
    expect(validateSoundClipPatch({ name: "Airhorn", volume: 0.8 })).toEqual({
      name: "Airhorn",
      volume: 0.8,
    });
    expect(() => validateSoundClipPatch({ filePath: "/tmp/evil.wav" })).toThrow(
      "Unsupported clip field",
    );
    expect(validateHotkeyBindings([{ id: "clip", keys: "Alt+A" }])).toEqual([
      { id: "clip", keys: "Alt+A" },
    ]);
    expect(() => validateHotkeyBindings([{ id: "clip" }])).toThrow("keys");
  });

  it("validates bulk clip patches and rejects unique-per-clip fields", () => {
    expect(
      validateBulkClipPatch({ favorite: true, broadcast: false, volume: 0.5 }),
    ).toEqual({ favorite: true, broadcast: false, volume: 0.5 });
    // name and hotkey are unique per clip, so they are blocked from bulk edits.
    expect(() => validateBulkClipPatch({ name: "All the same" })).toThrow(
      "Unsupported bulk clip field",
    );
    expect(() => validateBulkClipPatch({ hotkey: "Control+H" })).toThrow(
      "Unsupported bulk clip field",
    );
    expect(() => validateBulkClipPatch({ filePath: "/tmp/evil.wav" })).toThrow(
      "Unsupported bulk clip field",
    );
  });
});
