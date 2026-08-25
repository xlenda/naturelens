const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} = require('./components/sourceGroundedTopics');

const source = {
  id: 'wikipedia',
  url: 'https://pt.wikipedia.org/wiki/Exemplo',
  license: 'CC-BY-SA-4.0',
};

test('source-grounded sections become real topic doors with attribution', () => {
  const topics = buildSourceGroundedTopics({
    dossier: {
      scientific: 'Exemplum verum',
      sources: [source],
      wikiSections: [
        { key: 'feeding', heading: 'Alimentação', text: 'Consome sementes documentadas.' },
        { key: 'acousticPattern', heading: 'Vocalização', text: 'Repete duas notas.' },
      ],
    },
  });
  assert.deepEqual(topics.map((topic) => topic.key), ['diet', 'vocalization']);
  assert.equal(topics[0].scientific, 'Exemplum verum');
  assert.deepEqual(topics[0].sources, [source]);
});

test('existing exact topics are enriched instead of duplicated', () => {
  const merged = mergeSourceGroundedTopics([
    { key: 'habitat', label: 'Habitat', text: 'Texto curado.' },
  ], [{
    key: 'habitat',
    label: 'Distribuição e habitat',
    text: 'Texto documentado.',
    sources: [source],
    sourceIds: ['wikipedia'],
  }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].label, 'Habitat');
  assert.equal(merged[0].text, 'Texto curado.\n\nTexto documentado.');
  assert.deepEqual(merged[0].sourceIds, ['wikipedia']);
});

test('missing source means no synthetic topic', () => {
  assert.deepEqual(buildSourceGroundedTopics({
    dossier: {
      scientific: 'Exemplum verum',
      sources: [],
      wikiSections: [{ key: 'habitat', heading: 'Habitat', text: 'Texto sem fonte.' }],
    },
  }), []);
});
