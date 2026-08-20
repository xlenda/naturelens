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
// E A NEGACAO E POR IDIOMA: em espanhol "no es toxica" nao casava a regra
// portuguesa e a planta ATOXICA saia marcada como Toxico. Por isso a tabela
// abaixo cobre os 17 idiomas do SUPPORTED_LANGUAGES um por um - um idioma sem
// caso aqui e um idioma onde ninguem sabe o que a tela mostra.
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
const isNonToxic = mod.exports.isNonToxic;

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
  // Alemao agora e coberto, mas "viel Licht am Fenster" continua sem cair em
  // sol pleno / meia-sombra / sombra - idioma coberto nao quer dizer palpite.
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

// --- os 17 idiomas -----------------------------------------------------------
//
// A prosa chega TRADUZIDA (api/_lib/translateEntity.js). Com regra so em EN e
// PT a grade inteira de Fatos Rapidos sumia em 15 idiomas: o app fica magro
// justamente para quem nao le ingles. Uma linha por idioma, na ordem do
// SUPPORTED_LANGUAGES do i18n.js.

const LUZ = [
  ['en', 'This plant thrives in full sun conditions.', 'detail.lightFullSun'],
  ['pt', 'Esta planta prospera em condicoes de sol pleno.', 'detail.lightFullSun'],
  ['es', 'Esta planta prospera a pleno sol durante todo el año.', 'detail.lightFullSun'],
  ['de', 'Diese Pflanze gedeiht in voller Sonne.', 'detail.lightFullSun'],
  ['fr', 'Cette plante prospère en plein soleil.', 'detail.lightFullSun'],
  ['it', 'Questa pianta prospera in pieno sole.', 'detail.lightFullSun'],
  ['nl', 'Deze plant gedijt in volle zon.', 'detail.lightFullSun'],
  ['pl', 'Ta roślina najlepiej rośnie w pełnym słońcu.', 'detail.lightFullSun'],
  ['sv', 'Denna växt trivs i full sol.', 'detail.lightFullSun'],
  ['da', 'Denne plante trives i fuld sol.', 'detail.lightFullSun'],
  ['cs', 'Tato rostlina prospívá na plném slunci.', 'detail.lightFullSun'],
  ['tr', 'Bu bitki tam güneş altında gelişir.', 'detail.lightFullSun'],
  ['ko', '이 식물은 양지에서 잘 자랍니다.', 'detail.lightFullSun'],
  ['zh', '这种植物在全日照条件下生长良好。', 'detail.lightFullSun'],
  ['zh-hant', '這種植物在全日照條件下生長良好。', 'detail.lightFullSun'],
  ['hi', 'यह पौधा पूर्ण सूर्य में पनपता है।', 'detail.lightFullSun'],
  ['ar', 'ينمو هذا النبات في شمس كاملة.', 'detail.lightFullSun'],
  // Meia-sombra e sombra, onde a ordem das regras e mais facil de quebrar:
  // "Halbschatten" contem "Schatten", "meia-sombra" contem "sombra",
  // "半阴" contem "阴".
  ['de', 'Bevorzugt Halbschatten am Nachmittag.', 'detail.lightPartial'],
  ['es', 'Prefiere sombra parcial por la tarde.', 'detail.lightPartial'],
  ['fr', 'Préfère la mi-ombre en début de journée.', 'detail.lightPartial'],
  ['it', "Preferisce la mezz'ombra nel pomeriggio.", 'detail.lightPartial'],
  ['nl', 'Geeft de voorkeur aan halfschaduw.', 'detail.lightPartial'],
  ['pl', 'Preferuje półcień w południe.', 'detail.lightPartial'],
  ['sv', 'Föredrar halvskugga under eftermiddagen.', 'detail.lightPartial'],
  ['da', 'Foretrækker halvskygge om eftermiddagen.', 'detail.lightPartial'],
  ['cs', 'Preferuje polostín odpoledne.', 'detail.lightPartial'],
  ['tr', 'Öğleden sonra yarı gölge tercih eder.', 'detail.lightPartial'],
  ['ko', '오후에는 반그늘을 선호합니다.', 'detail.lightPartial'],
  ['zh', '喜欢半阴的环境。', 'detail.lightPartial'],
  ['zh-hant', '喜歡半陰的環境。', 'detail.lightPartial'],
  ['hi', 'दोपहर में आंशिक छाया पसंद करता है।', 'detail.lightPartial'],
  ['ar', 'يفضل ظل جزئي بعد الظهر.', 'detail.lightPartial'],
  ['de', 'Wächst am besten im Schatten des Waldes.', 'detail.lightShade'],
  ['pl', 'Rośnie najlepiej w cieniu drzew.', 'detail.lightShade'],
  ['sv', 'Växer bäst i skugga.', 'detail.lightShade'],
  ['cs', 'Roste nejlépe ve stínu.', 'detail.lightShade'],
  ['ko', '그늘에서 가장 잘 자랍니다.', 'detail.lightShade'],
  ['zh', '在遮阴处生长最好。', 'detail.lightShade'],
  ['hi', 'छाया में सबसे अच्छा बढ़ता है।', 'detail.lightShade'],
  ['ar', 'ينمو بشكل أفضل في ظل.', 'detail.lightShade'],
];

