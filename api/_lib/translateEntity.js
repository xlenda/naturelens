// Kindwise's ?language= localizes the species DESCRIPTION and common names,
// but every care field - toxicity, best watering/light/soil, common uses,
// cultural significance, edible parts, propagation, crop disease text - comes
// back ENGLISH-ONLY. The owner hit it live: UI in Portuguese, result half in
// English. This translates that batch server-side, in ONE Haiku call per
// identification, before the entity leaves the API.
//
// Doctrine line: translating vendor text is the already-approved mechanism
// (api/translate.js / the Translate button); it never INVENTS species facts -
// names, scientific names, ids and numbers are never sent to the model.
//
// Any failure - no key, timeout, malformed reply - returns the entity
// untouched: English beats an error, and the client renders either way.

const MODEL = 'claude-haiku-4-5-20251001';

const LANGUAGE_NAMES = {
  pt: 'Brazilian Portuguese', es: 'Spanish', de: 'German', fr: 'French',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', cs: 'Czech', sv: 'Swedish',
  da: 'Danish', tr: 'Turkish', hi: 'Hindi', ar: 'Arabic', ko: 'Korean',
  zh: 'Simplified Chinese', 'zh-hant': 'Traditional Chinese',
};

function languageKey(language) {
  const raw = String(language || '').trim().toLowerCase().replace('_', '-');
  if (!raw) return '';
  if (raw === 'zh-hant' || raw.startsWith('zh-hant-') || raw === 'zh-tw' || raw === 'zh-hk') {
    return 'zh-hant';
  }
  const base = raw.split('-')[0];
  return base === 'zh' ? 'zh' : base;
}

// Only these top-level keys are eligible - identity fields (name, scientific,
// id, url, confidence, alternatives, similarImages) must never reach the
// model. Nested arrays/objects under an eligible key are walked recursively.
const ELIGIBLE_KEYS = [
  'origin',
  'toxicity',
  'bestWatering',
  'bestLightCondition',
  'bestSoilType',
  'commonUses',
  'culturalSignificance',
  'edibleParts',
  'propagationMethods',
  'disease',
  // Prosa do fornecedor para fauna/fungos. O walker abaixo preserva nomes,
  // ids e URLs dentro dos objetos; so descricao e caracteristicas viajam.
  'role',
  'lookAlikeDetails',
  // As palavras de risco do cogumelo e do inseto ficavam de fora, entao quem
  // lia em portugues via o cartao inteiro traduzido e o rotulo de perigo em
  // ingles: 'deadly', 'poisonous', 'highly venomous'. Uma palavra de perigo
  // que o leitor nao entende e pior que texto nenhum - e justamente a palavra
  // pela qual ele abriu a tela.
  //
  // `edibility` e `danger` NAO estao aqui de proposito - eles viajam pelo
  // caminho de ROTULO logo abaixo. O valor cru em ingles e a CHAVE que decide
  // a cor do aviso (EDIBILITY_COLORS no cogumelo, HIGH_RISK_TAGS no inseto):
  // traduzido no lugar, um cogumelo MORTAL cairia no laranja de aviso comum em
  // vez do vermelho. O leitor precisa das duas coisas - a palavra no idioma
  // dele E a cor certa -, e so o par valor-cru + rotulo-traduzido entrega as
  // duas.
  'dangerDescription',
];

// Campos onde o valor cru e CHAVE de alguma decisao na tela e por isso nao
// pode ser traduzido no lugar: a traducao vai para `<campo>Label` e o original
// fica como dado. Comecou com `water` (chave do mapa de intervalo de rega em
// components/watering.js) e virou tabela quando a cor do risco passou pelo
// mesmo problema. `caminho` diz onde o campo mora dentro da entidade.
const ROTULOS = [
  { caminho: [], campo: 'water' },
  { caminho: [], campo: 'edibility' },
  { caminho: [], campo: 'danger' },
  { caminho: ['disease'], campo: 'severity' },
];

