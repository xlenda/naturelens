'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const babel = require('@babel/core');

const ROOT = __dirname;
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function loadExpoModule(relativePath) {
  const file = path.join(ROOT, relativePath);
  const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
  const mod = { exports: {} };
  const localRequire = (request) => request.startsWith('.')
    ? require(path.resolve(path.dirname(file), request))
    : require(request);
  new Function('module', 'exports', 'require', code)(mod, mod.exports, localRequire);
  return mod.exports;
}

const evidence = loadExpoModule('components/globalAgronomyEvidence.js');
const { buildSourceGroundedTopics } = require('./components/sourceGroundedTopics');

function exactCrop(scientific = 'Zea mays') {
  return {
    category: 'crop',
    name: 'Milho',
    identityV1: {
      schemaVersion: 1,
      category: 'crop',
      status: 'exact',
      taxon: { canonicalName: scientific, rank: 'species' },
    },
  };
}

function cropDossier(scientific = 'Zea mays') {
  return {
    scientific,
    taxonomy: {
      sourceId: 'gbif',
      species: scientific,
      kingdom: 'Plantae',
      className: 'Liliopsida',
    },
    wikiSections: [
      { key: 'uses', heading: 'Usos', text: 'Uso alimentar documentado para esta espécie em diferentes regiões.' },
      { key: 'cultivation', heading: 'Cultivo', text: 'Histórico de cultivo documentado para esta espécie.' },
      { key: 'feeding', heading: 'Alimentação', text: 'Este tópico pertence a animais e deve ser removido.' },
    ],
    sources: [
      { id: 'gbif', url: 'https://www.gbif.org/species/5290052', license: 'CC-BY-4.0' },
      { id: 'wikipedia', url: 'https://pt.wikipedia.org/wiki/Milho', license: 'CC-BY-SA-4.0' },
    ],
    partial: false,
  };
}

test('world evidence requires the exact crop identity and the same GBIF Plantae leaf', () => {
  const entity = exactCrop();
  const dossier = cropDossier();
  assert.equal(evidence.hasExactCropIdentity(entity, 'Zea mays'), true);
  assert.equal(evidence.verifiedGlobalCropDossier(entity, 'Zea mays', dossier), dossier);

  for (const changed of [
    { ...entity, identityV1: { ...entity.identityV1, status: 'candidate' } },
    { ...entity, category: 'plant' },
    { ...entity, identityV1: { ...entity.identityV1, taxon: { canonicalName: 'Triticum aestivum', rank: 'species' } } },
  ]) {
    assert.equal(evidence.verifiedGlobalCropDossier(changed, 'Zea mays', dossier), null);
  }

  assert.equal(evidence.verifiedGlobalCropDossier(entity, 'Zea mays', {
    ...dossier,
    taxonomy: { ...dossier.taxonomy, kingdom: 'Animalia' },
  }), null);
  assert.equal(evidence.verifiedGlobalCropDossier(entity, 'Zea mays', {
    ...dossier,
    scientific: 'Triticum aestivum',
  }), null);
});

test('world evidence is executable only through the audited source-use registry', () => {
  const source = read('components/globalAgronomyEvidence.js');
  assert.match(source, /require\('\.\/globalAgronomySourceRegistry'\)/);
  assert.match(source, /isSourceUseAllowed\('gbif', SOURCE_USE\.IDENTITY\)/);
  assert.match(source, /isSourceUseAllowed\('wikipedia', SOURCE_USE\.DESCRIPTIVE_EVIDENCE\)/);
});

test('world evidence rejects forged source hosts and unsupported licences', () => {
  const entity = exactCrop();
  const dossier = cropDossier();
  for (const wikipedia of [
    { id: 'wikipedia', url: 'https://attacker.test/wiki/Milho', license: 'CC-BY-SA-4.0' },
    { id: 'wikipedia', url: 'https://pt.wikipedia.org/wiki/Milho', license: 'citation-only' },
  ]) {
    assert.equal(evidence.verifiedGlobalCropDossier(entity, 'Zea mays', {
      ...dossier,
      sources: [dossier.sources[0], wikipedia],
    }), null);
  }
});

