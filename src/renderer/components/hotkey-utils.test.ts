import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SoundClip } from "../../shared/types";
import {
  findHotkeyConflict,
  normalizeAccelerator,
  validateAccelerator,
} from "./hotkey-utils";

const clips: SoundClip[] = [
  {
    id: "one",
    name: "Air horn",
    filePath: "/one.wav",
    favorite: false,
    hotkey: "CommandOrControl+H",
    volume: 1,
    loop: false,
    broadcast: true,
  },
];

describe("hotkey utilities", () => {
  it("normalizes common accelerator aliases", () => {
    expect(normalizeAccelerator("ctrl + shift + a")).toBe(
      "CommandOrControl+Shift+A",
    );
  });

  it("rejects modifier-only and unsafe bare shortcuts", () => {
    expect(validateAccelerator("CommandOrControl")).toContain("non-modifier");
    expect(validateAccelerator("A")).toContain("modifier");
    expect(validateAccelerator("F9")).toBeNull();
    expect(validateAccelerator("CommandOrControl+A")).toBeNull();
  });

  it("detects clip and global conflicts", () => {
    expect(
      findHotkeyConflict("two", "CommandOrControl+H", clips, DEFAULT_SETTINGS),
    ).toBe("Air horn");
    expect(
      findHotkeyConflict("two", "Alt+S", clips, {
        ...DEFAULT_SETTINGS,
        stopAllHotkey: "Alt+S",
      }),
    ).toBe("Stop all");
  });
});
