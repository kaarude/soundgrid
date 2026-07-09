import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";

if (process.platform !== "darwin") {
  throw new Error("The universal macOS audio engine must be built on macOS.");
}

const cargo = process.env.CARGO || "cargo";
const manifest = "native/audio-engine/Cargo.toml";
const targets = ["arm64", "x64"].map((arch) => ({
  arch,
  rust: arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin",
}));

for (const target of targets) {
  run(cargo, [
    "build",
    "--release",
    "--locked",
    "--manifest-path",
    manifest,
    "--target",
    target.rust,
  ]);
}

const outputDir = path.resolve(
  "native/audio-engine/target/universal-apple-darwin/release",
);
mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, "soundgrid-audio");
const binaries = targets.map((target) =>
  path.resolve(
    `native/audio-engine/target/${target.rust}/release/soundgrid-audio`,
  ),
);
run("xcrun", ["lipo", "-create", ...binaries, "-output", output]);
chmodSync(output, 0o755);

// Keep the host-architecture development path current as well.
const host = process.arch === "arm64" ? targets[0] : targets[1];
const hostOutput = path.resolve(
  "native/audio-engine/target/release/soundgrid-audio",
);
mkdirSync(path.dirname(hostOutput), { recursive: true });
copyFileSync(
  path.resolve(
    `native/audio-engine/target/${host.rust}/release/soundgrid-audio`,
  ),
  hostOutput,
);
chmodSync(hostOutput, 0o755);

const iconDir = path.resolve("native/audio-engine/target/packaging");
rmSync(iconDir, { recursive: true, force: true });
mkdirSync(iconDir, { recursive: true });
run("qlmanage", ["-t", "-s", "1024", "-o", iconDir, "assets/logo.svg"]);
renameSync(path.join(iconDir, "logo.svg.png"), path.join(iconDir, "icon.png"));

console.log(`Built universal CoreAudio sidecar: ${output}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}