test('only existing agronomic Wikipedia modules survive in a stable editorial order', () => {
  const entity = exactCrop();
  const dossier = cropDossier();
  const topics = buildSourceGroundedTopics({ dossier });
  const selected = evidence.selectGlobalAgronomyTopics({
    entity,
    scientific: 'Zea mays',
    dossier,
    topics,
  });

  assert.deepEqual(selected.map((topic) => topic.key), ['cultivation', 'uses']);
  assert.ok(selected.every((topic) => topic.scientific === 'Zea mays'));
  assert.ok(selected.every((topic) => topic.sourceIds.includes('wikipedia')));
  assert.equal(selected.some((topic) => topic.key === 'feeding'), false);
  assert.equal(selected.some((topic) => /dose|aduba/i.test(topic.key)), false);
});

test('language and scientific name form the stale-content boundary', () => {
  assert.equal(evidence.globalAgronomyDossierKey('pt-BR', 'Zea mays'), 'crop|pt-br|Zea mays');
  assert.equal(evidence.globalAgronomyDossierKey('en', 'Zea mays'), 'crop|en|Zea mays');
  assert.equal(evidence.globalAgronomyDossierKey('pt', 'Triticum aestivum'), 'crop|pt|Triticum aestivum');
  assert.equal(evidence.globalAgronomyDossierKey('', 'Zea mays'), null);
  assert.equal(evidence.globalAgronomyDossierKey('pt', ''), null);
});

test('the worldwide card is source-visible and explicitly separated from local numbers', () => {
  const source = read('components/GlobalAgronomyEvidenceCard.js');
  assert.match(source, /TopicNavigatorCard/);
  assert.match(source, /source\.license/);
  assert.match(source, /accessibilityRole="link"/);
  assert.match(source, /\+ `\. \$\{source\.license\}`/);
  assert.match(source, /Não é uma recomendação local/);
  assert.match(source, /não libera dose, receita de adubação nem tabela regional/);
  assert.doesNotMatch(source, /FertilizerTablesCard|PestManagementTablesCard|getFertilizerProfile/);
  assert.doesNotThrow(() => babel.transformFileSync(
    path.join(ROOT, 'components', 'GlobalAgronomyEvidenceCard.js'),
    { presets: ['babel-preset-expo'] }
  ));
});

test('workspace fetches and publishes the exact keyed dossier before local tables', () => {
  const source = read('screens/AgronomyWorkspaceScreen.js');
  assert.match(source, /globalAgronomyDossierKey\(i18n\.language, scientific\)/);
  assert.match(source, /globalDossierState\.key === globalDossierLookupKey/);
  assert.match(source, /hasExactCropIdentity\(entity, scientific\)/);
  assert.match(source, /getSpeciesDossier\(\{[\s\S]*category: 'crop',[\s\S]*scientific,[\s\S]*language: i18n\.language/);
  assert.match(source, /activeTab !== 'agronomist'/);
  assert.match(source, /verifiedGlobalCropDossier\(entity, scientific, keyedGlobalDossier\)/);
  assert.match(source, /buildSourceGroundedTopics\(\{ dossier: globalDossier \}\)/);
  assert.match(source, /usePublishSpeciesTopics\(globalTopicResourceKey, globalTopics\)/);
  assert.match(source, /navigation\.navigate\('CareTopics'/);

  const evidenceCard = source.indexOf('<GlobalAgronomyEvidenceCard');
  const pestTable = source.indexOf('<PestManagementTablesCard', evidenceCard);
  const fertilizerTable = source.indexOf('<FertilizerTablesCard', evidenceCard);
  assert.ok(evidenceCard >= 0 && pestTable > evidenceCard && fertilizerTable > evidenceCard);
});
