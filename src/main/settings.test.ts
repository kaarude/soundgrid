import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/types";
import { sanitizeSettings, SettingsStore } from "./settings";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("settings validation", () => {
  it("keeps microphone passthrough off by default", () => {
    expect(DEFAULT_SETTINGS.passthrough).toBe(false);
    expect(sanitizeSettings(DEFAULT_SETTINGS).passthrough).toBe(false);
  });

  it("requires explicit mic output and real mic routes before passthrough can be enabled", () => {
    expect(
      sanitizeSettings({
        ...DEFAULT_SETTINGS,
        passthrough: true,
        micOutputDeviceId: "cable",
        realMicDeviceId: null,
      }).passthrough,
    ).toBe(false);

    expect(
      sanitizeSettings({
        ...DEFAULT_SETTINGS,
        passthrough: true,
        micOutputDeviceId: "cable",
        realMicDeviceId: "mic",
      }).passthrough,
    ).toBe(true);
  });

  it("clamps volume and rejects unsupported enum values", () => {
    const settings = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      masterMicVolume: 9,
      monitorVolume: -2,
      theme: "sepia" as "dark",
      overlap: "replace" as "stop",
    });

    expect(settings.masterMicVolume).toBe(1);
    expect(settings.monitorVolume).toBe(0);
    expect(settings.theme).toBe("dark");
    expect(settings.overlap).toBe("stop");
  });

  it("prevents contradictory local listening modes", () => {
    const settings = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      micOnly: true,
      headsetOnly: true,
    });

    expect(settings.micOnly).toBe(true);
    expect(settings.headsetOnly).toBe(false);
  });

  it("drops unknown persisted settings keys", () => {
    const settings = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      unexpected: "value",
    } as typeof DEFAULT_SETTINGS & { unexpected: string });

    expect(settings).not.toHaveProperty("unexpected");
  });
});

describe("SettingsStore", () => {
  it("serializes overlapping saves and persists the newest state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "soundgrid-settings-"));
    roots.push(root);
    const file = path.join(root, "settings.json");
    const store = new SettingsStore();
    await store.init(file);

    await Promise.all([
      store.set({ theme: "light" }),
      store.set({ minimizeToTray: false }),
      store.set({ masterMicVolume: 0.4 }),
    ]);

    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
      theme: "light",
      minimizeToTray: false,
      masterMicVolume: 0.4,
    });
  });
});
