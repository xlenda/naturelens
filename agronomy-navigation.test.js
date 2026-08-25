const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

test('manejo avancado abre de toda rota que pode mostrar uma lavoura', () => {
  const app = read('App.js');
  assert.match(app, /import AgronomyWorkspaceScreen from '\.\/screens\/AgronomyWorkspaceScreen'/);
  assert.match(app, /categoryKey === 'crop'[\s\S]+name="AgronomyWorkspace" component=\{AgronomyWorkspaceScreen\}/);

  const registrations = app.match(/name="AgronomyWorkspace" component=\{AgronomyWorkspaceScreen\}/g) || [];
  assert.equal(registrations.length, 3, 'scan, colecao e Discover precisam conhecer a rota');

  const dock = read('components/TwoRowTabBar.js');
  assert.match(dock, /'AgronomyWorkspace'/);
  assert.match(dock, /hiddenDock:\s*\{ height:\s*0 \}/);
});
test('ficha de cultura abre o workspace e conserva o perfil ao salvar ou remover', () => {
  const crop = read('screens/CropDetailScreen.js');
  assert.match(crop, /agronomySubjectKey/);
  assert.match(crop, /moveAgronomyProfileSubject/);
  assert.match(crop, /navigation\.navigate\('AgronomyWorkspace',\s*\{[\s\S]+entity: plant,[\s\S]+savedId:/);
  assert.match(crop, /agronomyWorkspace\.openTitle/);
  assert.match(crop, /agronomyWorkspace\.openBody/);
  assert.match(crop, /agronomyWorkspace\.openAction/);

  const saveMove = crop.indexOf('const savedAgronomyKey');
  const savedVisual = crop.indexOf('setSaved(true)', saveMove);
  assert.ok(saveMove >= 0 && savedVisual > saveMove, 'perfil deve migrar antes de confirmar o novo savedId');
});

test('apagar dados locais inclui perfil e diario agronomico', () => {
  const storage = read('components/storage.js');
  assert.match(storage, /const \{ clearAgronomyData \} = require\('\.\/agronomyStorage'\)/);
  assert.match(storage, /await clearAgronomyData\(\)/);
});