const SOLO = [
  ['en', 'Needs a well-drained soil rich in organic matter.', 'detail.soilWellDrained'],
  ['pt', 'Prefere solo bem drenado e rico em materia organica.', 'detail.soilWellDrained'],
  ['es', 'Prefiere suelo bien drenado y rico en materia orgánica.', 'detail.soilWellDrained'],
  ['de', 'Benötigt einen gut durchlässigen Boden.', 'detail.soilWellDrained'],
  ['fr', 'Nécessite un sol bien drainé.', 'detail.soilWellDrained'],
  ['it', 'Richiede un terreno ben drenato.', 'detail.soilWellDrained'],
  ['nl', 'Heeft goed doorlatende grond nodig.', 'detail.soilWellDrained'],
  ['pl', 'Wymaga przepuszczalnej gleby.', 'detail.soilWellDrained'],
  ['sv', 'Kräver väldränerad jord.', 'detail.soilWellDrained'],
  ['da', 'Kræver veldrænet jord.', 'detail.soilWellDrained'],
  ['cs', 'Vyžaduje propustnou půdu.', 'detail.soilWellDrained'],
  ['tr', 'İyi drenajlı toprak gerektirir.', 'detail.soilWellDrained'],
  ['ko', '배수가 잘 되는 토양이 필요합니다.', 'detail.soilWellDrained'],
  ['zh', '需要排水良好的土壤。', 'detail.soilWellDrained'],
  ['zh-hant', '需要排水良好的土壤。', 'detail.soilWellDrained'],
  ['hi', 'अच्छी जल निकासी वाली मिट्टी चाहिए।', 'detail.soilWellDrained'],
  ['ar', 'يحتاج إلى تربة جيدة التصريف.', 'detail.soilWellDrained'],
  ['de', 'Sandiger Boden ist ideal.', 'detail.soilSandy'],
  ['tr', 'Kumlu toprak idealdir.', 'detail.soilSandy'],
  ['ko', '모래질 토양이 가장 좋습니다.', 'detail.soilSandy'],
  ['zh', '沙质土壤最合适。', 'detail.soilSandy'],
  ['ar', 'التربة الرملية هي الأفضل.', 'detail.soilSandy'],
  ['de', 'Bevorzugt sauren Boden.', 'detail.soilAcidic'],
  ['sv', 'Kräver surt substrat.', 'detail.soilAcidic'],
  ['ko', '산성 토양을 선호합니다.', 'detail.soilAcidic'],
  ['ar', 'يحتاج تربة حمضية.', 'detail.soilAcidic'],
];

