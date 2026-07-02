import {
  existsSync,
  promises as fs,
  statSync,
  watch,
  FSWatcher,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  ImportSkippedFile,
  LibraryFile,
  LibraryImportResult,
  SoundClip,
  SoundClipPatch,
} from "../shared/types.js";

const SUPPORTED = new Set([
  ".aif",
  ".aiff",
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".flac",
  ".m4a",
  ".aac",
  ".opus",
  ".webm",
  ".caf",
  ".mp4",
]);

function isSupported(file: string): boolean {
  return SUPPORTED.has(path.extname(file).toLowerCase());
}

export class LibraryStore {
  private dbPath = "";
  private soundsDir = "";
  private clips: SoundClip[] = [];
  private watcher?: FSWatcher;
  private watchTimer?: NodeJS.Timeout;

  async init(dbPath: string, soundsDir: string) {
    this.dbPath = dbPath;
    this.soundsDir = soundsDir;
    try {
      const raw = await fs.readFile(dbPath, "utf8");
      this.clips = parseLibrary(raw);
    } catch (error) {
      if (error instanceof SyntaxError) await backupCorruptFile(dbPath);
      this.clips = [];
      await this.persist();
    }
    await this.syncFolder();
  }

  getClips(): SoundClip[] {
    return this.clips.map((clip) => ({ ...clip }));
  }

  watch(onChange: (clips: SoundClip[]) => void): void {
    this.watcher?.close();
    this.watcher = watch(this.soundsDir, () => {
      clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(async () => {
        if (await this.syncFolder()) onChange(this.getClips());
      }, 250);
    });
  }

  close(): void {
    clearTimeout(this.watchTimer);
    this.watcher?.close();
    this.watcher = undefined;
  }

  private async syncFolder(): Promise<boolean> {
    const entries = await fs.readdir(this.soundsDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && isSupported(entry.name))
      .map((entry) => path.join(this.soundsDir, entry.name));
    const known = new Set(
      this.clips.map((clip) => path.resolve(clip.filePath)),
    );
    let changed = false;
    for (const clip of this.clips) {
      const missing = !existsSync(clip.filePath);
      if (Boolean(clip.missing) !== missing) {
        clip.missing = missing || undefined;
        changed = true;
      }
    }
    for (const filePath of files) {
      if (known.has(path.resolve(filePath))) continue;
      this.clips.push({
        id: randomUUID(),
        name: path.basename(filePath),
        filePath,
        favorite: false,
        volume: 1,
        loop: false,
        broadcast: true,
      });
      changed = true;
    }
    if (changed) await this.persist();
    return changed;
  }

  byId(id: string): SoundClip | undefined {
    return this.clips.find((c) => c.id === id);
  }

  async importFiles(filePaths: string[]): Promise<LibraryImportResult> {
    const added: SoundClip[] = [];
    const skipped: ImportSkippedFile[] = [];
    const knownSources = new Set(
      this.clips.map((clip) => path.resolve(clip.filePath)),
    );
    const seenImports = new Set<string>();
    const seenHashes = new Set<string>();
    const knownHashes = new Set<string>();
    for (const clip of this.clips) {
      if (!existsSync(clip.filePath)) continue;
      clip.contentHash ??= await hashFile(clip.filePath);
      knownHashes.add(clip.contentHash);
    }
    for (const file of filePaths) {
      if (!isSupported(file)) {
        skipped.push({ filePath: file, reason: "unsupported" });
        continue;
      }
      if (fileIsEmpty(file)) {
        skipped.push({ filePath: file, reason: "empty" });
        continue;
      }
      const resolved = path.resolve(file);
      if (knownSources.has(resolved) || seenImports.has(resolved)) {
        skipped.push({ filePath: file, reason: "duplicate" });
        continue;
      }
      const contentHash = await hashFile(file);
      if (knownHashes.has(contentHash) || seenHashes.has(contentHash)) {
        skipped.push({ filePath: file, reason: "duplicate" });
        continue;
      }
      seenImports.add(resolved);
      seenHashes.add(contentHash);
      const ext = path.extname(file);
      const id = randomUUID();
      const dest = path.join(this.soundsDir, `${id}${ext}`);
      await fs.copyFile(file, dest);
      const clip: SoundClip = {
        id,
        // Keep the source filename verbatim. The editable display name is
        // intentionally independent from the UUID-based library copy.
        name: path.basename(file),
        filePath: dest,
        favorite: false,
        volume: 1,
        loop: false,
        broadcast: true,
        contentHash,
      };
      this.clips.push(clip);
      knownSources.add(path.resolve(dest));
      added.push(clip);
    }
    await this.persist();
    return { added, skipped };
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

  async updateClip(id: string, patch: SoundClipPatch): Promise<SoundClip> {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) throw new Error(`Clip not found: ${id}`);
    const next = sanitizeClipPatch(patch);
    Object.assign(clip, next);
    await this.persist();
    return { ...clip };
  }

  private async persist() {
    const file: LibraryFile = { clips: this.clips };
    const temporary = `${this.dbPath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(file, null, 2), "utf8");
    await fs.rename(temporary, this.dbPath);
  }
}

async function backupCorruptFile(filePath: string): Promise<void> {
  try {
    await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
  } catch {
    // The source may have disappeared between read and recovery.
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
  // Drop the legacy category field while migrating existing libraries.
  const { category: _legacyCategory, ...rest } = clip as SoundClip & {
    category?: string;
  };
  return {
    ...rest,
    favorite: Boolean(clip.favorite),
    volume: clamp01(Number.isFinite(clip.volume) ? clip.volume : 1),
    loop: Boolean(clip.loop),
    broadcast: clip.broadcast !== false,
  };
}

export function sanitizeClipPatch(patch: SoundClipPatch): SoundClipPatch {
  const next: SoundClipPatch = {};
  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error("Clip name cannot be empty.");
    next.name = name;
  }
  if (typeof patch.favorite === "boolean") next.favorite = patch.favorite;
  if (Object.prototype.hasOwnProperty.call(patch, "hotkey")) {
    if (patch.hotkey === null || patch.hotkey === "") next.hotkey = undefined;
    else if (typeof patch.hotkey === "string") {
      next.hotkey = patch.hotkey.trim().slice(0, 80) || undefined;
    }
  }
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

function fileIsEmpty(filePath: string): boolean {
  try {
    return statSync(filePath).size === 0;
  } catch {
    return true;
  }
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
