import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the standalone read-only viewer that is inlined into exported HTML files.
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  publicDir: false,
  build: {
    outDir: "src/generated",
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: "src/viewer/main.tsx",
      formats: ["iife"],
      name: "ElasticDashboardViewer",
      fileName: () => "viewer.js",
      cssFileName: "viewer",
    },
  },
});
