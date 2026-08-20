// Auditoria de diagramacao 20/08: o card de Fatos Rapidos mostrava
// "Luz -> Esta planta prospera em condicoes de luz ..." porque os campos do
// vendor (best_light_condition, best_soil_type, toxicity) sao PROSA e a tela
// cortava com numberOfLines={2}. O "..." e o que fazia a tela parecer
// prototipo. Aqui a prosa vira um VALOR curto, por palavra-chave.
//
// HONESTIDADE ANTES DE COBERTURA: nada aqui inventa fato. Casou palavra-chave,
// devolve o rotulo curto; nao casou, devolve null - o card simplesmente nao
// entra na grade e a prosa inteira continua acessivel na aba do manual
// (CareTopics). Um card ausente e melhor que um card com meia frase.
//
// IDIOMA: as strings chegam JA TRADUZIDAS do servidor
// (api/_lib/translateEntity.js traduz toxicity/bestLightCondition/bestSoilType
// numa chamada Haiku antes de a entidade sair da API). As regras cobriam so
// EN e PT, entao a grade inteira de Fatos Rapidos sumia nos outros 15 idiomas -
// o app fica magro justamente para quem nao le ingles. As tabelas abaixo tem
// uma linha por idioma do SUPPORTED_LANGUAGES (i18n.js); acrescentar idioma e
// acrescentar uma linha.
//
// TOXICIDADE NAO PODE FALHAR EM SILENCIO: nos outros tres campos "sem card" quer
// dizer "sem dado". No de seguranca quer dizer "sem problema" para quem le - e
// era exatamente nas plantas perigosas de idioma nao coberto que o card sumia.
// Por isso a toxicidade tem um terceiro caminho: prosa que nao afirma nem
// perigo nem seguranca ainda entra na grade, como convite para a aba de
// seguranca, onde a frase do vendor esta inteira.

const rx = (alts) => new RegExp(alts.join('|'), 'i');

// Negacao. Ela e testada ANTES da palavra positiva e, mais que isso, e
// APAGADA do texto antes do teste positivo: "non-toxic to humans and pets"
// contem "toxic", e um /toxic/ ingenuo marcava de PERIGO justamente a planta
// segura. Em espanhol o furo era outro - "no es toxica" nao casava a negacao
// (a regra so conhecia o "nao e" portugues) e a planta ATOXICA saia marcada
// como Toxico.
//
// Apagar em vez de so testar tambem resolve a frase mista, que o vendor manda
// mais do que parece: "non-toxic to humans but toxic to cats" sobra com
// "toxic" depois do corte e vira PERIGO, que e o lado certo para errar.
const NOT_TOXIC = rx([
  'non[- ]?toxic|not toxic|non[- ]?poisonous|not poisonous|harmless', // en
  'n[aã]o [eé] t[oó]xic|n[aã]o t[oó]xic|at[oó]xic|n[aã]o [eé]? ?venenos', // pt
  // `in[oó]cu[ao]\b` fechado no fim de propria palavra: sem isso ele casaria o
  // comeco de "inoculacao" e uma prosa de risco viraria planta segura.
  'no es t[oó]xic|no t[oó]xic|no venenos|no es venenos|in[oó]cu[ao]\\b', // es
  'ungiftig|nicht giftig|nicht toxisch', // de
  "non toxique|n'est pas toxique|pas toxique|non v[eé]n[eé]neux", // fr
  'non ?[eè]? ?tossic|atossic|non ?[eè]? ?velenos', // it ("non e tossica" leva a copula no meio)
  'niet giftig|ongiftig|niet toxisch', // nl
  'nietoksyczn|nie jest toksyczn|nietruj[aą]c|nie jest truj[aą]c', // pl
  'ogiftig|inte giftig|icke[- ]giftig', // sv
  'ugiftig|ikke giftig|ikke[- ]giftig', // da
  'netoxick|nen[ií] toxick|nejedovat|nen[ií] jedovat', // cs
  'zehirli de[gğ]il|toksik de[gğ]il|zehirsiz', // tr
  '무독성|독성이 없|독성은 없|유독하지 않', // ko
  '无毒|没有毒|不含毒|无毒性', // zh
  '無毒|沒有毒|無毒性', // zh-hant
  'विषैला नहीं|विषाक्त नहीं|जहरीला नहीं|गैर[- ]विषैला', // hi
  'غير سام|غير سامة|ليست سامة|ليس سام', // ar
]);

