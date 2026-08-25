// Dados numericos ficam separados da interface para que a tabela possa ser
// testada sem montar React Native. Extracao e balanco nunca viram dose: a
// recomendacao depende de analise, meta, solo, clima e calibracao regional.
export const FERTILIZER_SOURCES = Object.freeze({
  planning: Object.freeze({
    label: 'Embrapa Milho e Sorgo',
    url: 'https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/milho/producao/manejo-do-solo-e-adubacao/adubacao-e-fertilidade-do-solo/planejamento-da-adubacao-e-calagem',
  }),
  diagnosis: Object.freeze({
    label: 'Embrapa Arroz e Feijão',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/arroz/pre-producao/desordens-nutricionais',
  }),
  maize: Object.freeze({
    label: 'Embrapa · Coelho & França (1995)',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/manejo-do-solo-e-adubacao/adubacao-e-fertilidade-do-solo/exigencias-nutricionais-da-planta',
  }),
  onion: Object.freeze({
    label: 'Embrapa Hortaliças',
    url: 'https://www.embrapa.br/hortalicas/cebola/deficiencias-nutricionais',
  }),
});

// Coelho & Franca (1995), tabela reproduzida pela Embrapa Milho e Sorgo.
// Produtividade esta em t/ha; N, P, K, Ca e Mg extraidos estao em kg/ha.
export const MAIZE_EXTRACTION_ROWS = Object.freeze([
  Object.freeze({ destination: 'grain', productivity: 3.65, n: 77, p: 9, k: 83, ca: 10, mg: 10 }),
  Object.freeze({ destination: 'grain', productivity: 5.8, n: 100, p: 19, k: 95, ca: 7, mg: 17 }),
  Object.freeze({ destination: 'grain', productivity: 7.87, n: 167, p: 33, k: 113, ca: 27, mg: 25 }),
  Object.freeze({ destination: 'grain', productivity: 9.17, n: 187, p: 34, k: 143, ca: 30, mg: 28 }),
  Object.freeze({ destination: 'grain', productivity: 10.15, n: 217, p: 42, k: 157, ca: 32, mg: 33 }),
  Object.freeze({ destination: 'silage', productivity: 11.6, n: 115, p: 15, k: 69, ca: 35, mg: 26 }),
  Object.freeze({ destination: 'silage', productivity: 15.31, n: 181, p: 21, k: 213, ca: 41, mg: 28 }),
  Object.freeze({ destination: 'silage', productivity: 17.13, n: 230, p: 23, k: 271, ca: 52, mg: 31 }),
  Object.freeze({ destination: 'silage', productivity: 18.65, n: 231, p: 26, k: 259, ca: 58, mg: 32 }),
]);

// Efeitos documentados para cebola. As chaves de texto ficam no locale; estes
// codigos impedem que a mesma relacao seja generalizada para toda hortalica.
export const ONION_EXCESS_ROWS = Object.freeze([
  Object.freeze({ nutrient: 'N', effectKey: 'nitrogenEffect' }),
  Object.freeze({ nutrient: 'K', effectKey: 'potassiumEffect' }),
  Object.freeze({ nutrient: 'P', effectKey: 'phosphorusEffect' }),
]);

export function normalizeCropScientific(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u00d7]/g, 'x')
    .trim()
    .toLocaleLowerCase('en')
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

export function getFertilizerProfile({ scientific, groupKey } = {}) {
  if (groupKey !== 'grainCrop' && groupKey !== 'vegCrop') return null;

  const taxon = normalizeCropScientific(scientific);
  let speciesTable = null;
  if (taxon === 'zea mays') speciesTable = 'maize';
  if (taxon === 'allium cepa') speciesTable = 'onion';

  // O quadro generico de entradas nao autoriza exibir uma secao de adubacao
  // para outra cultura. Sem tabela publicada para o binomio, o bloco inteiro
  // some: trigo, algodao ou arroz nunca parecem herdar numeros de milho.
  if (!speciesTable) return null;

  return Object.freeze({
    groupKey,
    speciesTable,
    sources: Object.freeze(
      speciesTable === 'maize'
        ? [FERTILIZER_SOURCES.planning, FERTILIZER_SOURCES.maize]
        : [FERTILIZER_SOURCES.onion]
    ),
  });
}

export function selfCheck() {
  if (MAIZE_EXTRACTION_ROWS.length !== 9) throw new Error('maize extraction table is incomplete');
  for (const row of MAIZE_EXTRACTION_ROWS) {
    for (const key of ['productivity', 'n', 'p', 'k', 'ca', 'mg']) {
      if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error(`invalid maize ${key}`);
    }
  }
  if (ONION_EXCESS_ROWS.map((row) => row.nutrient).join(',') !== 'N,K,P') {
    throw new Error('onion nutrient balance table is incomplete');
  }
  if (getFertilizerProfile({ scientific: 'Zea mays L.', groupKey: 'grainCrop' })?.speciesTable !== 'maize') {
    throw new Error('maize profile boundary failed');
  }
  if (getFertilizerProfile({ scientific: 'Triticum aestivum', groupKey: 'grainCrop' })) {
    throw new Error('maize data leaked to another grain crop');
  }
}
