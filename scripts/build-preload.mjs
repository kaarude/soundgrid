import { build } from "esbuild";

await build({
  entryPoints: ["src/preload/preload.ts"],
  outfile: "dist/preload/preload.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
});
