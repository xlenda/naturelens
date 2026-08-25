const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildMushroomTopics,
  buildSoundTopics,
} = require('./components/mushroomSoundTopics');
const {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} = require('./components/sourceGroundedTopics');

const ROOT = __dirname;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const labels = {
  safety: 'Seguranca',
  lookAlikes: 'Especies parecidas',
  evidence: 'Evidencia de audio',
  overview: 'Visao geral',
  habitat: 'Habitat',
  curiosity: 'Curiosidade',
  details: 'Detalhes',
};

test('every available mushroom field becomes a real manual topic', () => {
  const topics = buildMushroomTopics({
    labels,
    safetyText: 'Nao consuma com base no aplicativo.',
    lookAlikes: [{
      name: 'Amanita citrina',
      description: 'Chapeu mais claro',
      features: 'Base bulbosa',
    }],
    overview: 'Fungo documentado pelo fornecedor.',
    habitat: 'Bosques de faias.',
    curiosity: 'Forma micorrizas.',
    detailRows: [
      { label: 'Familia', value: 'Amanitaceae' },
      { label: 'Nomes comuns', value: ['Chapeu-da-morte', 'Cicuta-verde'] },
      { label: 'Ordem', value: null },
    ],
  });

  assert.deepEqual(topics.map((topic) => topic.key), [
    'safety',
    'confusas',
    'overview',
    'habitat',
    'curiosity',
    'details',
  ]);
  assert.match(topics.find((topic) => topic.key === 'confusas').text, /Amanita citrina.*Chapeu mais claro.*Base bulbosa/);
  assert.match(topics.find((topic) => topic.key === 'details').text, /Nomes comuns: Chapeu-da-morte, Cicuta-verde/);
  assert.doesNotMatch(topics.find((topic) => topic.key === 'details').text, /Ordem/);
});

test('missing mushroom evidence removes the entire corresponding topic', () => {
  const topics = buildMushroomTopics({
    labels,
    safetyText: 'Aviso de seguranca.',
    lookAlikes: [{ name: '  ', description: null }],
    overview: ' ',
    habitat: null,
    curiosity: undefined,
    detailRows: [{ label: 'Familia', value: null }],
  });

  assert.deepEqual(topics.map((topic) => topic.key), ['safety']);
  assert.equal(buildMushroomTopics({ labels }).length, 0);
});

test('exact sourced sections add only the mushroom and sound facts returned by the dossier', () => {
  const source = {
    id: 'wikipedia',
    url: 'https://pt.wikipedia.org/wiki/Amanita_muscaria',
    license: 'CC-BY-SA-4.0',
  };
  const mushroomTopics = buildSourceGroundedTopics({
    dossier: {
      scientific: 'Amanita muscaria',
      sources: [source],
      wikiSections: [
        { key: 'reproduction', heading: 'Esporos', text: 'Os esporos documentados formam uma impressao branca.' },
        { key: 'substrate', heading: 'Substrato', text: 'Forma associacoes micorrizicas documentadas.' },
      ],
    },
  });
  assert.deepEqual(mushroomTopics.map((topic) => topic.key), ['reproduction', 'substrate']);
  assert.ok(mushroomTopics.every((topic) => topic.scientific === 'Amanita muscaria'));

  const soundTopics = buildSourceGroundedTopics({
    dossier: {
      scientific: 'Strix aluco',
      sources: [{ ...source, url: 'https://pt.wikipedia.org/wiki/Strix_aluco' }],
      wikiSections: [
        { key: 'acousticPattern', heading: 'Vocalizacao', text: 'O chamado documentado repete uma sequencia reconhecivel.' },
        { key: 'behavior', heading: 'Comportamento', text: 'A atividade noturna esta descrita na fonte.' },
      ],
    },
  });
  assert.deepEqual(soundTopics.map((topic) => topic.key), ['vocalization', 'behavior']);
  assert.equal(soundTopics.some((topic) => topic.key === 'frequencyTiming'), false);

  const merged = mergeSourceGroundedTopics([
    { key: 'habitat', label: 'Habitat', text: 'Texto curado.' },
  ], buildSourceGroundedTopics({
    dossier: {
      scientific: 'Strix aluco',
      sources: [{ ...source, url: 'https://pt.wikipedia.org/wiki/Strix_aluco' }],
      wikiSections: [{ key: 'habitat', heading: 'Habitat', text: 'Texto documentado pela fonte.' }],
    },
  }));
  assert.equal(merged.length, 1);
  assert.match(merged[0].text, /Texto curado\.\n\nTexto documentado/);
  assert.deepEqual(merged[0].sourceIds, ['wikipedia']);
});

test('sound exposes only the evidence and sourced species facts it actually has', () => {
  const topics = buildSoundTopics({
    labels,
    presentation: { evidence: { icon: 'pulse-outline', color: '#12AA77' } },
    evidenceLines: ['Gravacao analisada', '8 segundos', 'Confianca: 91%'],
    overview: 'Ave ouvida ao anoitecer.',
    habitat: 'Bosque maduro.',
    curiosity: 'O casal responde em dueto.',
    detailRows: [
      { label: 'Identificado', value: 'Strix aluco' },
      { label: 'Grupo', value: 'Ave' },
      { label: 'Nomes comuns', value: ['Coruja-do-mato', 'Coruja-parda'] },
      { label: 'Descricao tecnica', value: 'Coruja robusta de cabeca arredondada.' },
    ],
  });

  assert.deepEqual(topics.map((topic) => topic.key), [
    'evidence',
    'overview',
    'habitat',
    'curiosity',
    'details',
  ]);
  assert.equal(topics[0].icon, 'pulse-outline');
  assert.match(topics[0].text, /Gravacao analisada\n8 segundos\nConfianca/);
  assert.match(topics.at(-1).text, /Descricao tecnica: Coruja robusta/);
});