// O rotulo composto do vendor ('Low (prefers dry soil) to Medium') tem que sair
// como o PISO da faixa em todo idioma - e o dado acionavel.
const REGA = [
  ['en', 'Low (prefers dry soil) to Medium', 'detail.waterLow'],
  ['pt', 'Baixa (prefere solo seco) a Media', 'detail.waterLow'],
  ['es', 'Bajo (prefiere suelo seco) a Medio', 'detail.waterLow'],
  ['de', 'Gering (bevorzugt trockenen Boden) bis Mittel', 'detail.waterLow'],
  ['fr', 'Faible (préfère un sol sec) à Moyen', 'detail.waterLow'],
  ['it', 'Basso (preferisce terreno asciutto) a Medio', 'detail.waterLow'],
  ['nl', 'Laag (geeft de voorkeur aan droge grond) tot Gemiddeld', 'detail.waterLow'],
  ['pl', 'Niski (preferuje suchą glebę) do Średni', 'detail.waterLow'],
  ['sv', 'Låg (föredrar torr jord) till Medel', 'detail.waterLow'],
  ['da', 'Lav (foretrækker tør jord) til Middel', 'detail.waterLow'],
  ['cs', 'Nízká (preferuje suchou půdu) až Střední', 'detail.waterLow'],
  ['tr', 'Az (kuru toprağı tercih eder) ila Orta', 'detail.waterLow'],
  ['ko', '적음(건조한 토양 선호)에서 보통', 'detail.waterLow'],
  ['zh', '低（喜干燥土壤）至中等', 'detail.waterLow'],
  ['zh-hant', '低（喜乾燥土壤）至中等', 'detail.waterLow'],
  ['hi', 'कम (सूखी मिट्टी पसंद) से मध्यम', 'detail.waterLow'],
  ['ar', 'قليل (يفضل التربة الجافة) إلى متوسط', 'detail.waterLow'],
  ['en', 'Medium', 'detail.waterMedium'],
  ['de', 'Mittel', 'detail.waterMedium'],
  ['pl', 'Średni', 'detail.waterMedium'],
  ['ko', '보통', 'detail.waterMedium'],
  ['zh', '中等', 'detail.waterMedium'],
  ['ar', 'متوسط', 'detail.waterMedium'],
  ['en', 'High (prefers moist soil)', 'detail.waterHigh'],
  ['pt', 'Alta (prefere solo umido)', 'detail.waterHigh'],
  ['de', 'Hoch (bevorzugt feuchten Boden)', 'detail.waterHigh'],
  ['fr', 'Élevé (préfère un sol humide)', 'detail.waterHigh'],
  ['ko', '많음(습한 토양 선호)', 'detail.waterHigh'],
  ['zh', '多（喜湿润土壤）', 'detail.waterHigh'],
  ['hi', 'अधिक (नम मिट्टी पसंद)', 'detail.waterHigh'],
  ['ar', 'كثير (يفضل التربة الرطبة)', 'detail.waterHigh'],
];

const PERIGO = [
  ['en', 'All parts of this plant are toxic if ingested.'],
  ['pt', 'Todas as partes da planta sao toxicas se ingeridas.'],
  ['es', 'Todas las partes de la planta son tóxicas si se ingieren.'],
  ['de', 'Alle Teile dieser Pflanze sind giftig.'],
  ['fr', 'Toutes les parties de cette plante sont toxiques.'],
  ['it', 'Tutte le parti di questa pianta sono tossiche.'],
  ['nl', 'Alle delen van deze plant zijn giftig.'],
  ['pl', 'Wszystkie części tej rośliny są trujące.'],
  ['sv', 'Alla delar av växten är giftiga.'],
  ['da', 'Alle dele af planten er giftige.'],
  ['cs', 'Všechny části rostliny jsou jedovaté.'],
  ['tr', 'Bu bitkinin tüm kısımları zehirlidir.'],
  ['ko', '이 식물의 모든 부분은 독성이 있습니다.'],
  ['zh', '这种植物的所有部分都有毒。'],
  ['zh-hant', '這種植物的所有部分都有毒。'],
  ['hi', 'इस पौधे के सभी भाग विषैले होते हैं।'],
  ['ar', 'جميع أجزاء هذا النبات سامة.'],
];