// A mesma fonte, global, so para APAGAR as negacoes antes do teste positivo.
const NOT_TOXIC_ALL = new RegExp(NOT_TOXIC.source, 'gi');

// Afirmacao de perigo. Irritacao e "nocivo se ingerido" ficam DE FORA de
// proposito: nao sao toxicidade, e agora caem no convite para a aba em vez de
// virarem um rotulo mais forte que a frase do vendor.
const TOXIC = rx([
  'toxic|poisonous|venomous', // en
  't[oó]xic|venenos|pe[cç]onhent', // pt/es
  'giftig|toxisch', // de/nl/sv/da
  'toxique|v[eé]n[eé]neux|venimeux', // fr
  'tossic|velenos', // it
  'toksyczn|truj[aą]c|jadowit', // pl
  'toxick|jedovat', // cs
  'zehirli|toksik', // tr
  '독성|유독|중독', // ko
  '有毒|毒性|中毒', // zh + zh-hant
  'विषैल|विषाक्त|जहरील', // hi
  'سام|سامة|سمي', // ar
]);

// Ordem importa: "Full sun to partial shade" tem que sair como "Sol pleno",
// e "partial shade" nao pode cair na regra generica de sombra. O mesmo vale
// dentro de cada idioma - "Halbschatten" contem "schatten", "meia-sombra"
// contem "sombra", "半阴" contem "阴".
const RULES = {
  light: [
    [
      rx([
        'full sun', // en
        'sol pleno|pleno sol', // pt/es
        'volle[rn]? sonne|vollsonnig|sonnige', // de (voller Sonne / volle Sonne)
        'plein soleil', // fr
        'pieno sole', // it
        'volle zon', // nl
        'pe[lł]n[eym]* s[lł]o[nń]c', // pl
        'full sol|soligt', // sv
        'fuld sol|fuldt sollys', // da
        'pln[eé]m? slun|slunn', // cs
        'tam g[uü]ne[sş]', // tr
        '양지|전일조|햇빛이 잘', // ko
        '全日照|阳光充足|陽光充足', // zh + zh-hant
        'पूर्ण सूर्य|तेज धूप', // hi
        'شمس كاملة|شمس ساطعة', // ar
      ]),
      'detail.lightFullSun',
    ],
    [
      rx([
        'partial', // en
        'parcial|meia[- ]?sombra', // pt/es
        'semisombra|media sombra', // es
        'halbschatten|teilschatten|halbsonnig', // de
        'mi[- ]ombre|ombre partielle|mi[- ]soleil', // fr
        "mezz'ombra|mezza ombra|ombra parziale", // it
        'halfschaduw|halfzon', // nl
        'p[oó][lł]cie[nń]', // pl
        'halvskugga', // sv
        'halvskygge', // da
        'polost[ií]n', // cs
        'yar[iı] g[oö]lge', // tr
        '반음지|반그늘|밝은 그늘', // ko
        '半阴|半陰|半遮阴|半遮蔭|散射光', // zh + zh-hant
        'आंशिक छाया|अर्ध छाया', // hi
        'ظل جزئي|نصف ظل', // ar
      ]),
      'detail.lightPartial',
    ],
    [
      rx([
        'shade', // en
        'sombra|sombreado', // pt/es
        'schatten|schattig', // de
        'ombre|ombrag', // fr
        'ombra|ombreggiat', // it
        'schaduw', // nl
        'cie[nń]|cienist', // pl
        'skugga|skuggig', // sv
        'skygge', // da
        'st[ií]n|stinn', // cs
        'g[oö]lge', // tr
        '음지|그늘', // ko
        '遮阴|遮蔭|阴处|陰處|耐阴|耐蔭', // zh + zh-hant
        'छाया|छांव', // hi
        'ظل', // ar
      ]),
      'detail.lightShade',
    ],
  ],
  soil: [
    [
      rx([
        'well[- ]?drain', // en
        'bem drenad|boa drenagem', // pt
        'bien drenad|buen drenaje', // es
        'durchl[aä]ssig|gut drainiert|dr[aä]nage', // de
        'bien drain|drainant', // fr
        'ben drenat|drenante|drenaggio', // it
        'goed doorlatend|goed gedraineerd|waterdoorlatend', // nl
        'przepuszczaln|dobrze zdrenowan|drena[zż]', // pl
        'dr[aä]nerad', // sv
        'dr[aæ]net', // da
        'propustn|odvodn[eě]n', // cs
        'iyi drenajl[iı]|drenaj', // tr
        '배수가 잘|배수가 좋|물빠짐', // ko
        '排水良好|排水性好|疏水', // zh + zh-hant
        'जल निकासी', // hi
        'التصريف|تصريف جيد', // ar
      ]),
      'detail.soilWellDrained',
    ],
    [
      rx([
        'sandy', // en
        'arenos', // pt/es
        'sandig|sandbod', // de
        'sableux|sablonneux', // fr
        'sabbios', // it
        'zandig|zandgrond|zanderig', // nl
        'piaszczyst|piaskow', // pl
        'sandjord', // sv
        'sandet', // da
        'p[ií]s[cč]it', // cs
        'kumlu', // tr
        '모래', // ko
        '沙质|砂质|沙質|砂質', // zh + zh-hant
        'रेतीली|बलुई', // hi
        'رملية|رملي', // ar
      ]),
      'detail.soilSandy',
    ],
    [
      rx([
        'loam', // en
        'franco', // pt/es
        'lehmig|lehmbod|lehmige', // de
        'limoneux|terreau', // fr
        'terriccio', // it
        'leemgrond|leemachtig', // nl
        'gliniast', // pl
        'lerjord|mullrik', // sv
        'muldjord', // da
        'hlinit', // cs
        't[iı]nl[iı]|humuslu', // tr
        '양토', // ko
        '壤土', // zh + zh-hant
        'दोमट', // hi
        'طميية|طينية', // ar
      ]),
      'detail.soilLoam',
    ],
    [
      rx([
        'acidic', // en
        '[aá]cid', // pt/es/fr/it
        'sauer|saure', // de
        'zure|zuur', // nl
        'kwa[sś]n', // pl
        '\\bsurt\\b|\\bsura\\b|sur jord|surjord', // sv/da
        'kysel', // cs
        'asitli|asidik', // tr
        '산성', // ko
        '酸性', // zh + zh-hant
        'अम्लीय', // hi
        'حمضية|حامضية', // ar
      ]),
      'detail.soilAcidic',
    ],
  ],
  // 'toxicity' nao entra nesta tabela: ela decide entre perigo, seguranca e
  // "nao afirmou nada", e essa terceira saida nao existe nos outros campos.
  //
  // Rega: o vendor manda o rotulo composto ('Low (prefers dry soil) to
  // Medium' / 'Baixa (prefere solo seco) a Media'), que truncava no card em
  // 'Baixa (pr...'. A ordem casa o PRIMEIRO nivel citado, que e o piso da
  // faixa - e o dado acionavel ('pode regar pouco'), nao o teto.
  water: [
    [
      rx([
        '\\blow\\b', // en
        '\\bbaix', // pt
        '\\bbaj[oa]\\b|\\bescas|poco riego', // es
        '\\bgering|\\bwenig\\b|\\bniedrig', // de
        '\\bfaible|\\bpeu\\b', // fr
        '\\bbass[oa]\\b|\\bscars|\\bpoca\\b', // it
        '\\blaag\\b|\\bweinig\\b', // nl
        '\\bnisk|ma[lł]o\\b|niewielk', // pl
        '\\bl[aå]g', // sv
        '\\blav\\b|\\blidt\\b', // da
        'n[ií]zk|\\bm[aá]lo\\b', // cs
        '\\baz\\b|d[uü][sş][uü]k', // tr
        '적음|낮음|적게', // ko
        '低|少', // zh + zh-hant
        'कम', // hi
        'قليل|منخفض', // ar
      ]),
      'detail.waterLow',
    ],
    [
      rx([
        '\\bmedium\\b', // en
        '\\bm[eé]di', // pt/es/it
        '\\bmoderad', // es
        '\\bmittel|\\bm[aä][sß]ig', // de
        '\\bmoyen|\\bmod[eé]r', // fr
        '\\bgemiddeld|\\bmatig', // nl
        '[sś]redni|umiarkowan', // pl
        '\\bmedel|\\bm[aå]ttlig', // sv
        '\\bmiddel|\\bmoderat', // da
        'st[rř]edn[ií]|m[ií]rn', // cs
        '\\borta\\b', // tr
        '보통|중간', // ko
        '中等|适中|適中', // zh + zh-hant
        'मध्यम', // hi
        'متوسط', // ar
      ]),
      'detail.waterMedium',
    ],
    [
      rx([
        '\\bhigh\\b', // en
        '\\balta?\\b|\\belevad', // pt/es
        '\\bhoch\\b|\\bhohe|\\bviel\\b', // de
        // Sem \b antes de acento: em "Élevé" o \b do JS nao existe (E maiusculo
        // acentuado nao e \w), e a regra nunca casava o proprio rotulo do vendor.
        '[eé]lev[eé]|\\bbeaucoup\\b', // fr
        '\\babbondant', // it
        '\\bhoog\\b|\\bveel\\b', // nl
        'wysok|\\bdu[zż]o\\b', // pl
        '\\bh[oö]g', // sv
        '\\bh[oø]j|\\bmeget\\b', // da
        'vysok|hodn[eě]', // cs
        'y[uü]ksek|\\bbol\\b', // tr
        '많음|높음', // ko
        '多|高', // zh + zh-hant
        'अधिक|ज्यादा', // hi
        'كثير|عالي|مرتفع', // ar
      ]),
      'detail.waterHigh',
    ],
  ],
};

