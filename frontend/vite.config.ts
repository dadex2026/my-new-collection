import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Collection display name is stamped once in template-version.json at the
// repo root (part of the rename set — see docs/new-collection-deployment-guide.md)
// and injected into index.html here, instead of being hardcoded in the HTML.
const templateVersion = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../template-version.json"), "utf-8")
);
const collectionName: string =
  templateVersion.collectionName || templateVersion.templateName;

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
    {
      name: "inject-collection-name",
      transformIndexHtml(html) {
        return html.replace(/%COLLECTION_NAME%/g, collectionName);
      },
    },
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