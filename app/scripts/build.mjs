import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const publicDir = path.join(root, "public");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, "assets"), { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outdir: "dist/assets",
  entryNames: "index",
  assetNames: "[name]-[hash]",
  loader: {
    ".svg": "file",
  },
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

try {
  await fs.cp(publicDir, dist, { recursive: true });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await fs.writeFile(
  path.join(dist, "index.html"),
  `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>週日の集会 割り当てツール</title>
    <script type="module" src="/assets/index.js" defer></script>
    <link rel="stylesheet" href="/assets/index.css" />
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`,
  "utf8",
);
