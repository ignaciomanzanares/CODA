/**
 * Genera PNGs para PWA desde public/favicon.svg (sharp).
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const input = join(root, "public", "favicon.svg");
const outDir = join(root, "public", "icons");

const BRAND_BLUE = { r: 59, g: 130, b: 246, alpha: 1 };

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  await sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(outDir, `icon-${size}x${size}.png`));
  console.log(`Wrote icon-${size}x${size}.png`);
}

const canvas = 512;
const inner = Math.round(canvas * 0.7);
const offset = Math.round((canvas - inner) / 2);
const iconBuf = await sharp(input)
  .resize(inner, inner, { fit: "contain", background: { ...BRAND_BLUE, alpha: 1 } })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: canvas,
    height: canvas,
    channels: 4,
    background: BRAND_BLUE,
  },
})
  .composite([{ input: iconBuf, left: offset, top: offset }])
  .png()
  .toFile(join(outDir, "icon-512x512-maskable.png"));

console.log("Wrote icon-512x512-maskable.png");
console.log("Done.");