// Paridade 120% (video do concorrente, 20/08): o chip "Seguro para pets" do
// CareProfile precisa da MESMA regra de negacao, e nao de uma copia dela - uma
// segunda regex de toxicidade que saia de sincronia com esta marcaria de segura
// uma planta que este arquivo ja sabe ser toxica.
//
// O `true` aqui e AFIRMATIVO nos dois sentidos: o texto diz que nao e toxica e
// nao afirma perigo em lugar nenhum. "Non-toxic to humans but toxic to cats"
// nao vira chip de seguro para pets.
export function isNonToxic(text) {
  if (typeof text !== 'string') return false;
  return NOT_TOXIC.test(text) && !TOXIC.test(text.replace(NOT_TOXIC_ALL, ' '));
}

// kind: 'light' | 'soil' | 'toxicity' | 'water'. Devolve a string curta ja traduzida, ou
// null quando nao da pra ser curto sem inventar.
export default function shortFact(kind, text, t) {
  if (typeof text !== 'string' || !text.trim()) return null;

  if (kind === 'toxicity') {
    // Perigo primeiro, com as negacoes ja apagadas do texto.
    if (TOXIC.test(text.replace(NOT_TOXIC_ALL, ' '))) return t('detail.toxicShort');
    // O vendor afirmou que e segura: nada a avisar, o card sai da grade (o chip
    // de pet do CareProfile e quem conta a boa noticia).
    if (NOT_TOXIC.test(text)) return null;
    // Nao afirmou nem uma coisa nem outra. Sumir daqui e dizer "sem problema"
    // com o silencio; o card entra apontando para a aba, que tem a frase
    // inteira do vendor.
    return t('common.readMore');
  }

  const rules = RULES[kind];
  if (!rules) return null;
  for (const [pattern, key] of rules) {
    if (pattern.test(text)) return t(key);
  }
  return null;
}
