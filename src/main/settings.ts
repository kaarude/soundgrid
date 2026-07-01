import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, Settings } from "../shared/types.js";

export class SettingsStore {
  private filePath = "";
  private settings: Settings = { ...DEFAULT_SETTINGS };

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
    const temporary = `${this.filePath}.tmp`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      temporary,
      JSON.stringify(this.settings, null, 2),
      "utf8",
    );
    await fs.rename(temporary, this.filePath);
  }
}

export function sanitizeSettings(value: Partial<Settings>): Settings {
  const theme = ["dark", "light", "system"].includes(value.theme ?? "")
    ? value.theme!
    : DEFAULT_SETTINGS.theme;
  const overlap = ["stop", "overlap", "queue"].includes(value.overlap ?? "")
    ? value.overlap!
    : DEFAULT_SETTINGS.overlap;
  const micOnly = Boolean(value.micOnly);
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    theme,
    overlap,
    masterMicVolume: clamp01(value.masterMicVolume),
    monitorVolume: clamp01(value.monitorVolume),
    micOnly,
    headsetOnly: micOnly ? false : Boolean(value.headsetOnly),
  };
}

function clamp01(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
}

async function backupCorruptFile(filePath: string): Promise<void> {
  try {
    await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
  } catch {
    // The source may have disappeared between read and recovery.
  }
}
