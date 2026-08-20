const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Valor CRU decide a cor; ROTULO traduzido e o que a pessoa le.
//
// Tres campos do app tem esse contrato: `edibility` do cogumelo, `danger` do
// inseto e `severity` da doenca. Todos escolhem a cor do aviso casando a
// palavra em INGLES numa tabela ("deadly" -> vermelho). No dia em que a
// traducao por servidor entrou, os tres passaram a chegar traduzidos, a
// tabela deixou de casar e um cogumelo MORTAL virou laranja de aviso comum -
// a mesma cor de "nao comestivel". A degradacao e silenciosa: nada quebra,
// nada loga, so a cor mente.
//
// A regra que fecha isso e a mesma do `water`/`waterLabel`: o campo cru fica
// como dado, a traducao vai para `<campo>Label`. Este portao trava os dois
// lados do contrato - o servidor produzindo o rotulo, e a tela lendo o rotulo
// para TEXTO enquanto colore pelo CRU.

const raiz = __dirname;
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

test('o servidor nao traduz no lugar os campos que sao chave de cor', () => {
  const fonte = ler('api/_lib/translateEntity.js');
  const elegiveis = fonte.slice(fonte.indexOf('ELIGIBLE_KEYS'), fonte.indexOf('NEVER_TRANSLATE'));

  for (const campo of ['edibility', 'danger', 'water']) {
    assert.ok(
      !new RegExp(`'${campo}',`).test(elegiveis),
      `'${campo}' voltou para ELIGIBLE_KEYS - traduzido no lugar ele deixa de casar a tabela de cor`
    );
  }
});

test('o servidor produz o rotulo traduzido dos tres campos de risco', () => {
  const fonte = ler('api/_lib/translateEntity.js');
  for (const campo of ['water', 'edibility', 'danger', 'severity']) {
    assert.match(
      fonte,
      new RegExp(`campo:\\s*'${campo}'`),
      `translateEntity nao gera rotulo para '${campo}'`
    );
  }
});

test('cada tela le o rotulo para o texto e o valor cru para a cor', () => {
  const casos = [
    {
      arquivo: 'screens/MushroomDetailScreen.js',
      rotulo: /plant\.edibilityLabel\s*\|\|\s*plant\.edibility/,
      cor: /edibilityColor\(plant\.edibility\)/,
      campo: 'edibility',
    },
    {
      arquivo: 'screens/InsectDetailScreen.js',
      rotulo: /plant\.dangerLabel\?\.\[i\]\s*\|\|\s*d/,
      cor: /HIGH_RISK_TAGS\.includes\(d\)/,
      campo: 'danger',
    },
    {
      arquivo: 'components/DiseaseReport.js',
      rotulo: /disease\.severityLabel\s*\|\|\s*disease\.severity/,
      cor: /severityColor\(disease\.severity\)/,
      campo: 'severity',
    },
  ];

  for (const { arquivo, rotulo, cor, campo } of casos) {
    const fonte = ler(arquivo);
    assert.match(fonte, rotulo, `${arquivo}: o TEXTO de ${campo} tem que sair do rotulo traduzido`);
    assert.match(fonte, cor, `${arquivo}: a COR de ${campo} tem que vir do valor cru, nao do rotulo`);
  }
});

test('a tabela de cor do cogumelo cobre o pior caso em ingles', () => {
  // Se alguem traduzir a TABELA em vez do rotulo, o contrato se inverte e o
  // portao acima passaria enquanto a cor volta a errar.
  const fonte = ler('screens/MushroomDetailScreen.js');
  for (const chave of ['deadly', 'poisonous', 'toxic']) {
    assert.match(
      fonte,
      new RegExp(`${chave}:\\s*colors\\.error|'${chave}':\\s*colors\\.error`),
      `EDIBILITY_COLORS precisa mapear '${chave}' (em ingles) para colors.error`
    );
  }
});
