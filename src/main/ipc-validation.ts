import { Settings, SoundClipPatch } from "../shared/types.js";

const MAX_STRING_LENGTH = 4_096;
const MAX_IMPORT_FILES = 256;
const MAX_HOTKEY_BINDINGS = 512;

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value.length > MAX_STRING_LENGTH) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value;
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${field} must be a boolean.`);
  }
  return value;
}

export function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number.`);
  }
  return value;
}

export function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_IMPORT_FILES) {
    throw new TypeError(`${field} must be an array of file paths.`);
  }
  return value.map((item, index) => requireString(item, `${field}[${index}]`));
}

export function validateSettingsPatch(value: unknown): Partial<Settings> {
  const input = requireRecord(value, "settings patch");
  const patch: Partial<Settings> = {};

  for (const [key, raw] of Object.entries(input)) {
    switch (key) {
      case "micOutputDeviceId":
      case "monitorDeviceId":
      case "realMicDeviceId":
        patch[key] = requireNullableString(raw, key);
        break;
      case "passthrough":
      case "headsetOnly":
      case "micOnly":
      case "runOnStartup":
      case "minimizeToTray":
      case "autoSelectMic":
      case "onboardingComplete":
        patch[key] = requireBoolean(raw, key);
        break;
      case "masterMicVolume":
      case "monitorVolume":
        patch[key] = requireFiniteNumber(raw, key);
        break;
      case "overlap":
        if (raw !== "stop" && raw !== "overlap" && raw !== "queue") {
          throw new TypeError("overlap must be stop, overlap, or queue.");
        }
        patch.overlap = raw;
        break;
      case "theme":
        if (raw !== "dark" && raw !== "light" && raw !== "system") {
          throw new TypeError("theme must be dark, light, or system.");
        }
        patch.theme = raw;
        break;
      case "stopAllHotkey":
      case "micMuteHotkey":
        patch[key] = requireOptionalString(raw, key);
        break;
      default:
        throw new TypeError(`Unsupported settings field: ${key}`);
    }
  }

  return patch;
}

export function validateSoundClipPatch(value: unknown): SoundClipPatch {
  const input = requireRecord(value, "clip patch");
  const patch: SoundClipPatch = {};

  for (const [key, raw] of Object.entries(input)) {
    switch (key) {
      case "name":
        patch.name = requireString(raw, key);
        break;
      case "favorite":
      case "loop":
      case "broadcast":
        patch[key] = requireBoolean(raw, key);
        break;
      case "volume":
        patch.volume = requireFiniteNumber(raw, key);
        break;
      case "hotkey":
        patch.hotkey = requireNullableString(raw, key);
        break;
      default:
        throw new TypeError(`Unsupported clip field: ${key}`);
    }
  }

  return patch;
}

export function validateHotkeyBindings(
  value: unknown,
): { id: string; keys: string }[] {
  if (!Array.isArray(value) || value.length > MAX_HOTKEY_BINDINGS) {
    throw new TypeError("hotkey bindings must be an array.");
  }
  return value.map((item, index) => {
    const binding = requireRecord(item, `hotkey bindings[${index}]`);
    return {
      id: requireString(binding.id, `hotkey bindings[${index}].id`),
      keys: requireString(binding.keys, `hotkey bindings[${index}].keys`),
    };
  });
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireString(value, field);
}

function requireOptionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === "") return undefined;
  return requireString(value, field);
}
