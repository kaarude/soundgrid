import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryStore, sanitizeClipPatch } from "./library";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("sanitizeClipPatch", () => {
  it("does not clear an omitted hotkey", () => {
    expect(sanitizeClipPatch({ favorite: true })).toEqual({ favorite: true });
  });

  it("clears a hotkey only when explicitly requested", () => {
    expect(sanitizeClipPatch({ hotkey: null })).toEqual({ hotkey: undefined });
  });

  it("trims names, clamps volume, and rejects blank names", () => {
    expect(sanitizeClipPatch({ name: "  Air horn  ", volume: 4 })).toEqual({
      name: "Air horn",
      volume: 1,
    });
    expect(() => sanitizeClipPatch({ name: "   " })).toThrow("cannot be empty");
  });
});

describe("LibraryStore", () => {
  it("uses the exact source filename, including its extension, as the sound name", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const source = path.join(root, "My.Sound Effect.WAV");
    await mkdir(sounds);
    await writeFile(source, "audio fixture");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const [clip] = await store.importFiles([source]);

    expect(clip.name).toBe("My.Sound Effect.WAV");
  });

  it("normalizes legacy clips and persists unrelated updates without losing hotkeys", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    await mkdir(sounds);
    await writeFile(
      db,
      JSON.stringify([
        {
          id: "clip-1",
          name: "Legacy",
          filePath: path.join(sounds, "legacy.wav"),
          hotkey: "Control+L",
          volume: 2,
          category: "old",
        },
      ]),
    );

    const store = new LibraryStore();
    await store.init(db, sounds);
    await store.updateClip("clip-1", { favorite: true });

    const clip = store.byId("clip-1");
    expect(clip).toMatchObject({
      hotkey: "Control+L",
      favorite: true,
      volume: 1,
      loop: false,
      broadcast: true,
    });
    expect(clip).not.toHaveProperty("category");
    expect(JSON.parse(await readFile(db, "utf8")).clips[0].hotkey).toBe(
      "Control+L",
    );
  });
});
