// Tabelas de monitoramento, nunca uma lista de produtos. Os valores abaixo
// sao niveis de referencia publicados pela Embrapa; o app conserva cultura,
// unidade, estadio e destino para impedir que um numero viaje sem contexto.
export const PEST_MANAGEMENT_SOURCES = Object.freeze({
  general: Object.freeze({
    label: 'Embrapa Milho e Sorgo · MIP',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/pragas-e-doencas/pragas/manejo-integrado-de-pragas',
  }),
  maizeDamage: Object.freeze({
    label: 'Embrapa Milho e Sorgo · Lagarta-do-cartucho',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/pragas-e-doencas/pragas/pragas-da-fase-vegetativa-e-reprodutiva',
  }),
  soySampling: Object.freeze({
    label: 'Embrapa Soja',
    url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/soja/producao/manejo-integrado-de-pragas/monitoramento-da-lavoura',
  }),
  soyThresholds: Object.freeze({
    label: 'Embrapa Soja · 500 Perguntas 500 Respostas',
    url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1118408/2/500PERGUNTASSojaed012019.pdf',
  }),
  agrofit: Object.freeze({
    label: 'MAPA · Agrofit',
    url: 'https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/agrotoxicos/agrofit',
  }),
});

export const MAIZE_PEST_ROWS = Object.freeze([
  Object.freeze({ key: 'fallArmyworm', samplePoints: 5, sampleAreaHa: 1, actionPercent: 10 }),
  Object.freeze({ key: 'wireworm', sampleWidthCm: 30, sampleLengthCm: 30, sampleDepthCm: 15, actionCount: 2 }),
]);

export const SOY_SAMPLE_ROWS = Object.freeze([
  Object.freeze({ maxAreaHa: 10, minimumPoints: 6 }),
  Object.freeze({ maxAreaHa: 30, minimumPoints: 8 }),
  Object.freeze({ maxAreaHa: 100, minimumPoints: 10 }),
  Object.freeze({ maxAreaHa: null, splitAreaHa: 100 }),
]);

export const SOY_ACTION_ROWS = Object.freeze([
  Object.freeze({ key: 'defoliation', vegetativePercent: 30, reproductivePercent: 15 }),
  Object.freeze({ key: 'largeCaterpillars', countPerMeter: 20, minimumLengthCm: 1.5 }),
  Object.freeze({ key: 'grainStinkbugs', countPerMeter: 2, stageStart: 'R3', stageEnd: 'R6' }),
  Object.freeze({ key: 'seedStinkbugs', countPerMeter: 1, stageStart: 'R3', stageEnd: 'R6' }),
]);

const normalizeScientific = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u00d7]/g, 'x')
  .trim()
  .toLocaleLowerCase('en')
  .split(/\s+/)
  .slice(0, 2)
  .join(' ');

export function getPestManagementProfile({ scientific, groupKey } = {}) {
  if (groupKey !== 'grainCrop' && groupKey !== 'vegCrop') return null;
  const taxon = normalizeScientific(scientific);
  let speciesTable = null;
  if (taxon === 'zea mays') speciesTable = 'maize';
  if (taxon === 'glycine max') speciesTable = 'soy';
  // Limiar de acao pertence a cultura, estadio e metodo publicados. Sem uma
  // correspondencia exata, esconder tudo e mais seguro que mostrar o protocolo
  // de milho ou soja ao lado de arroz, algodao ou outra lavoura.
  if (!speciesTable) return null;
  return Object.freeze({ groupKey, speciesTable });
}

export function selfCheck() {
  if (MAIZE_PEST_ROWS.length !== 2) throw new Error('maize monitoring table is incomplete');
  if (MAIZE_PEST_ROWS[0].actionPercent !== 10 || MAIZE_PEST_ROWS[1].actionCount !== 2) {
    throw new Error('maize action references changed');
  }
  if (SOY_SAMPLE_ROWS.map((row) => row.minimumPoints || 0).join(',') !== '6,8,10,0') {
    throw new Error('soy sampling table is incomplete');
  }
  if (SOY_ACTION_ROWS.map((row) => row.key).join(',') !== 'defoliation,largeCaterpillars,grainStinkbugs,seedStinkbugs') {
    throw new Error('soy action table is incomplete');
  }
  if (getPestManagementProfile({ scientific: 'Zea mays L.', groupKey: 'grainCrop' })?.speciesTable !== 'maize') {
    throw new Error('maize pest boundary failed');
  }
  if (getPestManagementProfile({ scientific: 'Oryza sativa', groupKey: 'grainCrop' })) {
    throw new Error('maize or soy thresholds leaked to rice');
  }
}
