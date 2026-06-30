import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LibraryFile, SoundClip, SoundClipPatch } from "../shared/types.js";

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
      this.clips = parseLibrary(raw);
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
    if (isInsideDir(clip.filePath, this.soundsDir)) {
      try {
        await fs.unlink(clip.filePath);
      } catch {
        /* file already gone */
      }
    }
    this.clips = this.clips.filter((c) => c.id !== id);
    await this.persist();
  }

  async updateClip(id: string, patch: SoundClipPatch) {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) return;
    const next = sanitizeClipPatch(patch);
    Object.assign(clip, next);
    await this.persist();
  }

  private async persist() {
    const file: LibraryFile = { clips: this.clips };
    await fs.writeFile(
      this.dbPath,
      JSON.stringify(file, null, 2),
      "utf8",
    );
  }
}

function parseLibrary(raw: string): SoundClip[] {
  const parsed = JSON.parse(raw) as SoundClip[] | LibraryFile;
  const clips = Array.isArray(parsed) ? parsed : parsed.clips;
  if (!Array.isArray(clips)) return [];
  return clips.filter(isSoundClip).map(normalizeClip);
}

function isSoundClip(value: unknown): value is SoundClip {
  if (!value || typeof value !== "object") return false;
  const clip = value as Partial<SoundClip>;
  return (
    typeof clip.id === "string" &&
    typeof clip.name === "string" &&
    typeof clip.filePath === "string"
  );
}

function normalizeClip(clip: SoundClip): SoundClip {
  return {
    ...clip,
    category: clip.category || "Uncategorized",
    volume: clamp01(Number.isFinite(clip.volume) ? clip.volume : 1),
    loop: Boolean(clip.loop),
    broadcast: clip.broadcast !== false,
  };
}

function sanitizeClipPatch(patch: SoundClipPatch): SoundClipPatch {
  const next: SoundClipPatch = {};
  if (typeof patch.name === "string") next.name = patch.name.slice(0, 120);
  if (typeof patch.category === "string") {
    next.category = patch.category.slice(0, 80) || "Uncategorized";
  }
  if (typeof patch.hotkey === "string") next.hotkey = patch.hotkey.slice(0, 80);
  else if (patch.hotkey === undefined) next.hotkey = undefined;
  if (typeof patch.volume === "number") next.volume = clamp01(patch.volume);
  if (typeof patch.loop === "boolean") next.loop = patch.loop;
  if (typeof patch.broadcast === "boolean") next.broadcast = patch.broadcast;
  return next;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isInsideDir(filePath: string, dir: string): boolean {
  const rel = path.relative(dir, filePath);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}
