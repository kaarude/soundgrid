// ---------------------------------------------------------------------------
// HotkeyManager
//
// Global hotkeys that fire even when SoundGrid is minimized, so you can
// trigger a clip mid-game. On Windows this is `globalShortcut` from
// Electron (which uses RegisterHotKey under the hood). Accelerator strings
// follow Electron's format: e.g. "CommandOrControl+Shift+S".
//
// Special binding ids:
//   __stop_all__ - stop every playing clip
//   __mic_mute__ - toggle the mic bus mute
// any other id   - a SoundClip id; plays it on the mic bus.
//
// NOTE: Electron globalShortcut is global to the OS, not per-clip-limited.
// A production build may want a low-level keyboard hook for "hold to play"
// style triggers; that requires a native module and is out of scope here.
// ---------------------------------------------------------------------------

import { globalShortcut } from "electron";
import { HotkeyRegistrationResult } from "../shared/types.js";

export class HotkeyManager {
  private registered = new Set<string>();

  registerAll(
    bindings: { id: string; keys: string }[],
    onFire: (id: string) => void,
  ): HotkeyRegistrationResult {
    this.unregisterAll();
    const failures: HotkeyRegistrationResult["failures"] = [];
    for (const { id, keys } of bindings) {
      if (!keys) continue;
      const accel = this.normalize(keys);
      if (!accel) {
        failures.push({ id, keys, reason: "invalid" });
        continue;
      }
      try {
        const ok = globalShortcut.register(accel, () => onFire(id));
        if (ok) this.registered.add(accel);
        else failures.push({ id, keys, reason: "unavailable" });
      } catch {
        failures.push({ id, keys, reason: "invalid" });
      }
    }
    return { registered: [...this.registered], failures };
  }

  unregisterAll() {
    for (const accel of this.registered) {
      try {
        globalShortcut.unregister(accel);
      } catch {
        /* already unregistered */
      }
    }
    this.registered.clear();
  }

  private normalize(keys: string): string {
    // Map common aliases to Electron accelerator syntax.
    return keys
      .replace(/\bCtrl\b/gi, "CommandOrControl")
      .replace(/\bCmd\b/gi, "CommandOrControl")
      .replace(/\bWin\b/gi, "Super")
      .replace(/\bAlt\b/gi, "Alt")
      .replace(/\bShift\b/gi, "Shift")
      .trim();
  }
}
