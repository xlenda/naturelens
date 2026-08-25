export const WATER_LEVELS = Object.freeze([
  'Low (prefers dry soil)',
  'Medium',
  'High (prefers moist soil)',
]);

const WATER_LEVEL_SET = new Set(WATER_LEVELS);

const CARE_CATEGORIES = new Set(['plant', 'tree']);

function isWaterLevel(value) {
  if (typeof value !== 'string') return false;
  const levels = value.split(' to ');
  return levels.length <= 2 && levels.every((level) => WATER_LEVEL_SET.has(level));
}

export function getWateringStatus(entry) {
  if (!entry || !CARE_CATEGORIES.has(entry.category) || !isWaterLevel(entry.water)) {
    return null;
  }

  // O fornecedor entrega intensidade, nao intervalo. O estado conserva esse
  // nivel qualitativo e apenas o evento que a pessoa registrou; nunca converte
  // baixo/medio/alto em um prazo automatico.
  if (!entry.lastWateredAt) {
    return { level: entry.water, lastWateredAt: null, untracked: true };
  }

  const lastWatered = new Date(entry.lastWateredAt);
  if (!Number.isFinite(lastWatered.getTime())) return null;
  return {
    level: entry.water,
    lastWateredAt: lastWatered.toISOString(),
    untracked: false,
  };
}

// A agenda e so de seres que a pessoa realmente CULTIVA. Sem uma frequencia
// definida pela pessoa, ela preserva a ordem da colecao e oferece apenas a
// checagem inicial; uma rega real continua registrada no exemplar.
export function getCareQueue(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry, index) => ({ entry, index, status: getWateringStatus(entry) }))
    .filter(({ entry, status }) => CARE_CATEGORIES.has(entry?.category) && status);
}
