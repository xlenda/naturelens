const GLOBAL_AGRONOMY_TOPIC_ORDER = Object.freeze([
  'cultivation',
  'phenology',
  'habitat',
  'propagation',
  'uses',
  'conservation',
]);

const {
  SOURCE_USE,
  isSourceUseAllowed,
} = require('./globalAgronomySourceRegistry');

const GLOBAL_AGRONOMY_TOPIC_KEYS = new Set(GLOBAL_AGRONOMY_TOPIC_ORDER);

function cleanText(value) {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

export function globalAgronomyDossierKey(language, scientific) {
  const locale = cleanText(language).toLowerCase().replace(/_/g, '-');
  const taxon = cleanText(scientific);
  return locale && taxon ? `crop|${locale}|${taxon}` : null;
}

export function hasExactCropIdentity(entity, scientific) {
  const identity = entity?.identityV1;
  const canonical = cleanText(identity?.taxon?.canonicalName);
  return Boolean(
    entity?.category === 'crop'
      && identity?.schemaVersion === 1
      && identity?.category === 'crop'
      && identity?.status === 'exact'
      && identity?.taxon?.rank === 'species'
      && canonical
      && canonical === cleanText(scientific)
  );
}

function verifiedSource(dossier, id, license) {
  return (dossier?.sources || []).find((source) => (
    source?.id === id
      && source?.license === license
      && typeof source?.url === 'string'
      && (
        (id === 'gbif' && /^https:\/\/www\.gbif\.org\/species\/[1-9]\d*$/.test(source.url))
        || (
          id === 'wikipedia'
            && /^https:\/\/(?:en|pt|es|de|fr|it|nl|pl|sv|da|cs|tr|ko|zh|hi|ar)\.wikipedia\.org\/wiki\/[^?#\s]+$/u.test(source.url)
        )
      )
  )) || null;
}

export function verifiedGlobalCropDossier(entity, scientific, dossier) {
  if (!hasExactCropIdentity(entity, scientific)) return null;
  if (
    !isSourceUseAllowed('gbif', SOURCE_USE.IDENTITY)
      || !isSourceUseAllowed('wikipedia', SOURCE_USE.DESCRIPTIVE_EVIDENCE)
  ) {
    return null;
  }
  const expected = cleanText(scientific);
  if (
    cleanText(dossier?.scientific) !== expected
      || dossier?.taxonomy?.sourceId !== 'gbif'
      || cleanText(dossier?.taxonomy?.species) !== expected
      || dossier?.taxonomy?.kingdom !== 'Plantae'
      || !verifiedSource(dossier, 'gbif', 'CC-BY-4.0')
      || !verifiedSource(dossier, 'wikipedia', 'CC-BY-SA-4.0')
  ) {
    return null;
  }
  return dossier;
}

export function selectGlobalAgronomyTopics({ entity, scientific, dossier, topics } = {}) {
  const verified = verifiedGlobalCropDossier(entity, scientific, dossier);
  if (!verified || !Array.isArray(topics)) return [];

  const byKey = new Map();
  for (const topic of topics) {
    if (
      !GLOBAL_AGRONOMY_TOPIC_KEYS.has(topic?.key)
        || byKey.has(topic.key)
        || cleanText(topic?.scientific) !== cleanText(scientific)
        || !Array.isArray(topic?.sourceIds)
        || !topic.sourceIds.includes('wikipedia')
        || !cleanText(topic?.text)
    ) {
      continue;
    }
    byKey.set(topic.key, topic);
  }
  return GLOBAL_AGRONOMY_TOPIC_ORDER.map((key) => byKey.get(key)).filter(Boolean);
}

export function globalAgronomyWikipediaSource(dossier) {
  return verifiedSource(dossier, 'wikipedia', 'CC-BY-SA-4.0');
}

export { GLOBAL_AGRONOMY_TOPIC_ORDER };