test('a reopened sound without retained evidence or sourced prose renders no empty topic', () => {
  const topics = buildSoundTopics({
    labels,
    evidenceLines: [],
    overview: null,
    habitat: '',
    curiosity: undefined,
    detailRows: [{ label: 'Grupo', value: null }],
  });
  assert.deepEqual(topics, []);
});

test('mushroom and sound screens keep every truthful layer visible by default', () => {
  const mushroom = read('screens/MushroomDetailScreen.js');
  const sound = read('screens/SoundDetailScreen.js');

  assert.match(mushroom, /import \{ buildMushroomTopics \}/);
  assert.match(mushroom, /buildMushroomTopics\(\{[\s\S]*detailRows: detailsTopicRows/);
  assert.match(mushroom, /t\('detail\.commonNames'\), value: technicalText\(plant\.commonNames\)/);
  assert.match(mushroom, /const resultDepth = RESULT_DEPTHS\.EXPERT;/);
  assert.doesNotMatch(mushroom, /<ResultDepthSwitcher|useResultDepthPreference/);
  assert.ok(mushroom.indexOf('<TopicNavigatorCard') < mushroom.indexOf('depth={RESULT_DEPTHS.EXPERT}'));
  assert.match(mushroom, /<TopicNavigatorCard[\s\S]{0,180}loading=\{curatedLoading \|\| dossierLoading\}/);
  assert.match(mushroom, /getSpeciesGroup\(\{[\s\S]{0,180}scientific: enrichmentScientific,[\s\S]{0,180}family: plant\.family,[\s\S]{0,180}ord: plant\.ord/);
  assert.match(mushroom, /entityName=\{plant\.name\}/);

  assert.match(sound, /import \{ buildSoundTopics \}/);
  assert.match(sound, /buildSoundTopics\(\{[\s\S]*evidenceLines,[\s\S]*detailRows:/);
  assert.match(sound, /t\('common\.technicalDescription'\), value: readerDescription/);
  assert.match(sound, /t\('detail\.commonNames'\), value: plant\.commonNames/);
  assert.match(sound, /const resultDepth = RESULT_DEPTHS\.EXPERT;/);
  assert.doesNotMatch(sound, /<ResultDepthSwitcher|useResultDepthPreference/);
  assert.ok(sound.indexOf('<TopicNavigatorCard') < sound.indexOf('depth={RESULT_DEPTHS.EXPERT}'));
  assert.match(sound, /<TopicNavigatorCard[\s\S]{0,180}loading=\{topicsLoading\}/);
  assert.doesNotMatch(sound, /sound\.noContentBody/);
});

test('sound async enrichment is bound to language and exact identity without inventing audio evidence', () => {
  const sound = read('screens/SoundDetailScreen.js');

  assert.match(sound, /const lookupKey = `\$\{i18n\.language\}\|\$\{enrichmentScientific \|\| ''\}`/);
  assert.match(sound, /const info = infoState\.key === lookupKey \? infoState\.value : null/);
  assert.match(sound, /const curated = curatedState\.key === lookupKey \? curatedState\.value : null/);
  assert.match(sound, /const speciesDossier = dossierState\.key === lookupKey \? dossierState\.value : null/);
  assert.match(sound, /setInfoState\(\{ key: lookupKey, value \}\)/);
  assert.match(sound, /setCuratedState\(\{ key: lookupKey, value \}\)/);
  assert.match(sound, /const hasAudioEvidence = hasUsableAudioEvidence\(waveform, durationSeconds\)/);
  assert.match(sound, /const evidenceLines = hasAudioEvidence[\s\S]{0,260}durationSeconds/);
});

test('mushroom and sound request and merge dossiers only behind exact identity', () => {
  for (const [file, category] of [
    ['screens/MushroomDetailScreen.js', 'mushroom'],
    ['screens/SoundDetailScreen.js', 'sound'],
  ]) {
    const screen = read(file);
    assert.match(screen, /import \{ getSpeciesDossier \}/);
    assert.match(screen, /buildSourceGroundedTopics/);
    assert.match(screen, /mergeSourceGroundedTopics/);
    assert.match(screen, /if \(!enrichmentScientific\) return/);
    assert.match(screen, new RegExp(`getSpeciesDossier\\(\\{[\\s\\S]{0,180}category: '${category}'`));
    assert.match(screen, /scientific: enrichmentScientific/);
    assert.doesNotMatch(screen, /getSpeciesDossier\(\{[\s\S]{0,180}scientific: plant\.scientific/);
    assert.match(screen, /const sourceTopics = buildSourceGroundedTopics\(\{ dossier: speciesDossier \}\)/);
    if (category === 'mushroom') {
      assert.match(screen, /mergeSourceGroundedTopics\(baseTopics, sourceTopics\)/);
    } else {
      assert.match(screen, /mergeSourceGroundedTopics\(baseTopics, sourceTopics\)/);
      assert.doesNotMatch(screen, /\.splice\(/);
    }
  }
});
