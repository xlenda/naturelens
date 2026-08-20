// Guarda do valor curto dos Fatos Rapidos (auditoria de diagramacao 20/08).
//
// POR QUE EXISTE
// O card mostrava "Luz -> Esta planta prospera em condicoes de luz ..." porque
// os campos do vendor (best_light_condition, best_soil_type, toxicity) sao
// PROSA e a tela cortava com numberOfLines={2}. components/shortFact.js troca a
// prosa por um rotulo curto quando reconhece uma palavra-chave, e devolve null
// quando nao reconhece - o card some em vez de mostrar meia frase.
//
// O caso que obriga este arquivo a existir e a NEGACAO: "non-toxic to humans
// and pets" e a frase mais comum que o vendor devolve no campo toxicity, e um
// /toxic/ ingenuo marcaria de PERIGO justamente a planta segura. Um regex e
// facil de "melhorar" sem perceber que se quebrou essa guarda.
//
// O modulo e ESM (import/export) e estes testes sao CommonJS, entao ele passa
// pelo babel do proprio projeto antes de ser exercitado - o que roda aqui e o
// arquivo de verdade, nao uma copia das regras.
//
// Rode com: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const file = path.join(__dirname, 'components', 'shortFact.js');
const { code } = babel.transformFileSync(file, { presets: ['babel-preset-expo'] });
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const shortFact = mod.exports.default;

// t() de teste devolve a propria chave, para provar QUAL rotulo foi escolhido
// em vez de so provar que "algo" voltou.
const f = (kind, text) => shortFact(kind, text, (k) => k);

test('luz: reconhece sol pleno, parcial e sombra em EN e PT', () => {
  assert.equal(
    f('light', 'This plant thrives in full sun conditions, requiring at least six hours of direct light per day.'),
    'detail.lightFullSun'
  );
  assert.equal(f('light', 'Prefers partial shade in the afternoon.'), 'detail.lightPartial');
  assert.equal(f('light', 'Grows best in deep shade under the canopy.'), 'detail.lightShade');
  assert.equal(
    f('light', 'Esta planta prospera em condicoes de sol pleno, precisando de luz direta.'),
    'detail.lightFullSun'
  );
  assert.equal(f('light', 'Prefere meia-sombra durante a tarde.'), 'detail.lightPartial');
  assert.equal(f('light', 'Cresce melhor na sombra densa do sub-bosque.'), 'detail.lightShade');
});

test('luz: "full sun to partial shade" sai como sol pleno, nao parcial', () => {
  // A ordem das regras e o unico motivo de isso funcionar - se alguem reordenar
  // RULES.light, este teste cai.
  assert.equal(f('light', 'Full sun to partial shade.'), 'detail.lightFullSun');
});

test('solo: reconhece drenado, arenoso, franco e acido', () => {
  assert.equal(f('soil', 'Needs a well-drained soil rich in organic matter.'), 'detail.soilWellDrained');
  assert.equal(f('soil', 'Prefere solo bem drenado e rico em materia organica.'), 'detail.soilWellDrained');
  assert.equal(f('soil', 'Sandy substrate suits it best.'), 'detail.soilSandy');
  assert.equal(f('soil', 'Solo arenoso e o ideal.'), 'detail.soilSandy');
  assert.equal(f('soil', 'A loam mix works well.'), 'detail.soilLoam');
  assert.equal(f('soil', 'Requires acidic conditions, pH below 6.'), 'detail.soilAcidic');
});

test('toxicidade: afirma o perigo quando o texto afirma o perigo', () => {
  assert.equal(f('toxicity', 'All parts of this plant are toxic if ingested.'), 'detail.toxicShort');
  assert.equal(f('toxicity', 'Todas as partes da planta sao toxicas se ingeridas.'), 'detail.toxicShort');
  assert.equal(f('toxicity', 'A planta e venenosa para gatos.'), 'detail.toxicShort');
});

test('toxicidade: NUNCA marca de perigo uma planta que o texto diz ser segura', () => {
  // A guarda que justifica este arquivo. Cada uma destas frases contem
  // "toxic"/"toxica" e NENHUMA delas pode virar o rotulo de perigo.
  const seguras = [
    'This plant is non-toxic to humans and pets.',
    'Non toxic to cats and dogs.',
    'The species is not toxic to cats or dogs.',
    'Esta planta nao e toxica para humanos e animais.',
    'Esta planta não é tóxica para humanos.',
    'Planta atoxica, segura para pets.',
  ];
  for (const frase of seguras) {
    assert.equal(f('toxicity', frase), null, `marcou de toxica uma planta segura: "${frase}"`);
  }
});

test('sem palavra-chave devolve null - o card some, nunca mostra meia frase', () => {
  // "Bright, indirect light" e o valor mais comum de planta de interior e de
  // proposito NAO casa: nao ha rotulo curto honesto para ele.
  assert.equal(f('light', 'Bright, indirect light near an east-facing window.'), null);
  // Idioma fora de EN/PT cai no fallback de proposito (as strings chegam
  // traduzidas pelo servidor; so estes dois estao cobertos).
  assert.equal(f('light', 'Diese Pflanze braucht viel Licht am Fenster.'), null);
  assert.equal(f('soil', 'Uma terra qualquer serve.'), null);
});

test('entrada ausente ou vazia nunca vira card', () => {
  assert.equal(f('light', null), null);
  assert.equal(f('light', undefined), null);
  assert.equal(f('light', ''), null);
  assert.equal(f('light', '   '), null);
  // Habitat e prosa e nao tem regra: e por isso que Bird e Sound perderam a
  // grade em vez de ganharem um valor inventado.
  assert.equal(f('habitat', 'Warm, shallow coral reefs and lagoons.'), null);
});
