import { ImportSkippedFile, SoundClip } from "../../shared/types";
import { store } from "./store";

export async function importAudioFiles(): Promise<SoundClip[]> {
  const files = await window.soundgrid.pickAudioFiles();
  if (!files.length) return [];

  return importAudioPaths(files);
}

export async function importDroppedAudioFiles(
  files: Iterable<File>,
): Promise<SoundClip[]> {
  const paths = Array.from(files, (file) =>
    window.soundgrid.getPathForFile(file),
  ).filter(Boolean);
  return importAudioPaths(paths);
}

async function importAudioPaths(files: string[]): Promise<SoundClip[]> {
  if (!files.length) return [];
  try {
    const { added, skipped } = await window.soundgrid.importFiles(files);
    if (added.length) {
      store.update({
        clips: [...store.state.clips, ...added],
        audioError: skipped.length ? importSkippedMessage(skipped) : null,
      });
    } else if (skipped.length) {
      store.update({ audioError: importSkippedMessage(skipped) });
    }
    return added;
  } catch (error) {
    store.update({
      audioError:
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed. Check the file and try again.",
    });
    return [];
  }
}

function importSkippedMessage(skipped: ImportSkippedFile[]): string {
  const counts = skipped.reduce(
    (acc, item) => ({ ...acc, [item.reason]: acc[item.reason] + 1 }),
    { duplicate: 0, empty: 0, unsupported: 0 },
  );
  const parts = [
    counts.unsupported
      ? `${counts.unsupported} unsupported file${counts.unsupported === 1 ? "" : "s"}`
      : null,
    counts.empty
      ? `${counts.empty} empty file${counts.empty === 1 ? "" : "s"}`
      : null,
    counts.duplicate
      ? `${counts.duplicate} duplicate file${counts.duplicate === 1 ? "" : "s"}`
      : null,
  ].filter((part): part is string => Boolean(part));
  return `Import skipped ${parts.join(", ")}.`;
}
