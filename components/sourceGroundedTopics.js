const TOPIC_KEY = Object.freeze({
  feeding: 'diet',
  ecology: 'role',
  acousticPattern: 'vocalization',
});

const ICON = Object.freeze({
  phenology: 'calendar-outline',
  propagation: 'git-branch-outline',
  cultivation: 'analytics-outline',
  uses: 'compass-outline',
  habitat: 'earth-outline',
  feeding: 'restaurant-outline',
  reproduction: 'egg-outline',
  lifeCycle: 'hourglass-outline',
  behavior: 'footsteps-outline',
  ecology: 'leaf-outline',
  migration: 'navigate-outline',
  vocalization: 'musical-notes-outline',
  acousticPattern: 'pulse-outline',
  frequencyTiming: 'options-outline',
  substrate: 'layers-outline',
  conservation: 'shield-checkmark-outline',
});

function sourceFromDossier(dossier) {
  return (dossier?.sources || []).find((source) => source?.id === 'wikipedia') || null;
}

function buildSourceGroundedTopics({ dossier, labels = {} } = {}) {
  const source = sourceFromDossier(dossier);
  if (!source || !Array.isArray(dossier?.wikiSections)) return [];
  return dossier.wikiSections
    .filter((section) => section?.key && section?.heading && section?.text)
    .map((section) => ({
      key: TOPIC_KEY[section.key] || section.key,
      sourceSectionKey: section.key,
      label: labels[section.key] || section.heading,
      text: section.text,
      icon: ICON[section.key],
      sources: [source],
      sourceIds: ['wikipedia'],
      scientific: dossier.scientific,
    }));
}

function mergeText(first, second) {
  const left = typeof first === 'string' ? first.trim() : '';
  const right = typeof second === 'string' ? second.trim() : '';
  if (!left) return right || null;
  if (!right || left === right || left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}\n\n${right}`;
}

function mergeSources(...lists) {
  const byUrl = new Map();
  for (const source of lists.flat()) {
    if (source?.id && source?.url && !byUrl.has(source.url)) byUrl.set(source.url, source);
  }
  return [...byUrl.values()];
}

function mergeSourceGroundedTopics(baseTopics = [], sourceTopics = []) {
  const result = baseTopics.filter(Boolean).map((topic) => ({ ...topic }));
  const index = new Map(result.map((topic, position) => [topic.key, position]));
  for (const topic of sourceTopics.filter(Boolean)) {
    const position = index.get(topic.key);
    if (position === undefined) {
      index.set(topic.key, result.length);
      result.push(topic);
      continue;
    }
    const current = result[position];
    result[position] = {
      ...current,
      text: mergeText(current.text, topic.text),
      icon: current.icon || topic.icon,
      scientific: current.scientific || topic.scientific,
      sourceIds: [...new Set([...(current.sourceIds || []), ...(topic.sourceIds || [])])],
      sources: mergeSources(current.sources || [], topic.sources || []),
    };
  }
  return result;
}

module.exports = {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
};
