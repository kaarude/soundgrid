import { promises as fs } from "node:fs";
import { DEFAULT_SETTINGS, Settings } from "../shared/types.js";

export class SettingsStore {
  private filePath = "";
  private settings: Settings = { ...DEFAULT_SETTINGS };

  async init(filePath: string) {
    this.filePath = filePath;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(JSON.parse(raw) as Partial<Settings>),
      };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
      await this.persist();
    }
  }

  get(): Settings {
    return { ...this.settings };
  }

  set(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch };
    this.persist().catch(() => undefined);
    return this.get();
  }

  private async persist() {
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.settings, null, 2),
      "utf8",
    );
  }
}
