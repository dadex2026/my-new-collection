import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Collection display name is stamped once in template-version.json at the
// repo root (part of the rename set — see docs/new-collection-deployment-guide.md)
// and injected into index.html here, instead of being hardcoded in the HTML.
//
// Ported from the template on 2026-08-28. Until then this file did not read
// template-version.json at all, so both of its fields were inert here and the
// title and <h1> were hardcoded "Template Open Edition" — on a public site,
// while template-version.json had said "My New Collection" for weeks. Setting
// the name and rebuilding changed nothing, with no error to explain why.
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