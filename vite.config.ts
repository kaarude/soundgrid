import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
});