// One-off script to derive PWA icon sizes from assets/icon.png master art.
// Not part of the build pipeline; run manually when the master icon changes.
const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'assets', 'icon.png');
const outDir = path.join(__dirname, '..', 'public', 'icons');
const BG = '#0E1512';

async function main() {
  await sharp(src).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'));
  await sharp(src).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'));
  await sharp(src)
    .resize(180, 180)
    .flatten({ background: BG })
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon.png'));
  await sharp(src).resize(32, 32).png().toFile(path.join(outDir, 'favicon-32.png'));
  console.log('Icon derivatives written to', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
