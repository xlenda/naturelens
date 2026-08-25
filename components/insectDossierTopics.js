const { buildCategoryDepthTopics } = require('./categoryDepthContract');
const { insectRedListLabel } = require('./insectRedList');
const {
  getInsectLifeStageProfile,
  getInsectOrderStageProfile,
} = require('./insectLifeStageRegistry');

const META = Object.freeze({
  feeding: Object.freeze({ key: 'diet', labelKey: 'speciesDossier.diet', icon: 'restaurant-outline' }),
  documentedFeeding: Object.freeze({ key: 'diet', labelKey: 'speciesDossier.diet', icon: 'restaurant-outline' }),
  habitat: Object.freeze({ key: 'habitat', labelKey: 'speciesDossier.habitat', icon: 'earth-outline' }),
  reproduction: Object.freeze({ key: 'reproduction', labelKey: 'speciesDossier.reproduction', icon: 'egg-outline' }),
  lifeCycle: Object.freeze({ key: 'lifeCycle', labelKey: 'speciesDossier.lifeCycle', icon: 'hourglass-outline' }),
  lifeStages: Object.freeze({ key: 'lifeStages', labelKey: 'speciesDossier.lifeStagesTitle', icon: 'repeat-outline' }),
  plantAssociations: Object.freeze({ key: 'plantAssociations', labelKey: 'observationWorkspace.contexts.insect.onPlant', icon: 'leaf-outline' }),
  ecologicalRelations: Object.freeze({ key: 'role', labelKey: 'detail.ecologicalRoleSection', icon: 'git-compare-outline' }),
  conservation: Object.freeze({ key: 'conservation', labelKey: 'detail.conservationStatus', icon: 'shield-checkmark-outline' }),
});

function translated(translate, key, values) {
  if (typeof translate !== 'function') return null;
  try {
    const value = translate(key, values);
    if (typeof value !== 'string') return null;
    const clean = value.trim();
    return clean && clean !== key ? clean : null;
  } catch (error) {
    return null;
  }
}

function bulletText(items) {
  const labels = (items || []).map((item) => item?.label || item?.name)
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [...new Set(labels)];
  return unique.length ? `\u2022 ${unique.join('\n\u2022 ')}` : null;
}

function measurementText(items, language, translate) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let number;
  try {
    number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  } catch (error) {
    return null;
  }
  const rows = items.map((item) => {
    const label = translated(translate, `speciesDossier.measurements.${item.id}`);
    if (!label) return null;
    let value = number.format(item.amount);
    if (item.unit !== 'count') {
      try {
        value = new Intl.NumberFormat(language, {
          style: 'unit', unit: item.unit, unitDisplay: 'long', maximumFractionDigits: 2,
        }).format(item.amount);
      } catch (error) {
        // O numero verificado continua util sem cair para uma unidade inglesa.
      }
    }
    return `${label}: ${value}`;
  }).filter(Boolean);
  return rows.length ? `\u2022 ${rows.join('\n\u2022 ')}` : null;
}

function appendTopic(map, topic) {
  if (!topic?.key || !topic?.label
    || (!topic.text && !topic.groupOnly && !topic.stageProfile && !topic.orderStageProfile)) return;
  const previous = map.get(topic.key);
  if (!previous) {
    map.set(topic.key, topic);
    return;
  }
  const text = [...new Set([previous.text, topic.text].filter(Boolean))].join('\n\n');
  map.set(topic.key, { ...previous, ...topic, text: text || undefined });
}

function dynamicText(topic, language, translate) {
  if (['feeding', 'documentedFeeding', 'habitat', 'plantAssociations', 'ecologicalRelations'].includes(topic.key)) {
    return bulletText(topic.evidence);
  }
  if (topic.key === 'reproduction' || topic.key === 'lifeCycle') {
    return measurementText(topic.evidence, language, translate);
  }
  if (topic.key === 'lifeStages') {
    return bulletText(topic.evidence.map((stage) => ({
      label: translated(translate, `speciesDossier.lifeStages.${stage}`),
    })));
  }
  if (topic.key === 'conservation') return insectRedListLabel(topic.evidence, translate);
  return null;
}

function buildInsectDossierTopics({
  scientific,
  dossier,
  order,
  taxonClass,
  language,
  translate,
  baseTopics = [],
} = {}) {
  const topics = new Map();
  for (const topic of baseTopics) appendTopic(topics, topic);

  const evidenced = buildCategoryDepthTopics({ category: 'insect', scientific, dossier });
  for (const item of evidenced) {
    const meta = META[item.key];
    if (!meta) continue;
    const label = translated(translate, meta.labelKey);
    const text = dynamicText(item, language, translate);
    if (!label || !text) continue;
    appendTopic(topics, {
      key: meta.key,
      label,
      text,
      icon: meta.icon,
      scientific: item.scientific,
      sourceIds: item.sourceIds,
    });
  }

  const stageProfile = getInsectLifeStageProfile(scientific);
  if (stageProfile) {
    const label = translated(translate, 'speciesDossier.lifeStagesTitle');
    const count = translated(translate, 'speciesDossier.larvalInstars', {
      count: stageProfile.larvalInstars,
    });
    if (label && count) {
      appendTopic(topics, {
        key: 'lifeStages',
        label,
        icon: 'repeat-outline',
        stageProfile,
        text: count,
        scientific: stageProfile.scientific,
        sourceIds: [stageProfile.source.id],
      });
    }
  }

  // Quando a fonte nao publicou instares da especie, a ordem ainda pode
  // documentar o TIPO de metamorfose. O card deixa esse escopo explicito e
  // nunca transforma a sequencia geral em duracao ou medida da especie.
  const orderStageProfile = getInsectOrderStageProfile({ order, taxonClass });
  if (!topics.has('lifeStages') && orderStageProfile) {
    const label = translated(translate, 'speciesDossier.lifeStagesTitle');
    if (label) {
      appendTopic(topics, {
        key: 'lifeStages',
        label,
        icon: 'repeat-outline',
        groupOnly: true,
        orderStageProfile,
        sourceIds: [orderStageProfile.source.id],
      });
    }
  }

  return [...topics.values()];
}

module.exports = {
  buildInsectDossierTopics,
  bulletText,
  measurementText,
};
