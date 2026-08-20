const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { supportedCodes } = require('./test-locales');

// Ervas de risco interno documentado NAO publicam receita.
//
// O app tem 98 ervas com overview / preparation / benefits. Cinco perderam
// preparation e benefits porque a receita e instrucao de USO INTERNO de uma
// substancia com dano documentado - e "prepare assim e beba" e o tipo de
// texto que nao da pra corrigir depois que alguem seguiu.
//
// A auditoria de 20/08 pegou o app com um criterio que nao se defendia: a
// cascara sagrada tinha sido limpa, mas a senna - o MESMO antraquinonico
// estimulante - continuava com a receita. Este teste trava a regra por
// CLASSE, para a proxima erva adicionada nao reabrir o buraco em silencio.
const RISCO_INTERNO = [
  'coca', // Convencao Unica de 1961, Lista I
  'comfrey', // alcaloides pirrolizidinicos, hepatotoxicidade
  'cascaraSagrada', // antraquinonico estimulante
  'goldenseal',
  'hoodia',
  'senna', // mesma classe da cascara
  'cinchona', // quinina: margem terapeutica estreita, cinchonismo
  'africanWormwood', // tujona, abortivo
  'blackCohosh', // hepatotoxicidade
  'foti', // insuficiencia hepatica
];

const dir = path.join(__dirname, 'public', 'locales');

test('nenhuma erva de risco interno publica receita, em nenhum idioma', () => {
  const arquivos = supportedCodes()
    .map((c) => `${c}-herbs.json`)
    .filter((f) => fs.existsSync(path.join(dir, f)));

  assert.ok(arquivos.length >= 17, `esperava 17 arquivos de ervas, achei ${arquivos.length}`);

  for (const arquivo of arquivos) {
    const ervas = JSON.parse(fs.readFileSync(path.join(dir, arquivo), 'utf8'));
    for (const erva of RISCO_INTERNO) {
      if (!ervas[erva]) continue;
      for (const campo of ['preparation', 'benefits']) {
        assert.ok(
          !(campo in ervas[erva]),
          `${arquivo}: "${erva}" voltou a publicar ${campo} - e uma erva de risco interno documentado`
        );
      }
    }
  }
});

test('a tela nao renderiza card orfao quando a receita foi retirada', () => {
  // A regra so vale se a ausencia realmente sumir da tela. Um card com titulo
  // e corpo vazio seria pior que a receita: parece bug e convida a procurar a
  // informacao em outro lugar.
  const tela = fs.readFileSync(path.join(__dirname, 'screens', 'HerbDetailScreen.js'), 'utf8');
  for (const campo of ['preparation', 'benefits']) {
    assert.match(
      tela,
      new RegExp(`!!details\\.${campo}|details\\.${campo}\\s*&&`),
      `HerbDetailScreen precisa guardar o bloco de ${campo} com a existencia do dado`
    );
  }
});
