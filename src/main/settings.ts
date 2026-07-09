import { promises as fs } from "node:fs";
import { DEFAULT_SETTINGS, Settings } from "../shared/types.js";
import { SerializedFileWriter } from "./serialized-file-writer.js";

export class SettingsStore {
  private filePath = "";
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private writer = new SerializedFileWriter();

  async init(filePath: string) {
    this.filePath = filePath;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      this.settings = sanitizeSettings({
        ...DEFAULT_SETTINGS,
        ...(JSON.parse(raw) as Partial<Settings>),
      });
    } catch (error) {
      if (error instanceof SyntaxError) await backupCorruptFile(filePath);
      this.settings = { ...DEFAULT_SETTINGS };
      await this.persist();
    }
  }

  get(): Settings {
    return { ...this.settings };
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    await this.persist();
    return this.get();
  }

  private async persist() {
    await this.writer.write(
      this.filePath,
      JSON.stringify(this.settings, null, 2),
    );
  }
}

export function sanitizeSettings(value: Partial<Settings>): Settings {
  const theme = ["dark", "light", "system"].includes(value.theme ?? "")
    ? value.theme!
    : DEFAULT_SETTINGS.theme;
  const overlap = ["stop", "overlap", "queue"].includes(value.overlap ?? "")
    ? value.overlap!
    : DEFAULT_SETTINGS.overlap;
  const micOutputDeviceId = nullableString(value.micOutputDeviceId);
  const monitorDeviceId = nullableString(value.monitorDeviceId);
  const realMicDeviceId = nullableString(value.realMicDeviceId);
  const micOnly = bool(value.micOnly, DEFAULT_SETTINGS.micOnly);
  const passthrough =
    bool(value.passthrough, DEFAULT_SETTINGS.passthrough) &&
    Boolean(micOutputDeviceId && realMicDeviceId);
  return {
    micOutputDeviceId,
    monitorDeviceId,
    realMicDeviceId,
    passthrough,
    theme,
    overlap,
    masterMicVolume: clamp01(
      value.masterMicVolume,
      DEFAULT_SETTINGS.masterMicVolume,
    ),
    monitorVolume: clamp01(value.monitorVolume, DEFAULT_SETTINGS.monitorVolume),
    stopAllHotkey: optionalString(value.stopAllHotkey),
    micMuteHotkey: optionalString(value.micMuteHotkey),
    micOnly,
    headsetOnly: micOnly
      ? false
      : bool(value.headsetOnly, DEFAULT_SETTINGS.headsetOnly),
    runOnStartup: bool(value.runOnStartup, DEFAULT_SETTINGS.runOnStartup),
    minimizeToTray: bool(value.minimizeToTray, DEFAULT_SETTINGS.minimizeToTray),
    autoSelectMic: bool(value.autoSelectMic, DEFAULT_SETTINGS.autoSelectMic),
    onboardingComplete: bool(
      value.onboardingComplete,
      DEFAULT_SETTINGS.onboardingComplete,
    ),
  };
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

async function backupCorruptFile(filePath: string): Promise<void> {
  try {
    await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
  } catch {
    // The source may have disappeared between read and recovery.
  }
}
