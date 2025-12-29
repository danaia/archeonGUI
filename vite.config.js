import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import { fileURLToPath } from 'url';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@vue/devtools-api': fileURLToPath(new URL('./stubs/@vue/devtools-api/index.js', import.meta.url))
    }
  },
  plugins: [
    vue(),
    electron([
      {
        // Main process entry
        entry: "electron/main.js",
        vite: {
          build: {
            outDir: "dist-electron",
            minify: 'esbuild',
            sourcemap: false,
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
            minify: 'esbuild',
            sourcemap: false,
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
    // Maximum speed settings
    target: 'esnext',
    minify: 'esbuild', // Fastest minifier
    cssMinify: 'esbuild',
    sourcemap: false,
    reportCompressedSize: false, // Skip size reporting for speed
    chunkSizeWarningLimit: 5000, // Suppress chunk size warnings
    assetsDir: "assets",
    // Single chunk for faster builds (no code splitting overhead)
    rollupOptions: {
      output: {
        manualChunks: undefined, // Disable code splitting for speed
      },
    },
  },
  esbuild: {
    // Fastest esbuild settings
    legalComments: 'none',
    treeShaking: true,
    target: 'esnext',
  },
  worker: {
    format: "es",
  },
  // Optimize deps for faster cold starts
  optimizeDeps: {
    include: ['vue', 'pinia', '@xterm/xterm', '@xterm/addon-fit'],
    force: false, // Don't force re-optimization
  },
  // Faster dev server
  server: {
    hmr: {
      overlay: false, // Disable error overlay for speed
    },
  },
});
