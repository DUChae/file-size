// Copies the pdf.js runtime resources (CMaps, standard fonts, wasm decoders, ICC profiles)
// into public/pdfjs so the browser can fetch them. Runs before dev and build.
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(process.cwd(), "public", "pdfjs");
const dirs = ["cmaps", "standard_fonts", "wasm", "iccs"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const dir of dirs) {
  await cp(path.join(pdfjsRoot, dir), path.join(target, dir), { recursive: true });
}

console.log(`pdfjs assets copied to ${path.relative(process.cwd(), target)}`);
