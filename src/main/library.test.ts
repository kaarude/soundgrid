import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryStore, sanitizeClipPatch } from "./library";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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

  it("trims names, clamps volume/trim, and rejects blank names", () => {
    expect(
      sanitizeClipPatch({
        name: "  Air horn  ",
        volume: 4,
        trimStart: -2,
        trimEnd: 900,
      }),
    ).toEqual({
      name: "Air horn",
      volume: 1,
      trimStart: 0,
      trimEnd: 600,
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
    const { added, skipped } = await store.importFiles([source]);
    const [clip] = added;

    expect(clip.name).toBe("My.Sound Effect.WAV");
    expect(skipped).toEqual([]);
  });

  it("reports unsupported, empty, and duplicate files during import", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const wav = path.join(root, "valid.wav");
    const empty = path.join(root, "empty.mp3");
    const unsupported = path.join(root, "notes.txt");
    await mkdir(sounds);
    await writeFile(wav, "audio fixture");
    await writeFile(empty, "");
    await writeFile(unsupported, "not audio");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const result = await store.importFiles([wav, wav, empty, unsupported]);

    expect(result.added).toHaveLength(1);
    expect(result.skipped).toEqual([
      { filePath: wav, reason: "duplicate" },
      { filePath: empty, reason: "empty" },
      { filePath: unsupported, reason: "unsupported" },
    ]);
  });

  it("rejects the same audio content across later imports and different paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const first = path.join(root, "first.wav");
    const copy = path.join(root, "copy.wav");
    await mkdir(sounds);
    await writeFile(first, "same audio bytes");
    await writeFile(copy, "same audio bytes");

    const store = new LibraryStore();
    await store.init(db, sounds);
    expect((await store.importFiles([first])).added).toHaveLength(1);
    expect((await store.importFiles([first, copy])).skipped).toEqual([
      { filePath: first, reason: "duplicate" },
      { filePath: copy, reason: "duplicate" },
    ]);
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
      trimStart: 0,
      trimEnd: 0,
      loop: false,
      broadcast: true,
    });
    expect(clip).not.toHaveProperty("category");
    expect(JSON.parse(await readFile(db, "utf8")).clips[0].hotkey).toBe(
      "Control+L",
    );
  });

  it("stores a content hash on import", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const source = path.join(root, "clip.wav");
    await mkdir(sounds);
    await writeFile(source, "audio fixture");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const [clip] = (await store.importFiles([source])).added;

    expect(clip.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(await readFile(db, "utf8")).clips[0].contentHash).toBe(
      clip.contentHash,
    );
  });

  it("rescan picks up files added to the sounds folder and marks missing ones", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const source = path.join(root, "clip.wav");
    await mkdir(sounds);
    await writeFile(source, "audio fixture");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const [clip] = (await store.importFiles([source])).added;

    await writeFile(path.join(sounds, "external.wav"), "external audio");
    await rm(clip.filePath);

    const clips = await store.rescan();
    expect(clips).toHaveLength(2);
    expect(clips.find((c) => c.id === clip.id)?.missing).toBe(true);
    expect(clips.find((c) => c.name === "external.wav")).toBeTruthy();
  });

  it("relinks a clip to a renamed file instead of orphaning it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const source = path.join(root, "clip.wav");
    await mkdir(sounds);
    await writeFile(source, "audio fixture content");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const [clip] = (await store.importFiles([source])).added;
    await store.updateClip(clip.id, { favorite: true, hotkey: "Control+H" });

    // Simulate the user renaming the managed copy inside the sounds folder.
    const renamed = path.join(sounds, "moved.wav");
    await rename(clip.filePath, renamed);

    await store.rescan();
    const after = store.byId(clip.id);
    expect(after).toMatchObject({
      name: "clip.wav",
      favorite: true,
      hotkey: "Control+H",
      missing: undefined,
    });
    expect(after?.filePath).toBe(renamed);
    // No fresh duplicate clip was created for the renamed file.
    expect(store.getClips()).toHaveLength(1);
  });

  it("updateClips applies a patch to many clips and ignores unknown ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    await mkdir(sounds);
    await writeFile(path.join(root, "a.wav"), "a");
    await writeFile(path.join(root, "b.wav"), "b");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const added = (
      await store.importFiles([
        path.join(root, "a.wav"),
        path.join(root, "b.wav"),
      ])
    ).added;
    const ids = added.map((c) => c.id);

    const updated = await store.updateClips(ids, {
      broadcast: false,
      favorite: true,
    });
    expect(updated).toHaveLength(2);
    expect(
      updated.every((c) => c.broadcast === false && c.favorite === true),
    ).toBe(true);

    const mixed = await store.updateClips([ids[0], "does-not-exist"], {
      loop: true,
    });
    expect(mixed).toHaveLength(1);
    expect(mixed[0].loop).toBe(true);
    expect(mixed[0].broadcast).toBe(false);

    const persisted = JSON.parse(await readFile(db, "utf8")).clips;
    expect(
      persisted.find((c: { id: string }) => c.id === ids[0]),
    ).toMatchObject({
      loop: true,
      broadcast: false,
      favorite: true,
    });
  });

  it("serializes concurrent removals without temporary-file rename failures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    await mkdir(sounds);
    const sources = await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const source = path.join(root, `${index}.wav`);
        await writeFile(source, `audio-${index}`);
        return source;
      }),
    );

    const store = new LibraryStore();
    await store.init(db, sounds);
    const clips = (await store.importFiles(sources)).added;

    await expect(
      Promise.all(clips.map((clip) => store.removeClip(clip.id))),
    ).resolves.toHaveLength(clips.length);
    expect(store.getClips()).toEqual([]);
    expect(JSON.parse(await readFile(db, "utf8"))).toEqual({ clips: [] });
  });

  it("keeps clip metadata when the managed file cannot be deleted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-library-"));
    roots.push(root);
    const sounds = path.join(root, "sounds");
    const db = path.join(root, "library.json");
    const source = path.join(root, "locked.wav");
    await mkdir(sounds);
    await writeFile(source, "audio fixture");

    const store = new LibraryStore();
    await store.init(db, sounds);
    const [clip] = (await store.importFiles([source])).added;
    const failure = Object.assign(new Error("file is locked"), {
      code: "EPERM",
    });
    vi.spyOn(fs, "unlink").mockRejectedValueOnce(failure);

    await expect(store.removeClip(clip.id)).rejects.toBe(failure);
    expect(store.byId(clip.id)).toEqual(clip);
    expect(JSON.parse(await readFile(db, "utf8")).clips).toHaveLength(1);
  });
});
