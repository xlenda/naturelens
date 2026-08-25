const { buildCategoryDepthTopics } = require('./categoryDepthContract');
const { insectRedListLabel } = require('./insectRedList');

const TOPIC_META = Object.freeze({
  feeding: Object.freeze({
    key: 'diet',
    labelKey: 'speciesDossier.diet',
    icon: 'restaurant-outline',
  }),
  habitat: Object.freeze({
    key: 'habitat',
    labelKey: 'speciesDossier.habitat',
    icon: 'earth-outline',
  }),
  reproduction: Object.freeze({
    key: 'reproduction',
    labelKey: 'speciesDossier.reproduction',
    icon: 'egg-outline',
  }),
  lifeCycle: Object.freeze({
    key: 'lifeCycle',
    labelKey: 'speciesDossier.lifeCycle',
    icon: 'hourglass-outline',
  }),
  conservation: Object.freeze({
    key: 'conservation',
    labelKey: 'detail.conservationStatus',
    icon: 'shield-checkmark-outline',
  }),
});

function translatedLabel(translate, key) {
  if (typeof translate !== 'function') return null;
  try {
    const value = translate(key);
    if (typeof value !== 'string') return null;
    const clean = value.trim();
    return clean && clean !== key ? clean : null;
  } catch (error) {
    return null;
  }
}

function factText(facts) {
  if (!Array.isArray(facts)) return null;
  const unique = [...new Set(facts
    .map((fact) => typeof fact?.label === 'string' ? fact.label.trim() : '')
    .filter(Boolean))];
  return unique.length ? `\u2022 ${unique.join('\n\u2022 ')}` : null;
}

function measurementText(measurements, language, translate) {
  if (!Array.isArray(measurements) || measurements.length === 0) return null;
  let number;
  try {
    number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  } catch (error) {
    return null;
  }

  const rows = [];
  for (const measurement of measurements) {
    const label = translatedLabel(translate, `speciesDossier.measurements.${measurement.id}`);
    if (!label) continue;
    let value = number.format(measurement.amount);
    if (measurement.unit !== 'count') {
      try {
        value = new Intl.NumberFormat(language, {
          style: 'unit',
          unit: measurement.unit,
          unitDisplay: 'long',
          maximumFractionDigits: 2,
        }).format(measurement.amount);
      } catch (error) {
        // O numero validado ainda e util; nunca cai para uma unidade inglesa.
      }
    }
    rows.push(`${label}: ${value}`);
  }
  return rows.length ? `\u2022 ${rows.join('\n\u2022 ')}` : null;
}

function buildBirdDossierTopics({ scientific, dossier, language, translate } = {}) {
  const evidenced = buildCategoryDepthTopics({
    category: 'bird',
    scientific,
    dossier,
  });

  return evidenced.map((topic) => {
    const meta = TOPIC_META[topic.key];
    if (!meta) return null;
    const label = translatedLabel(translate, meta.labelKey);
    if (!label) return null;

    let text = null;
    if (topic.key === 'feeding' || topic.key === 'habitat') {
      text = factText(topic.evidence);
    } else if (topic.key === 'reproduction' || topic.key === 'lifeCycle') {
      text = measurementText(topic.evidence, language, translate);
    } else if (topic.key === 'conservation') {
      text = insectRedListLabel(topic.evidence, translate);
    }
    if (!text) return null;

    return {
      key: meta.key,
      label,
      text,
      icon: meta.icon,
      evidenceSourceIds: topic.sourceIds,
    };
  }).filter(Boolean);
}

module.exports = {
  buildBirdDossierTopics,
  factText,
  measurementText,
};
