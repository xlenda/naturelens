const { buildCategoryDepthTopics } = require('./categoryDepthContract');
const { insectRedListLabel } = require('./insectRedList');

const WATER_LABELS = Object.freeze([
  ['freshwater', 'observationWorkspace.contexts.fish.freshwater'],
  ['brackish', 'speciesDossier.brackish'],
  ['marine', 'observationWorkspace.contexts.fish.marine'],
]);

const TOPIC_META = Object.freeze({
  environment: Object.freeze({
    key: 'environment',
    labelKey: 'speciesDossier.environment',
    icon: 'water-outline',
  }),
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

function translated(translate, key) {
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

function bulletText(labels) {
  const unique = [...new Set((labels || [])
    .filter((label) => typeof label === 'string')
    .map((label) => label.trim())
    .filter(Boolean))];
  return unique.length ? `\u2022 ${unique.join('\n\u2022 ')}` : null;
}

function factText(evidence) {
  return bulletText((evidence || []).map((fact) => fact?.label));
}

function environmentText(evidence, translate) {
  return bulletText(WATER_LABELS
    .filter(([key]) => evidence?.[key] === true)
    .map(([, labelKey]) => translated(translate, labelKey)));
}

function measurementText(evidence, language, translate) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  let number;
  try {
    number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  } catch (error) {
    return null;
  }

  const rows = evidence.map((item) => {
    const label = translated(translate, `speciesDossier.measurements.${item.id}`);
    if (!label) return null;
    let value = number.format(item.amount);
    if (item.unit !== 'count') {
      try {
        value = new Intl.NumberFormat(language, {
          style: 'unit',
          unit: item.unit,
          unitDisplay: 'long',
          maximumFractionDigits: 2,
        }).format(item.amount);
      } catch (error) {
        // O numero verificado permanece; nenhuma unidade inglesa e inventada.
      }
    }
    return `${label}: ${value}`;
  });
  return bulletText(rows);
}

function topicText(topic, language, translate) {
  if (topic.key === 'environment') return environmentText(topic.evidence, translate);
  if (topic.key === 'feeding' || topic.key === 'habitat') return factText(topic.evidence);
  if (topic.key === 'reproduction' || topic.key === 'lifeCycle') {
    return measurementText(topic.evidence, language, translate);
  }
  if (topic.key === 'conservation') return insectRedListLabel(topic.evidence, translate);
  return null;
}

function buildFishDossierTopics({ dossier, scientific, language, translate } = {}) {
  const evidenced = buildCategoryDepthTopics({ category: 'fish', scientific, dossier });
  return evidenced.map((topic) => {
    const meta = TOPIC_META[topic.key];
    const label = meta ? translated(translate, meta.labelKey) : null;
    const text = meta ? topicText(topic, language, translate) : null;
    if (!meta || !label || !text) return null;
    return {
      key: meta.key,
      label,
      text,
      icon: meta.icon,
      scientific: topic.scientific,
      sourceIds: topic.sourceIds,
    };
  }).filter(Boolean);
}

module.exports = {
  buildFishDossierTopics,
};
