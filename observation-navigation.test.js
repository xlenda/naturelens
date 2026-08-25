const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const DETAILS = [
  ['plant', 'screens/PlantDetailScreen.js'],
  ['tree', 'screens/TreeDetailScreen.js'],
  ['insect', 'screens/InsectDetailScreen.js'],
  ['mushroom', 'screens/MushroomDetailScreen.js'],
  ['fish', 'screens/FishDetailScreen.js'],
  ['bird', 'screens/BirdDetailScreen.js'],
  ['sound', 'screens/SoundDetailScreen.js'],
];

test('as sete categorias abrem o workspace somente com uma chave segura', () => {
  for (const [category, file] of DETAILS) {
    const source = read(file);
    assert.match(source, /observationSubjectKey\(plant, savedEntryId\)/, category);
    assert.match(
      source,
      /const observationKey = savedEntryId\s*\? observationSubjectKey\(plant, savedEntryId\)\s*: unsavedObservationKey/,
      `${category}: remover nao pode continuar usando o savedId antigo da entidade`,
    );
    assert.match(source, /if \(!observationKey\) return;/, category);
    assert.match(source, /\{observationKey \? \(/, category);
    assert.match(
      source,
      /navigation\.navigate\('ObservationWorkspace',\s*\{\s*entity: plant,\s*savedId: savedEntryId \|\| null,\s*\}\)/,
      `${category}: os parametros precisam preservar entidade e savedId exatos`,
    );
    assert.match(source, /observationWorkspace\.openTitle/, category);
    assert.match(source, /observationWorkspace\.openBody/, category);
    assert.match(source, /observationWorkspace\.openAction/, category);

    const didactic = source.indexOf('<DidacticFieldGuide');
    const cta = source.indexOf('{observationKey ? (');
    assert.ok(didactic >= 0 && cta > didactic, `${category}: CTA deve vir depois do guia didatico`);
  }
});

test('salvar e remover migram o diario antes de confirmar o novo estado visual', () => {
  for (const [category, file] of DETAILS) {
    const source = read(file);
    assert.match(source, /moveObservationSubject/, category);
    assert.match(
      source,
      /const previousObservationKey = observationKey \|\| detachedObservationKey\.current/,
      `${category}: salvar de novo na mesma sessao recupera uma chave salva sem fallback seguro`,
    );
    assert.match(
      source,
      /moveObservationSubject\(previousObservationKey, unsavedObservationKey\)/,
      `${category}: remover precisa manter o diario pela chave sem savedId`,
    );
    assert.match(
      source,
      /moveObservationSubject\(previousObservationKey, savedObservationKey\)/,
      `${category}: salvar precisa mover o diario para o savedId definitivo`,
    );

    const removeMove = source.indexOf(
      'await moveObservationSubject(previousObservationKey, unsavedObservationKey)',
    );
    const removedVisual = source.indexOf('setSaved(false)', removeMove);
    assert.ok(removeMove >= 0 && removedVisual > removeMove, `${category}: migrar antes de confirmar remocao`);

    const saveMove = source.indexOf(
      'await moveObservationSubject(previousObservationKey, savedObservationKey)',
    );
    const savedVisual = source.indexOf('setSaved(true)', saveMove);
    assert.ok(saveMove >= 0 && savedVisual > saveMove, `${category}: migrar antes de confirmar salvamento`);
  }
});

test('scan, som, colecao e Discover conhecem a rota sem misturar lavoura', () => {
  const app = read('App.js');
  assert.match(app, /import ObservationWorkspaceScreen from '\.\/screens\/ObservationWorkspaceScreen'/);
  assert.match(
    app,
    /categoryKey !== 'crop'[\s\S]+name="ObservationWorkspace" component=\{ObservationWorkspaceScreen\}/,
  );
  assert.match(
    app,
    /function SoundStackNav\(\)[\s\S]+name="ObservationWorkspace" component=\{ObservationWorkspaceScreen\}/,
  );
  assert.match(
    app,
    /CollectionStack\.Screen name="ObservationWorkspace" component=\{ObservationWorkspaceScreen\}/,
  );
  assert.match(
    app,
    /DiscoverStack\.Screen name="ObservationWorkspace" component=\{ObservationWorkspaceScreen\}/,
  );

  for (const category of ['plant', 'insect', 'mushroom', 'tree', 'fish', 'bird']) {
    assert.match(app, new RegExp(`makeScanStackNav\\('${category}'\\)`), category);
  }

  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /navigation\.navigate\('AgronomyWorkspace'/);
  assert.doesNotMatch(crop, /ObservationWorkspace|observationSubjectKey|moveObservationSubject/);
  assert.match(app, /categoryKey === 'crop'[\s\S]+name="AgronomyWorkspace"/);
});

test('workspace oculta o dock mantendo a View de altura zero', () => {
  const dock = read('components/TwoRowTabBar.js');
  assert.match(dock, /'ObservationWorkspace'/);
  assert.match(dock, /if \(HIDE_DOCK_ON\.has\(leafRouteName\)\) \{\s*return <View style=\{styles\.hiddenDock\} \/>/);
  assert.match(dock, /hiddenDock:\s*\{ height:\s*0 \}/);
  assert.doesNotMatch(dock, /HIDE_DOCK_ON\.has\(leafRouteName\)[\s\S]{0,80}return null/);
});

test('Meu Registro abre diretamente o workspace certo sem uma volta pela ficha', () => {
  const specimen = read('screens/SpecimenScreen.js');
  assert.match(specimen, /entry\?\.category === 'crop'/);
  assert.match(specimen, /route: 'AgronomyWorkspace'/);
  assert.match(specimen, /agronomySubjectKey\(entry, entry\.savedId\)/);
  assert.match(specimen, /route: 'ObservationWorkspace'/);
  assert.match(specimen, /observationSubjectKey\(entry, entry\.savedId\)/);
  assert.match(specimen, /navigation\.navigate\(advancedWorkspace\.route/);
  assert.match(specimen, /savedId: entry\.savedId/);
});
