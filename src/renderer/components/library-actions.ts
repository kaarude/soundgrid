import { SoundClip } from "../../shared/types";
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
  const added = await window.soundgrid.importFiles(files);
  if (added.length) {
    store.update({ clips: [...store.state.clips, ...added] });
  }
  return added;
}
