import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const url =
  "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip";
const expectedSha256 =
  "b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb";
const output = path.resolve("vendor/vb-cable/VBCABLE_Driver_Pack45.zip");

await mkdir(path.dirname(output), { recursive: true });

let bytes;
try {
  bytes = await readFile(output);
  if (sha256(bytes) === expectedSha256) {
    console.log("VB-CABLE package is already present and verified.");
    process.exit(0);
  }
} catch {
  // Download below.
}

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`VB-CABLE download failed: ${response.status} ${response.statusText}`);
}
bytes = Buffer.from(await response.arrayBuffer());
const actual = sha256(bytes);
if (actual !== expectedSha256) {
  throw new Error(`VB-CABLE checksum mismatch: expected ${expectedSha256}, got ${actual}`);
}
await writeFile(output, bytes);
console.log(`Downloaded and verified ${path.relative(process.cwd(), output)}`);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
