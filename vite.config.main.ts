import { defineConfig } from "vite";
import { resolve } from "path";

// Builds src/main.ts as a self-contained IIFE bundle (dist/main.js)
// No external deps — Figma sandbox environment
export default defineConfig({
  build: {
    target: "es2017",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      name: "FigmaPlugin",
      formats: ["iife"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
