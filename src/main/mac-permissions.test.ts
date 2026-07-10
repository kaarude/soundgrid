import { describe, expect, it, vi } from "vitest";
import {
  ensureMacMicrophoneAccess,
  MacMediaAccessStatus,
  MacMicrophonePreferences,
} from "./mac-permissions";

function preferences(
  status: MacMediaAccessStatus,
  ask = vi.fn(async () => true),
): MacMicrophonePreferences & { askForMediaAccess: typeof ask } {
  return {
    getMediaAccessStatus: () => status,
    askForMediaAccess: ask,
  };
}

describe("macOS microphone permissions", () => {
  it("never prompts during a startup-only permission check", async () => {
    const prefs = preferences("not-determined");

    await expect(
      ensureMacMicrophoneAccess(prefs, { prompt: false }),
    ).resolves.toBe(false);
    expect(prefs.askForMediaAccess).not.toHaveBeenCalled();
  });

  it.each(["denied", "restricted", "unknown"] as const)(
    "does not re-prompt when access is %s",
    async (status) => {
      const prefs = preferences(status);

      await expect(
        ensureMacMicrophoneAccess(prefs, { prompt: true }),
      ).resolves.toBe(false);
      expect(prefs.askForMediaAccess).not.toHaveBeenCalled();
    },
  );

  it("accepts an existing grant without prompting", async () => {
    const prefs = preferences("granted");

    await expect(
      ensureMacMicrophoneAccess(prefs, { prompt: true }),
    ).resolves.toBe(true);
    expect(prefs.askForMediaAccess).not.toHaveBeenCalled();
  });

  it("coalesces concurrent user-initiated requests into one system prompt", async () => {
    let resolveRequest: ((allowed: boolean) => void) | undefined;
    const ask = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const prefs = preferences("not-determined", ask);

    const first = ensureMacMicrophoneAccess(prefs, { prompt: true });
    const second = ensureMacMicrophoneAccess(prefs, { prompt: true });
    expect(ask).toHaveBeenCalledTimes(1);
    resolveRequest?.(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it("treats a failed native permission request as denied", async () => {
    const prefs = preferences(
      "not-determined",
      vi.fn(async () => {
        throw new Error("TCC unavailable");
      }),
    );

    await expect(
      ensureMacMicrophoneAccess(prefs, { prompt: true }),
    ).resolves.toBe(false);
  });
});
