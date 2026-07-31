const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BG = { r: 243, g: 245, b: 238 };

// Maskable icon safe zone is a centered circle of diameter 80% of the full
// canvas. This icon's own art (scan-frame corner brackets especially) reaches
// close to the edges, so simply reusing the existing edge-to-edge icon as
// "purpose": "maskable" (as it was before) risks the OS clipping the corner
// brackets and butterfly wingtips when it applies a circular/squircle mask.
// Scaling the WHOLE source icon down to ~57% and padding the rest with the
// icon's own background color guarantees every pixel of content sits inside
// that safe circle even in the worst case (a square's corners reaching the
// circle) - side = safe-circle-diameter / sqrt(2) = 0.8 / 1.41421 = 0.566.
const SCALE = 0.57;
const SIZE = 1024;
const contentSize = Math.round(SIZE * SCALE);
const offset = Math.round((SIZE - contentSize) / 2);

async function build() {
  const scaledContent = await sharp(path.join(ROOT, 'assets/icon.png'))
    .resize(contentSize, contentSize)
    .toBuffer();

  const maskableMaster = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: BG },
  })
    .composite([{ input: scaledContent, left: offset, top: offset }])
    .png()
    .toBuffer();

  await sharp(maskableMaster).resize(512, 512).toFile(path.join(ROOT, 'public/icons/icon-512-maskable.png'));
  await sharp(maskableMaster).resize(192, 192).toFile(path.join(ROOT, 'public/icons/icon-192-maskable.png'));

  console.log('Maskable icons written: icon-512-maskable.png, icon-192-maskable.png');
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
