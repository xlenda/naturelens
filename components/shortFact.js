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
// numa chamada Haiku antes de a entidade sair da API). Por isso o casamento
// cobre EN + PT, que sao os dois idiomas que o dono verifica no olho. Alemao,
// frances, coreano etc. NAO casam e caem no fallback null de proposito -
// acrescentar um idioma aqui e so acrescentar a alternativa no regex.

// Negacao vem PRIMEIRO e vence: "non-toxic to humans and pets" / "nao e
// toxica" e a frase mais comum que o vendor devolve nesse campo, e um
// /toxic/ ingenuo marcaria de PERIGO justamente a planta segura.
const NOT_TOXIC =
  /\bnon[-\s]?toxic|\bnot\s+toxic|n[aã]o\s+(?:é\s+|e\s+)?t[oó]xic|at[oó]xic|n[aã]o\s+é?\s*venenos/i;

// Ordem importa: "Full sun to partial shade" tem que sair como "Sol pleno",
// e "partial shade" nao pode cair na regra generica de sombra.
const RULES = {
  light: [
    [/full\s+sun|pleno\s+sol|sol\s+pleno/i, 'detail.lightFullSun'],
    [/partial|parcial|meia[-\s]?sombra/i, 'detail.lightPartial'],
    [/shade|sombra/i, 'detail.lightShade'],
  ],
  soil: [
    [/well[-\s]?drain|bem\s+drenad|drenad/i, 'detail.soilWellDrained'],
    [/sandy|arenos/i, 'detail.soilSandy'],
    [/\bloam|franco/i, 'detail.soilLoam'],
    [/acidic|[aá]cid/i, 'detail.soilAcidic'],
  ],
  toxicity: [[/toxic|t[oó]xic|venenos/i, 'detail.toxicShort']],
  // Rega: o vendor manda o rotulo composto ('Low (prefers dry soil) to
  // Medium' / 'Baixa (prefere solo seco) a Media'), que truncava no card em
  // 'Baixa (pr...'. A ordem casa o PRIMEIRO nivel citado, que e o piso da
  // faixa - e o dado acionavel ('pode regar pouco'), nao o teto.
  water: [
    [/\blow\b|\bbaix/i, 'detail.waterLow'],
    [/\bmedium\b|\bm[eé]di/i, 'detail.waterMedium'],
    [/\bhigh\b|\balta?\b/i, 'detail.waterHigh'],
  ],
};

// kind: 'light' | 'soil' | 'toxicity' | 'water'. Devolve a string curta ja traduzida, ou
// null quando nao da pra ser curto sem inventar.
export default function shortFact(kind, text, t) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const rules = RULES[kind];
  if (!rules) return null;
  if (kind === 'toxicity' && NOT_TOXIC.test(text)) return null;
  for (const [pattern, key] of rules) {
    if (pattern.test(text)) return t(key);
  }
  return null;
}
