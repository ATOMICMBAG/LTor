// Bundles server/index.ts into out/server/ (ESM, Node ≥ 18).
// The demo build has no runtime npm dependencies: ws and the simulator are
// bundled in; OPC UA / MQTT / REST are only loaded lazily in --mode full
// (then `npm install --omit=dev` is needed next to the bundle).
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  splitting: true,
  outdir: "out/server",
  outExtension: { ".js": ".mjs" },
  alias: { "@shared": "./src/shared", "@main": "./src/main" },
  external: ["node-opcua", "mqtt", "axios", "bufferutil", "utf-8-validate"],
  banner: {
    js:
      "import { createRequire as __ltorCreateRequire } from 'node:module';" +
      "const require = __ltorCreateRequire(import.meta.url);",
  },
  define: { __LTOR_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "info",
});
