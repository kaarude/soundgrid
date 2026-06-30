import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SoundClip } from "../shared/types.js";

const SUPPORTED = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".flac",
  ".m4a",
  ".aac",
  ".opus",
  ".webm",
]);

function isSupported(file: string): boolean {
  return SUPPORTED.has(path.extname(file).toLowerCase());
}

export class LibraryStore {
  private dbPath = "";
  private soundsDir = "";
  private clips: SoundClip[] = [];

  async init(dbPath: string, soundsDir: string) {
    this.dbPath = dbPath;
    this.soundsDir = soundsDir;
    try {
      const raw = await fs.readFile(dbPath, "utf8");
      this.clips = JSON.parse(raw) as SoundClip[];
    } catch {
      this.clips = [];
      await this.persist();
    }
  }

  getClips(): SoundClip[] {
    return [...this.clips];
  }

  byId(id: string): SoundClip | undefined {
    return this.clips.find((c) => c.id === id);
  }

  async importFiles(filePaths: string[]): Promise<SoundClip[]> {
    const added: SoundClip[] = [];
    for (const file of filePaths) {
      if (!isSupported(file)) continue;
      const ext = path.extname(file);
      const id = randomUUID();
      const dest = path.join(this.soundsDir, `${id}${ext}`);
      await fs.copyFile(file, dest);
      const clip: SoundClip = {
        id,
        name: path.basename(file, ext),
        filePath: dest,
        category: "Uncategorized",
        volume: 1,
        loop: false,
        broadcast: true,
      };
      this.clips.push(clip);
      added.push(clip);
    }
    await this.persist();
    return added;
  }

  async removeClip(id: string) {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) return;
    try {
      await fs.unlink(clip.filePath);
    } catch {
      /* file already gone */
    }
    this.clips = this.clips.filter((c) => c.id !== id);
    await this.persist();
  }

  async updateClip(id: string, patch: Partial<SoundClip>) {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) return;
    Object.assign(clip, patch);
    await this.persist();
  }

  private async persist() {
    await fs.writeFile(
      this.dbPath,
      JSON.stringify(this.clips, null, 2),
      "utf8",
    );
  }
}
