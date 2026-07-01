import { Settings, SoundClip } from "../../shared/types";

const MODIFIERS = new Set(["CommandOrControl", "Alt", "Shift", "Super"]);

export function captureHotkey(event: KeyboardEvent): string {
  if (
    event.key === "Escape" ||
    event.key === "Backspace" ||
    event.key === "Delete"
  ) {
    return "";
  }
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = normalizeKey(event.key);
  if (key && !MODIFIERS.has(key)) parts.push(key);
  return [...new Set(parts)].join("+");
}

export function normalizeAccelerator(value: string): string {
  return value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^(ctrl|control|cmd|command|meta)$/i.test(part))
        return "CommandOrControl";
      if (/^(win|windows|super)$/i.test(part)) return "Super";
      if (/^option$/i.test(part)) return "Alt";
      if (/^esc$/i.test(part)) return "Escape";
      if (part.length === 1) return part.toUpperCase();
      return part[0].toUpperCase() + part.slice(1);
    })
    .join("+");
}

export function validateAccelerator(value: string): string | null {
  if (!value) return null;
  const parts = value.split("+").filter(Boolean);
  if (!parts.some((part) => !MODIFIERS.has(part))) {
    return "Press a non-modifier key as part of the shortcut.";
  }
  if (
    !parts.some((part) => MODIFIERS.has(part)) &&
    !/^F\d{1,2}$/.test(parts[0])
  ) {
    return "Use at least one modifier key, or choose a function key.";
  }
  return null;
}

export function findHotkeyConflict(
  clipId: string,
  hotkey: string,
  clips: SoundClip[],
  settings: Settings,
): string | null {
  if (!hotkey) return null;
  const normalized = hotkey.toLowerCase();
  if (settings.stopAllHotkey?.toLowerCase() === normalized) return "Stop all";
  if (settings.micMuteHotkey?.toLowerCase() === normalized) return "Mic mute";
  const duplicate = clips.find(
    (clip) => clip.id !== clipId && clip.hotkey?.toLowerCase() === normalized,
  );
  return duplicate?.name ?? null;
}

export function formatHotkey(value: string): string {
  return value
    .replace(
      "CommandOrControl",
      navigator.platform.includes("Mac") ? "Cmd" : "Ctrl",
    )
    .replaceAll("+", " + ");
}

function normalizeKey(key: string): string {
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  if (key === " ") return "Space";
  const aliases: Record<string, string> = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Control: "CommandOrControl",
    Meta: "CommandOrControl",
    Alt: "Alt",
    Shift: "Shift",
    Escape: "Escape",
  };
  return aliases[key] ?? key;
}
