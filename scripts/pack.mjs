import { spawnSync } from "node:child_process";

const script = process.platform === "darwin" ? "pack:mac" : "pack:win";
const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`npm run ${script} exited with status ${result.status}`);
}
