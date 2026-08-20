const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// O helper e ESM (o app inteiro e). Aqui roda em CommonJS, entao o teste le a
// fonte e avalia - o mesmo padrao dos outros portoes deste repo.
const source = fs
  .readFileSync(path.join(__dirname, 'components', 'sentences.js'), 'utf8')
  .replace(/export function/g, 'function');
const splitSentences = new Function(source + '; return splitSentences;')();

test('nenhum arquivo do app usa lookbehind em regex', () => {
  // O motivo de este helper existir: `(?<=` e SyntaxError de PARSE no Safari
  // < 16.4 e derruba o BUNDLE INTEIRO, nao so a tela. Este portao impede a
  // quarta copia de voltar.
  // So o codigo que roda no NAVEGADOR. scripts/ e api/ rodam em Node (build e
  // Vercel), onde lookbehind funciona desde sempre - proibir la seria portao
  // mentindo sobre o risco. public/ entra porque o service worker roda no
  // navegador do usuario igual ao bundle.
  const dirs = ['components', 'screens', 'public'];
  for (const arquivoRaiz of ['App.js', 'i18n.js']) {
    const p = path.join(__dirname, arquivoRaiz);
    if (!fs.existsSync(p)) continue;
    assert.ok(
      !fs.readFileSync(p, 'utf8').includes('(?<='),
      `${arquivoRaiz} usa lookbehind - o app abre em branco em iOS 15. Use splitSentences().`
    );
  }
  for (const dir of dirs) {
    const full = path.join(__dirname, dir);
    if (!fs.existsSync(full)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        // O proprio helper cita a sequencia proibida no comentario que explica
        // por que ele existe - a documentacao da regra nao pode disparar a regra.
        else if (entry.name.endsWith('.js') && entry.name !== 'sentences.js') {
          const src = fs.readFileSync(p, 'utf8');
          assert.ok(
            !src.includes('(?<='),
            `${p} usa lookbehind - o app abre em branco em iOS 15. Use splitSentences().`
          );
        }
      }
    };
    walk(full);
  }
});

test('corta por frase', () => {
  assert.deepEqual(splitSentences('Esta planta e toxica. Mantenha longe de gatos e caes.'), [
    'Esta planta e toxica.',
    'Mantenha longe de gatos e caes.',
  ]);
});

test('nao corta dentro de abreviacao', () => {
  const parts = splitSentences('Descrita por Dr. Silva em 1890. Cresce rapido em solo umido.');
  assert.equal(parts.length, 2);
  assert.ok(parts[0].includes('Dr. Silva'), 'quebrou dentro da abreviacao: ' + parts[0]);
});

test('farelo final nao vira linha propria', () => {
  const parts = splitSentences('Regue quando o solo secar. Etc.');
  assert.equal(parts.length, 1, 'o farelo tinha que ter juntado com a frase anterior');
});

test('texto sem ponto final devolve uma frase so', () => {
  assert.deepEqual(splitSentences('这种植物有毒'), ['这种植物有毒']);
});

test('vazio nao vira frase', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(null), []);
  assert.deepEqual(splitSentences('   '), []);
});

// Os tres casos abaixo vieram de uma revisao independente do proprio diff
// (20/08). Os dois primeiros eram CORRUPCAO de texto na tela, nao so corte
// feio - o usuario lia um numero errado.
test('numero decimal nao e cortado ao meio', () => {
  // "Grows 1.5 m tall." virava "Grows 1. 5 m tall." na tela.
  assert.deepEqual(splitSentences('Grows 1.5 m tall. Prefers shade.'), [
    'Grows 1.5 m tall.',
    'Prefers shade.',
  ]);
});

test('chines e japones cortam em 。！？', () => {
  // Sem o terminador de largura cheia a descricao inteira virava UMA frase:
  // o "Ver mais" nunca aparecia e o manual nunca virava topicos em zh/zh-hant.
  assert.deepEqual(splitSentences('喜阳。保持土壤湿润。避免积水。'), [
    '喜阳。',
    '保持土壤湿润。',
    '避免积水。',
  ]);
});

test('frase curta legitima continua sendo frase', () => {
  // O limiar de farelo era 15 caracteres e comia "Cresce rapido." inteiro.
  assert.equal(splitSentences('Descrita por Dr. Silva em 1890. Cresce rapido.').length, 2);
});