// A planta ATOXICA de cada idioma. Toda frase aqui contem a palavra positiva
// dentro da negacao - e o furo classico (o espanhol "no es tóxica" casava
// "tóxica" e a planta segura saia marcada de PERIGO).
const SEGURO = [
  ['en', 'This plant is non-toxic to humans and pets.'],
  ['pt', 'Esta planta não é tóxica para humanos e animais.'],
  ['es', 'Esta planta no es tóxica para humanos y mascotas.'],
  ['de', 'Diese Pflanze ist ungiftig für Haustiere.'],
  ['de', 'Diese Pflanze ist nicht giftig für Katzen.'],
  ['fr', 'Cette plante est non toxique pour les animaux.'],
  ['fr', "Cette plante n'est pas toxique pour les chats."],
  ['it', 'Questa pianta non è tossica per gli animali.'],
  ['nl', 'Deze plant is niet giftig voor huisdieren.'],
  ['pl', 'Ta roślina jest nietoksyczna dla zwierząt.'],
  ['pl', 'Ta roślina nie jest trująca dla kotów.'],
  ['sv', 'Denna växt är ogiftig för husdjur.'],
  ['sv', 'Denna växt är inte giftig för katter.'],
  ['da', 'Denne plante er ugiftig for kæledyr.'],
  ['da', 'Denne plante er ikke giftig for katte.'],
  ['cs', 'Tato rostlina je netoxická pro zvířata.'],
  ['cs', 'Tato rostlina není jedovatá pro kočky.'],
  ['tr', 'Bu bitki evcil hayvanlar için zehirli değil.'],
  ['tr', 'Bu bitki zehirsizdir.'],
  ['ko', '이 식물은 사람과 반려동물에게 독성이 없습니다.'],
  ['ko', '이 식물은 무독성입니다.'],
  ['zh', '这种植物对人和宠物无毒。'],
  ['zh-hant', '這種植物對人和寵物無毒。'],
  ['hi', 'यह पौधा मनुष्यों के लिए विषैला नहीं है।'],
  ['ar', 'هذا النبات غير سام للحيوانات الأليفة.'],
];

test('luz, solo e rega saem curtos nos 17 idiomas', () => {
  for (const [kind, tabela] of [['light', LUZ], ['soil', SOLO], ['water', REGA]]) {
    for (const [lang, texto, esperado] of tabela) {
      assert.equal(f(kind, texto), esperado, `[${lang}/${kind}] ${texto}`);
    }
  }
});

test('toxicidade: o perigo e afirmado nos 17 idiomas', () => {
  for (const [lang, texto] of PERIGO) {
    assert.equal(f('toxicity', texto), 'detail.toxicShort', `[${lang}] perdeu o aviso: ${texto}`);
  }
});

test('toxicidade: a NEGACAO vence a palavra positiva nos 17 idiomas', () => {
  for (const [lang, texto] of SEGURO) {
    assert.equal(f('toxicity', texto), null, `[${lang}] marcou de toxica uma planta segura: ${texto}`);
    assert.equal(isNonToxic(texto), true, `[${lang}] o chip de pet nao reconheceu a planta segura: ${texto}`);
  }
});

test('toxicidade: frase mista avisa - segura para um, toxica para outro', () => {
  // O vendor escreve isso mais do que parece. Apagar a negacao antes do teste
  // positivo e o que faz "toxic to cats" sobreviver ao "non-toxic to humans".
  assert.equal(f('toxicity', 'Non-toxic to humans but toxic to cats and dogs.'), 'detail.toxicShort');
  assert.equal(isNonToxic('Non-toxic to humans but toxic to cats and dogs.'), false);
});

test('toxicidade: prosa que nao afirma nada AINDA mostra o card', () => {
  // A regra que separa a toxicidade dos outros tres campos: aqui a ausencia do
  // card nao le como "sem dado", le como "sem problema". Sem palavra-chave o
  // card entra assim mesmo, como convite para a aba de seguranca - que tem a
  // frase inteira do vendor.
  assert.equal(f('toxicity', 'Keep out of reach of small children.'), 'common.readMore');
  assert.equal(f('toxicity', 'Mantenha fora do alcance de criancas pequenas.'), 'common.readMore');
  assert.equal(f('toxicity', 'Sap may stain clothing when the stem is cut.'), 'common.readMore');
  // Mas campo vazio continua sem card: isso e ausencia de dado, nao silencio
  // sobre risco.
  assert.equal(f('toxicity', ''), null);
  assert.equal(f('toxicity', null), null);
});
