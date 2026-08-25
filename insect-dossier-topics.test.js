const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { normaliseSpeciesDossier } = require('./components/speciesDossier');
const { buildInsectDossierTopics } = require('./components/insectDossierTopics');
const { getInsectLifeStageProfile } = require('./components/insectLifeStageRegistry');

const pt = JSON.parse(fs.readFileSync('public/locales/pt.json', 'utf8'));
const scientific = 'Anticarsia gemmatalis';
const gbif = { id: 'gbif', url: 'https://www.gbif.org/species/1777942', license: 'CC-BY-4.0' };
const globi = {
  id: 'globi',
  url: `https://globalbioticinteractions.org/?sourceTaxon=${encodeURIComponent(scientific)}`,
  license: 'CC-BY-4.0',
};

function translate(key, values = {}) {
  let value = key.split('.').reduce((current, part) => current?.[part], pt);
  if (typeof value !== 'string') return key;
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replaceAll(`{{${name}}}`, String(replacement));
  }
  return value;
}

function dossier() {
  return normaliseSpeciesDossier({
    scientific,
    taxonomy: {
      sourceId: 'gbif', species: scientific, kingdom: 'Animalia', phylum: 'Arthropoda',
      class: 'Insecta', order: 'Lepidoptera', family: 'Erebidae', genus: 'Anticarsia',
    },
    diet: [], habitat: [], reproduction: [], lifeCycle: [], conservation: null,
    feeding: [{ id: 'eats:GBIF:2893188', name: 'Glycine max', relation: 'eats' }],
    plantAssociations: [{ id: 'eats:GBIF:2893188', name: 'Glycine max', relation: 'eats' }],
    ecologicalRelations: [{ id: 'hasHost:GBIF:2893188', name: 'Glycine max', relation: 'hasHost' }],
    documentedLifeStages: [],
    sources: [gbif, globi],
    partial: false,
  }, scientific);
}

test('Anticarsia builds real dynamic tabs plus six exact larval instars', () => {
  const topics = buildInsectDossierTopics({
    scientific,
    dossier: dossier(),
    order: 'Lepidoptera',
    taxonClass: 'Insecta',
    language: 'pt-BR',
    translate,
    baseTopics: [{ key: 'overview', label: 'Visão Geral', text: 'Espécie documentada.' }],
  });

  assert.deepEqual(topics.map((topic) => topic.key), [
    'overview', 'diet', 'plantAssociations', 'role', 'lifeStages',
  ]);
  assert.match(topics.find((topic) => topic.key === 'diet').text, /Glycine max/);
  const stages = topics.find((topic) => topic.key === 'lifeStages');
  assert.equal(stages.stageProfile.larvalInstars, 6);
  assert.deepEqual(stages.stageProfile.groups.map((group) => [group.from, group.to]), [[1, 3], [4, 6]]);
  assert.equal(stages.stageProfile.groups[0].leafConsumptionPercent, 5);
  assert.equal(stages.stageProfile.groups[1].leafConsumptionPercent, 95);
  assert.deepEqual(stages.stageProfile.groups[1].leafAreaCm2, { min: 100, max: 120 });
  assert.deepEqual(stages.sourceIds, ['embrapa-soy-caterpillar']);
  assert.equal(stages.orderStageProfile, undefined,
    'order-level metamorphosis must not replace exact species evidence');
});

test('candidate bee receives an honest Hymenoptera life-cycle fallback', () => {
  const topics = buildInsectDossierTopics({
    scientific: null,
    dossier: null,
    order: 'Hymenoptera',
    taxonClass: 'Insecta',
    language: 'pt-BR',
    translate,
    baseTopics: [{ key: 'overview', label: 'Visao geral', text: 'Identidade ainda candidata.' }],
  });

  assert.deepEqual(topics.map((topic) => topic.key), ['overview', 'lifeStages']);
  const stages = topics.find((topic) => topic.key === 'lifeStages');
  assert.equal(stages.groupOnly, true);
  assert.deepEqual(stages.orderStageProfile.stages, ['egg', 'larva', 'pupa', 'adult']);
  assert.equal(stages.orderStageProfile.order, 'Hymenoptera');
  assert.equal(stages.orderStageProfile.metamorphosis, 'complete');
  assert.deepEqual(stages.sourceIds, ['nc-state-insect-metamorphosis']);
  assert.equal(stages.orderStageProfile.source.id, 'nc-state-insect-metamorphosis');
});

test('order fallback is insect-only and does not classify an arachnid as a bee', () => {
  const topics = buildInsectDossierTopics({
    scientific: null,
    dossier: null,
    order: 'Hymenoptera',
    taxonClass: 'Arachnida',
    language: 'pt-BR',
    translate,
    baseTopics: [{ key: 'overview', label: 'Visao geral', text: 'Aracnideo.' }],
  });

  assert.deepEqual(topics.map((topic) => topic.key), ['overview']);
});

test('larval evidence is exact-species only and never becomes generic caterpillar advice', () => {
  assert.equal(getInsectLifeStageProfile('Anticarsia gemmatalis')?.larvalInstars, 6);
  assert.equal(getInsectLifeStageProfile('Chrysodeixis includens'), null);
  assert.equal(getInsectLifeStageProfile('anticarsia gemmatalis'), null);

  const otherTopics = buildInsectDossierTopics({
    scientific: 'Chrysodeixis includens', dossier: null, language: 'pt', translate,
    baseTopics: [{ key: 'overview', label: 'Visão Geral', text: 'Outro inseto.' }],
  });
  assert.deepEqual(otherTopics.map((topic) => topic.key), ['overview']);
});

test('GloBI facts disappear on identity/source mismatch while truthful local tabs remain', () => {
  const wrongSource = {
    ...dossier(),
    sources: [gbif, { ...globi, url: 'https://globalbioticinteractions.org/?sourceTaxon=Danaus%20plexippus' }],
  };
  const topics = buildInsectDossierTopics({
    scientific,
    dossier: wrongSource,
    language: 'pt',
    translate,
    baseTopics: [{ key: 'safety', label: 'Segurança', text: 'Cuidado documentado.' }],
  });
  assert.deepEqual(topics.map((topic) => topic.key), ['safety', 'lifeStages']);
  assert.doesNotMatch(JSON.stringify(topics), /watering|fertilizer|rega|aduba/i);
});
