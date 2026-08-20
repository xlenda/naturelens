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
  const dirs = ['components', 'screens', 'api', 'scripts'];
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
