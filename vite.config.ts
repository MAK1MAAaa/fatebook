import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: "0.0.0.0", port: 6657, strictPort: true },
  preview: { host: "0.0.0.0", port: 6657, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/")) return "vendor";
        },
      },
    },
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
