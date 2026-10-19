// The small poster a phone downloads: the big poster at half its width, under 40 KB.
import sharp from 'sharp';

export const SMALL = { width: 800, height: 500 };

export async function writeSmallPoster(bigPath, outPath) {
  let quality = 78;
  for (;;) {
    const info = await sharp(bigPath).resize(SMALL.width, SMALL.height).webp({ quality, effort: 6 }).toFile(outPath);
    if (info.size <= 40 * 1024 || quality <= 40) return info;
    quality -= 8;
  }
}
