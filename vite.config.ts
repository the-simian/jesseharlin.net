import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Babylon is imported by deep path from many files. Letting Vite pre-bundle it
  // piecemeal has produced two copies of its shader store mid-session, after
  // which no material ever reports ready. Serve it as plain ES modules instead.
  optimizeDeps: { exclude: ["@babylonjs/core"] },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: { babylon: ["@babylonjs/core"] },
      },
    },
  },
});
