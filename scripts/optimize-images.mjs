// Resizes + converts source images to WebP for public/images.
// Source of truth: design/images-src/*.{jpg,jpeg,png}
// Output: public/images/*.webp (gitignored input, only optimized output is committed)
import { readdir, mkdir, stat } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const SRC_DIR = "design/images-src";
const OUT_DIR = "public/images";
const DEFAULT_MAX_WIDTH = 1920;
const QUALITY = 80;

// Per-image width caps: 2x actual max render width from the `sizes` prop
// on the corresponding <Image> in src/app/page.tsx. Falls back to
// DEFAULT_MAX_WIDTH for anything not listed here.
const WIDTH_OVERRIDES = {
  "conference-ai-act-1": 600,
  "conference-ai-act-2": 600,
  "conference-ai-act-3": 600,
  "conference-didier": 1792,
  "team-group": 1792,
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let files;
  try {
    files = await readdir(SRC_DIR);
  } catch {
    console.log(`No ${SRC_DIR} dir, skipping image optimization.`);
    return;
  }

  const images = files.filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (images.length === 0) {
    console.log("No source images to optimize.");
    return;
  }

  for (const file of images) {
    const srcPath = join(SRC_DIR, file);
    const { name } = parse(file);
    const outPath = join(OUT_DIR, `${name}.webp`);

    const [srcStat, outStat] = await Promise.all([
      stat(srcPath),
      stat(outPath).catch(() => null),
    ]);

    if (outStat && outStat.mtimeMs >= srcStat.mtimeMs) {
      continue; // already up to date
    }

    const width = WIDTH_OVERRIDES[name] ?? DEFAULT_MAX_WIDTH;
    await sharp(srcPath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toFile(outPath);

    console.log(`optimized ${file} -> ${outPath}`);
  }
}

main();
