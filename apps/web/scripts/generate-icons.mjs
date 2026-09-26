// Generates PWA icons from public/icon.svg. Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const svg = fs.readFileSync('public/icon.svg');
fs.mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp(svg).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
// Maskable: add safe-zone padding on brand background.
const inner = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0f766e' } })
  .composite([{ input: inner, top: 76, left: 76 }])
  .png()
  .toFile('public/icons/maskable-512.png');
console.log('Icons generated');
