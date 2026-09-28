// Build the Opera GX / Chrome extension (extension/) into extension-build/ and
// zip it. With --into <dir> the zip also lands there (the deploy puts it in
// out/extension/ so the website can offer it as a download).
//
//   npm run build:extension                 → extension-build/ + .zip
//   npm run build:extension -- --into out/extension
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "extension-build", "personal-catalog-links");
const ZIP = "personal-catalog-links.zip";

rmSync(path.dirname(DIST), { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

await build({
  entryPoints: ["background", "content", "popup"].map((n) => path.join(SRC, "src", `${n}.ts`)),
  outdir: DIST,
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: false, // readable — it's your own extension, easy to inspect
  logLevel: "warning",
});
cpSync(path.join(SRC, "static"), DIST, { recursive: true });
cpSync(path.join(SRC, "manifest.json"), path.join(DIST, "manifest.json"));

const zipPath = path.join(ROOT, "extension-build", ZIP);
execFileSync("zip", ["-qrX", zipPath, path.basename(DIST)], { cwd: path.dirname(DIST) });

const i = process.argv.indexOf("--into");
if (i > 0 && process.argv[i + 1]) {
  const into = path.resolve(ROOT, process.argv[i + 1]);
  if (!existsSync(into)) mkdirSync(into, { recursive: true });
  cpSync(zipPath, path.join(into, ZIP));
  console.log(`extension → ${path.relative(ROOT, path.join(into, ZIP))}`);
} else {
  console.log(`extension → ${path.relative(ROOT, zipPath)}`);
}
