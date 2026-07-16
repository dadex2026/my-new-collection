import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  root: ".", // IMPORTANT: frontend is root of vite context

  plugins: [
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process", "events"],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],

  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "rpc-websockets": path.resolve(__dirname, "node_modules/rpc-websockets/dist/index.browser.mjs"),
    },
  },
});