const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'store-assets', 'screenshots-ready');
const OUTPUT_DIR = path.join(ROOT, 'store-assets', 'screenshots-listing');

const WIDTH = 1080;
const HEIGHT = 1920;
const SHOT_WIDTH = 780;
const SHOT_HEIGHT = 1387;
const SHOT_X = Math.round((WIDTH - SHOT_WIDTH) / 2);
const SHOT_Y = 466;
const CORNER = 48;

const slides = [
  {
    source: '01-identificar.png',
    file: '01-identificar.png',
    accent: '#7FC79A',
    pt: {
      kicker: '01  IDENTIFIQUE',
      title: ['Reconheça a natureza', 'ao seu redor'],
      body: 'Fotografe até três ângulos e receba uma identificação detalhada.',
    },
    en: {
      kicker: '01  IDENTIFY',
      title: ['Recognize nature', 'all around you'],
      body: 'Photograph up to three angles and get a detailed identification.',
    },
  },
  {
    source: '02-resultado.png',
    file: '02-resultado.png',
    accent: '#7FC79A',
    pt: {
      kicker: '02  ENTENDA',
      title: ['Da foto ao nome,', 'com contexto e segurança'],
      body: 'Veja o nome e os alertas importantes em uma só leitura.',
    },
    en: {
      kicker: '02  UNDERSTAND',
      title: ['From photo to name,', 'with context and safety'],
      body: 'See the name and important safety alerts at a glance.',
    },
  },
  {
    source: '03-meu-registro.png',
    file: '03-meu-registro.png',
    accent: '#5AA9C9',
    pt: {
      kicker: '03  CUIDE',
      title: ['Cada descoberta vira', 'um registro vivo'],
      body: 'Organize seus achados e veja o que merece atenção hoje.',
    },
    en: {
      kicker: '03  CARE',
      title: ['Turn every discovery', 'into a living record'],
      body: 'Organize your finds and see what needs attention today.',
    },
  },
  {
    source: '04-descobrir.png',
    file: '04-descobrir.png',
    accent: '#E0A951',
    pt: {
      kicker: '04  DESCUBRA',
      title: ['Conhecimento que', 'desperta curiosidade'],
      body: 'Explore espécies, coleções, livros e histórias do mundo natural.',
    },
    en: {
      kicker: '04  DISCOVER',
      title: ['Knowledge made', 'to spark curiosity'],
      body: 'Explore species, collections, books, and stories from the natural world.',
    },
  },
  {
    source: '05-diario.png',
    file: '05-diario.png',
    accent: '#A38AD1',
    pt: {
      kicker: '05  REGISTRE',
      title: ['Guarde observações', 'e acompanhe a história'],
      body: 'Personalize cada exemplar e mantenha os momentos importantes juntos.',
    },
    en: {
      kicker: '05  RECORD',
      title: ['Keep observations', 'and follow the story'],
      body: 'Personalize every specimen and keep its important moments together.',
    },
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function backgroundSvg(slide, copy) {
  const [line1, line2] = copy.title.map(escapeXml);
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#07100C"/>
          <stop offset="0.55" stop-color="#10241A"/>
          <stop offset="1" stop-color="#08110D"/>
        </linearGradient>
        <radialGradient id="glow" cx="72%" cy="4%" r="72%">
          <stop offset="0" stop-color="${slide.accent}" stop-opacity="0.26"/>
          <stop offset="1" stop-color="${slide.accent}" stop-opacity="0"/>
        </radialGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000000" flood-opacity="0.58"/>
        </filter>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

      <circle cx="1010" cy="210" r="210" fill="none" stroke="${slide.accent}" stroke-opacity="0.08" stroke-width="2"/>
      <circle cx="1010" cy="210" r="150" fill="none" stroke="${slide.accent}" stroke-opacity="0.10" stroke-width="2"/>
      <path d="M42 610 C120 520 158 424 177 314 C215 416 214 530 152 630 C116 687 74 698 42 610Z" fill="${slide.accent}" fill-opacity="0.055"/>
      <path d="M1028 1530 C954 1435 916 1328 914 1210 C864 1314 871 1434 940 1540 C976 1595 1017 1609 1028 1530Z" fill="${slide.accent}" fill-opacity="0.045"/>

      <text x="118" y="108" fill="${slide.accent}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${escapeXml(copy.kicker)}</text>
      <rect x="118" y="136" width="54" height="4" rx="2" fill="${slide.accent}"/>
      <text x="118" y="218" fill="#F4F7F5" font-family="Segoe UI, Arial, sans-serif" font-size="60" font-weight="760" letter-spacing="-1.5">
        <tspan x="118" dy="0">${line1}</tspan>
        <tspan x="118" dy="68">${line2}</tspan>
      </text>
      <text x="118" y="384" fill="#B9C8BF" font-family="Segoe UI, Arial, sans-serif" font-size="25" font-weight="400">${escapeXml(copy.body)}</text>

      <rect x="${SHOT_X - 16}" y="${SHOT_Y - 16}" width="${SHOT_WIDTH + 32}" height="${SHOT_HEIGHT + 32}" rx="${CORNER + 16}" fill="#030705" filter="url(#shadow)"/>
      <rect x="${SHOT_X - 8}" y="${SHOT_Y - 8}" width="${SHOT_WIDTH + 16}" height="${SHOT_HEIGHT + 16}" rx="${CORNER + 8}" fill="none" stroke="#789584" stroke-opacity="0.38" stroke-width="2"/>
    </svg>
  `);
}

function roundedMask() {
  return Buffer.from(`
    <svg width="${SHOT_WIDTH}" height="${SHOT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SHOT_WIDTH}" height="${SHOT_HEIGHT}" rx="${CORNER}" fill="#fff"/>
    </svg>
  `);
}

async function buildSlide(slide, locale, copy) {
  const sourcePath = path.join(SOURCE_ROOT, locale, slide.source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Captura ausente: ${sourcePath}`);

  const screenshot = await sharp(sourcePath)
    .resize(SHOT_WIDTH, SHOT_HEIGHT, { fit: 'cover', position: 'top' })
    .composite([{ input: roundedMask(), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const outDir = path.join(OUTPUT_DIR, locale);
  fs.mkdirSync(outDir, { recursive: true });
  await sharp(backgroundSvg(slide, copy))
    .composite([{ input: screenshot, left: SHOT_X, top: SHOT_Y }])
    .flatten({ background: '#07100C' })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, slide.file));
}

async function main() {
  for (const locale of ['pt-BR', 'en-US']) {
    const localeDir = path.join(OUTPUT_DIR, locale);
    fs.mkdirSync(localeDir, { recursive: true });
    for (const name of fs.readdirSync(localeDir)) {
      if (/\.png$/i.test(name)) fs.unlinkSync(path.join(localeDir, name));
    }
  }
  for (const slide of slides) {
    await buildSlide(slide, 'pt-BR', slide.pt);
    await buildSlide(slide, 'en-US', slide.en);
  }
  console.log('Play listing: 10 screenshots editoriais gerados.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