// Campos que NUNCA viajam, em qualquer profundidade. A URL da doenca voltava
// REESCRITA pelo modelo e ia direto para o Linking.openURL do DiseaseReport -
// um link morto entregue como fonte. Nome e nome cientifico sao identidade
// (a doutrina do topo deste arquivo) e o DiseaseReport ainda compara os dois
// para reconhecer o laudo-fantasma: traduzir um e nao o outro apagaria a
// comparacao. Aqui so viaja prosa.
// `severity` entra aqui porque `disease` E uma chave elegivel e o walk desce
// nela: sem esta linha, a gravidade era traduzida NO LUGAR (virando 'alto') e
// SEPARADAMENTE no rotulo, entao SEVERITY_COLORS perdia a chave inglesa e uma
// doenca grave saia laranja em vez de vermelha. O rotulo traduzido continua
// vindo pela tabela ROTULOS, que nao passa por aqui.
const NEVER_TRANSLATE = [
  'url',
  'name',
  'scientific',
  'id',
  'entity_id',
  'entityId',
  'gbif_id',
  'gbifId',
  'severity',
];

// Collects every translatable string under the eligible keys as {text, set}
// pairs, so the reply can be written back exactly where each string came from.
function collect(entity) {
  const items = [];
  const visit = (container, key) => {
    if (NEVER_TRANSLATE.includes(key)) return;
    const v = container[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 3) {
        items.push({
          text: t,
          set: (val) => {
            container[key] = val;
          },
        });
      }
    } else if (Array.isArray(v)) {
      v.forEach((_, i) => visit(v, i));
    } else if (v && typeof v === 'object') {
      Object.keys(v).forEach((k) => visit(v, k));
    }
  };

  for (const topKey of ELIGIBLE_KEYS) {
    if (entity[topKey] == null) continue;
    visit(entity, topKey);
  }

  // Rotulos: traduz para `<campo>Label` e deixa o valor cru intacto.
  for (const { caminho, campo } of ROTULOS) {
    let dono = entity;
    for (const passo of caminho) {
      dono = dono?.[passo];
      if (!dono || typeof dono !== 'object') break;
    }
    if (!dono || typeof dono !== 'object') continue;

    const valor = dono[campo];
    const rotulo = campo + 'Label';

    if (typeof valor === 'string' && valor.trim().length >= 3) {
      items.push({ text: valor.trim(), set: (val) => { dono[rotulo] = val; } });
    } else if (Array.isArray(valor)) {
      // Array (as tags de perigo do inseto): o rotulo e um array na MESMA
      // ordem, para a tela poder parear tag crua com tag traduzida por indice.
      dono[rotulo] = valor.slice();
      valor.forEach((item, i) => {
        if (typeof item === 'string' && item.trim().length >= 3) {
          items.push({ text: item.trim(), set: (val) => { dono[rotulo][i] = val; } });
        }
      });
    }
  }

  return items;
}

async function translateEntity(entity, language) {
  const langName = LANGUAGE_NAMES[languageKey(language)];
  if (!entity || !langName) return entity; // 'en' or unknown code: nothing to do

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return entity;

  const items = collect(entity);
  if (items.length === 0) return entity;

  const strings = {};
  items.forEach((item, i) => {
    strings[String(i + 1)] = item.text;
  });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system:
          `You translate app content about plants and animals from English to ${langName}. ` +
          'Input is a JSON object of numbered strings. Reply with ONLY a JSON object with the ' +
          'SAME keys, each value translated. Keep scientific names and measurements unchanged, ' +
          'and use the standard local names for countries and regions. No commentary, no fences.\n' +
          // Safety fidelity is not optional here: these strings include the
          // toxicity warning shown on mushroom and plant results. A softened
          // translation ("mildly toxic" -> "safe in small amounts") is how a
          // translation layer sends someone to hospital.
          'SAFETY: translate warnings about toxicity, poisoning, irritation or danger with FULL ' +
          'force - never soften, hedge, shorten or omit them. Keep every hazard, symptom and ' +
          '"do not eat / keep away from children and pets" instruction explicit. If a sentence ' +
          'warns, the translation must warn just as strongly.',
        messages: [{ role: 'user', content: JSON.stringify(strings) }],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!upstream.ok) return entity;
    const data = await upstream.json();
    const text = data?.content?.[0]?.text || '';
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const translated = JSON.parse(jsonText);
    items.forEach((item, i) => {
      const val = translated[String(i + 1)];
      if (typeof val === 'string' && val.trim()) item.set(val.trim());
    });
  } catch (e) {
    // timeout / parse / network: the English original ships, which is exactly
    // what the app did before this existed.
  }
  return entity;
}

module.exports = { translateEntity };
