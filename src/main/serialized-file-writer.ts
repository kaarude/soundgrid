import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Serializes atomic file replacements for one store. Without the queue, two
 * overlapping saves can both write the same temporary path and race to rename
 * it, causing one caller to fail or an older snapshot to win.
 */
export class SerializedFileWriter {
  private queue: Promise<void> = Promise.resolve();

  write(filePath: string, contents: string): Promise<void> {
    const operation = this.queue.then(async () => {
      const temporary = `${filePath}.tmp`;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(temporary, contents, "utf8");
      await fs.rename(temporary, filePath);
    });

    // Keep the queue usable after a failed write while still rejecting the
    // operation returned to the caller that experienced the failure.
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
