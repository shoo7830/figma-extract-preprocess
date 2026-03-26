import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the React UI iframe into a single inlined HTML file (dist/index.html)
// vite-plugin-singlefile inlines all JS/CSS so Figma can load it as __html__
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: "src/ui",
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
  },
});
