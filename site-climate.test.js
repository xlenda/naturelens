const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('./api/site-climate');
const source = fs.readFileSync(path.join(__dirname, 'api/site-climate.js'), 'utf8');

test('site climate discards precise coordinates before upstream and persistence', () => {
  assert.equal(handler._test.gridCoordinate(-23.55052), -23.5);
  assert.equal(handler._test.gridCoordinate(-46.63331), -46.5);
  assert.match(source, /gridLatitude = gridCoordinate\(latitude\)/);
  assert.match(source, /grid_longitude: gridLongitude/);
  assert.doesNotMatch(source, /grid_latitude:\s*latitude|grid_longitude:\s*longitude/);
});

test('NASA POWER climatology is normalized without creating recommendations', () => {
  const parameter = {};
  for (const key of ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN']) {
    parameter[key] = { JAN: key === 'T2M' ? 24.5 : 100 };
  }
  const result = handler._test.normalizePower({ properties: { parameter } }, -23.5, -46.5);
  assert.equal(result.months.length, 12);
  assert.equal(result.months[0].temperatureMeanC, 24.5);
  assert.equal(result.grid.precisionDegrees, 0.5);
  assert.equal(result.source.id, 'nasa-power-climatology');
  assert.equal(JSON.stringify(result).includes('recommend'), false);
});

test('climate cache is server-only and the UI states the agronomic boundary', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'supabase-migration-site-climate.sql'), 'utf8');
  const locales = ['en', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'sv', 'da', 'cs', 'tr', 'ko', 'zh', 'zh-hant', 'hi', 'ar'];
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all[\s\S]*anon, authenticated/i);
  for (const locale of locales) {
    const body = require(`./public/locales/${locale}.json`).agronomyWorkspace.climate.body;
    assert.ok(typeof body === 'string' && body.length > 30, locale);
  }
});
