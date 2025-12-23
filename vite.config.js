import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        // Main process entry
        entry: "electron/main.js",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron", "node-pty", "chokidar"],
            },
          },
        },
      },
      {
        // Preload script
        entry: "electron/preload.js",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    // Ensure assets are correctly referenced
    assetsDir: "assets",
  },
});
