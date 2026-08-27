/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'store-assets');
const width = 1290;
const height = 2796;

async function build(locale) {
  const sourceDir = path.join(root, 'screenshots-listing', locale);
  const outputDir = path.join(root, 'app-store-screenshots', locale);
  fs.mkdirSync(outputDir, { recursive: true });
  const files = fs.readdirSync(sourceDir).filter((name) => /\.png$/i.test(name)).sort();
  for (const name of files) {
    const source = await sharp(path.join(sourceDir, name))
      .resize({ width: 1180, height: 2360, fit: 'inside', withoutEnlargement: false })
      .png().toBuffer();
    const metadata = await sharp(source).metadata();
    await sharp({ create: { width, height, channels: 3, background: '#0E1512' } })
      .composite([{ input: source, left: Math.round((width - metadata.width) / 2), top: Math.round((height - metadata.height) / 2) }])
      .flatten({ background: '#0E1512' })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, name));
  }
}

Promise.all(['pt-BR', 'en-US'].map(build))
  .then(() => console.log('App Store screenshots generated at 1290 x 2796.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
