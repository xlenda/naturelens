const test = require('node:test');
const assert = require('node:assert/strict');
const care = require('./public/locales/tropical-care.json');

test('tropical care contains only exact binomials with traceable sources', () => {
  const rows = Object.entries(care).filter(([key]) => !key.startsWith('_'));
  assert.equal(rows.length, care._count);
  assert.ok(rows.length >= 4);
  for (const [key, row] of rows) {
    assert.match(key, /^[a-z]+ [a-z]+$/);
    assert.match(row.source, /^UF\/IFAS Extension/);
    assert.match(row.sourceUrl, /^https:\/\/edis\.ifas\.ufl\.edu\/publication\//);
    assert.ok(['low', 'medium', 'high'].includes(row.fertility));
  }
});

test('the tropical layer covers flagship indoor and fruit species exactly', () => {
  for (const scientific of ['monstera deliciosa', 'zamioculcas zamiifolia', 'epipremnum aureum', 'mangifera indica']) {
    assert.ok(care[scientific], scientific);
  }
});
