const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BG = { r: 14, g: 21, b: 18 }; // colors.background - matches adaptiveIcon.backgroundColor

// Android adaptive-icon foreground.
//
// Two things make this its own file rather than a reuse of assets/icon.png:
//
//  1. Android CROPS the foreground with a system mask (circle, squircle,
//     rounded square - the manufacturer decides). Only the centre ~66% is
//     guaranteed visible, so art that reaches the edges loses its corners.
//     The scan-frame brackets in this logo are exactly the part that would go.
//  2. `adaptiveIcon` here declares a backgroundColor but no foregroundImage,
//     and without a foreground Android does not fall back to `icon` - it draws
//     the background colour alone. The app would ship a plain dark green
//     square with no logo at all on every modern Android launcher.
//
// 0.62 keeps the whole square composition inside the guaranteed-safe circle
// (a square inscribed in a circle of diameter 0.66 has side 0.66/sqrt(2) =
// 0.47; 0.62 of the canvas is a deliberate compromise that keeps the mark
// readable while losing only the outermost padding on the most aggressive
// mask). Transparent padding, because Android composites this over the
// backgroundColor layer.
const SIZE = 1024;
const SCALE = 0.62;
const contentSize = Math.round(SIZE * SCALE);
const offset = Math.round((SIZE - contentSize) / 2);

async function build() {
  const scaled = await sharp(path.join(ROOT, 'assets/icon.png'))
    .resize(contentSize, contentSize)
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { ...BG, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left: offset, top: offset }])
    .png()
    .toFile(path.join(ROOT, 'assets/adaptive-icon.png'));

  console.log('assets/adaptive-icon.png written (foreground, transparent padding)');
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
