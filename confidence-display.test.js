// Regressao: dado de confianca ausente nao pode virar "undefined%" na ficha.
// Rode com: node --test confidence-display.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DETAIL_SCREENS = [
  'BirdDetailScreen.js',
  'CropDetailScreen.js',
  'FishDetailScreen.js',
  'InsectDetailScreen.js',
  'MushroomDetailScreen.js',
  'PlantDetailScreen.js',
  'SoundDetailScreen.js',
  'TreeDetailScreen.js',
];

const GUARDED_BADGE = /\{Number\.isFinite\(plant\.confidence\) && \(\s*<View style=\{styles\.confidenceBadge\}>[\s\S]*?\{plant\.confidence\}%[\s\S]*?<\/View>\s*\)\}/g;

test('all eight detail screens hide the confidence badge when the value is absent', () => {
  for (const file of DETAIL_SCREENS) {
    const source = fs.readFileSync(path.join(__dirname, 'screens', file), 'utf8');
    const guards = source.match(GUARDED_BADGE) || [];

    assert.equal(guards.length, 1, `${file} precisa proteger o badge com Number.isFinite`);
    assert.doesNotMatch(
      source.replace(GUARDED_BADGE, ''),
      /<View style=\{styles\.confidenceBadge\}>/,
      `${file} nao pode manter badge de confianca fora da protecao`
    );
  }
});

test('the finite-number rule preserves zero and rejects missing or invalid values', () => {
  assert.equal(Number.isFinite(0), true);
  for (const value of [undefined, null, '', '0', NaN, Infinity, -Infinity]) {
    assert.equal(Number.isFinite(value), false, `${String(value)} nao e confianca numerica valida`);
  }
});
