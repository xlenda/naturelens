// Generates the social preview image (public/og-image.png, 1200x630).
//
// Why it matters: pasting naturelensapp.cloud into WhatsApp today shows a bare
// link with no image and no description. WhatsApp, Telegram, Facebook, LinkedIn
// and X all read Open Graph tags to build a preview card - without an og:image
// every share of the URL is invisible. This is the other half of the in-app
// share card: that one covers "user shares a find", this covers "user shares
// the app".
//
// Run manually after changing the branding:  node scripts/make-og-image.js
// (Not wired into the build: the output is a committed static asset, and
// regenerating it on every deploy would be wasted work.)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'public', 'og-image.png');
const ICON = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');

const W = 1200;
const H = 630;

// Deterministic speck field - same trick as components/shareCard.js, kept in
// sync visually rather than by import (this runs in Node, that runs in a
// browser canvas).
function specks(seed, n) {
  let h = seed >>> 0;
  const rnd = () => {
    h = (h * 1103515245 + 12345) % 2147483648;
    return h / 2147483648;
  };
  let out = '';
  for (let i = 0; i < n; i++) {
    const cx = Math.round(rnd() * W);
    const cy = Math.round(rnd() * H);
    const r = (rnd() * 2.2 + 0.6).toFixed(1);
    const o = (rnd() * 0.35 + 0.1).toFixed(2);
    out += `<circle cx='${cx}' cy='${cy}' r='${r}' fill='#7FC79A' opacity='${o}'/>`;
  }
  return out;
}

function leaf(x, y, scale, rotation, fill, opacity) {
  const L = 120 * scale;
  const Wd = 46 * scale;
  return (
    `<g transform='translate(${x},${y}) rotate(${rotation})' opacity='${opacity}'>` +
    `<path d='M0,0 Q${Wd},${-L * 0.35} 0,${-L} Q${-Wd},${-L * 0.35} 0,0 Z' fill='${fill}'/>` +
    `</g>`
  );
}

// Text is drawn as SVG paths-by-font. sharp renders SVG text with the system
// font stack, which on this machine resolves fine; if a future machine renders
// it wrong the fix is to pre-render text elsewhere, not to ship a broken image -
// so the output is checked by eye once and committed.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1B3D2A"/>
      <stop offset="1" stop-color="#0E1512"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${specks(97, 60)}
  ${leaf(90, 690, 2.6, -20, '#4E9F6B', 0.18)}
  ${leaf(1130, 700, 3.0, 24, '#3B7A52', 0.16)}
  <text x="360" y="270" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="72" font-weight="800" fill="#F2F5F3">NatureLens</text>
  <text x="360" y="336" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="34" font-weight="600" fill="#B4C2BA">Identifique a natureza por foto</text>
  <text x="360" y="392" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="27" fill="#7FC79A">Plantas · Insetos · Cogumelos · Culturas · Peixes · Pássaros</text>
  <text x="360" y="470" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="25" font-weight="600" fill="#6E7F76">naturelensapp.cloud</text>
</svg>`;

async function main() {
  if (!fs.existsSync(ICON)) {
    console.error('icon-512.png not found - run the icon pipeline first');
    process.exit(1);
  }

  const background = await sharp(Buffer.from(svg)).png().toBuffer();
  const icon = await sharp(ICON).resize(220, 220).toBuffer();

  await sharp(background)
    .composite([{ input: icon, top: Math.round((H - 220) / 2), left: 100 }])
    .png()
    .toFile(OUT);

  const { size } = fs.statSync(OUT);
  console.log(`og-image.png written (${W}x${H}, ${Math.round(size / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
