// Contrato unico da identidade taxonomica produzida pelos adaptadores de API.
//
// Nome popular nunca prova especie. Ate "Blue tang" tem a mesma forma visual
// de um binomio, entao regex sozinha nao resolve o problema: o nome cientifico
// tambem precisa vir do campo documentado daquele fornecedor. Uma fonte nova
// entra nesta lista de forma explicita ou a identidade falha fechada.

const IDENTITY_SCHEMA_VERSION = 1;
const MIN_EXACT_SCORE = 0.65;
const MIN_SUBJECT_SCORE = 0.5;

const SCIENTIFIC_SOURCES = Object.freeze({
  'plant.id': new Set(['result.classification.suggestions[].name']),
  'insect.id': new Set(['result.classification.suggestions[].name']),
  'mushroom.id': new Set(['result.classification.suggestions[].name']),
  'crop.health': new Set(['result.crop.suggestions[].scientific_name']),
  fishial: new Set(['results[].species[].fishangler-data.scientificName']),
  perch: new Set(['predictions[].scientific_name']),
  // BioCLIP entrega similaridade zero-shot, nao probabilidade. O binomio so e
  // confiavel depois de vir da lista AviList usada no host e ser confirmado
  // como uma especie Aves aceita pelo GBIF.
  'bioclip-2': new Set([
    'birdnet-taxonomy.AviList.scientific_name',
    'birdnet-taxonomy.AviList.scientific_name+gbif.species.match',
  ]),
  // Nyckel entrega apenas o nome comum. Esta fonte prova a ponte em duas
  // etapas: taxon Aves unico no Wikidata e match exato/aceito no GBIF.
  nyckel: new Set(['wikidata.P225+gbif.species.match']),
});

const EXACT_EVIDENCE_SOURCES = Object.freeze({
  'bioclip-2': new Set([
    'bioclip.predictions[].score.margin+gbif.species.match',
  ]),
});

const GBIF_KEY_SOURCES = Object.freeze({
  'bioclip-2': new Set(['gbif.species.match.usageKey']),
  nyckel: new Set(['gbif.species.match.usageKey']),
});

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean || null;
}

function cleanId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const clean = String(value).trim();
  return clean || null;
}

function normaliseScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function normaliseSimilarity(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1
    ? value
    : null;
}

function normaliseMargin(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2
    ? value
    : null;
}

function normaliseGbifKey(value) {
  const clean = cleanId(value);
  return clean && /^[1-9]\d*$/.test(clean) ? clean : null;
}

function canonicalScientific(value) {
  const clean = cleanText(value);
  if (!clean) return null;

  const words = clean
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00d7/g, 'x')
    .trim()
    .split(/\s+/);
  if (words.length < 2 || !/^[A-Z][A-Za-z.-]+$/.test(words[0])) return null;

  if (words[1] === 'x') {
    if (!words[2] || !/^[a-z][A-Za-z.-]+$/.test(words[2])) return null;
    return `${words[0]} x ${words[2]}`;
  }

  if (!/^[a-z][A-Za-z.-]+$/.test(words[1])) return null;
  return `${words[0]} ${words[1]}`;
}

function trustedScientific(provider, value, source) {
  const allowed = SCIENTIFIC_SOURCES[provider];
  if (!allowed || !allowed.has(source)) return null;
  const canonicalName = canonicalScientific(value);
  if (!canonicalName) return null;
  return {
    scientificName: cleanText(value),
    canonicalName,
  };
}

function buildIdentityV1({
  category,
  provider,
  providerTaxonId,
  providerLabel,
  providerTaxonIdSource,
  providerLabelSource,
  scientificName,
  scientificNameSource,
  score,
  scoreSource,
  subjectScore,
  subjectScoreSource,
  gbifKey,
  gbifKeySource,
  exactEvidence,
  exactEvidenceSource,
  similarity,
  similaritySource,
  topMargin,
  topMarginSource,
  similarityThreshold,
  marginThreshold,
  thresholdSetId,
} = {}) {
  const providerName = cleanText(provider);
  const categoryName = cleanText(category);
  let scientific = trustedScientific(providerName, scientificName, scientificNameSource);
  if (
    providerName === 'bioclip-2' &&
    scientific &&
    scientific.scientificName !== scientific.canonicalName
  ) {
    scientific = null;
  }
  const normalisedScore = normaliseScore(score);
  const normalisedSubjectScore = normaliseScore(subjectScore);
  const directGbifKey = normaliseGbifKey(gbifKey);
  const scoreEvidence = cleanText(scoreSource);
  const subjectScoreEvidence = cleanText(subjectScoreSource);
  const normalisedSimilarity = normaliseSimilarity(similarity);
  const normalisedTopMargin = normaliseMargin(topMargin);
  const normalisedSimilarityThreshold = normaliseSimilarity(similarityThreshold);
  const normalisedMarginThreshold = normaliseMargin(marginThreshold);
  const similarityEvidence = cleanText(similaritySource);
  const marginEvidence = cleanText(topMarginSource);
  const evidenceSource = cleanText(exactEvidenceSource);
  const thresholdEvidence = cleanText(thresholdSetId);
  const gbifEvidenceSource = cleanText(gbifKeySource);
  const acceptedGbifSource = Boolean(
    directGbifKey && GBIF_KEY_SOURCES[providerName]?.has(gbifEvidenceSource)
  );
  const acceptedEvidenceSource = Boolean(
    evidenceSource && EXACT_EVIDENCE_SOURCES[providerName]?.has(evidenceSource)
  );

  let status = 'unresolved';
  if (scientific) {
    status = 'candidate';
    if (providerName === 'bioclip-2') {
      // Cosine similarity has no probability semantics. Exact therefore needs
      // a named calibration set, a tested top-1 margin and an external GBIF
      // species proof; a high-looking raw number alone remains a candidate.
      if (
        exactEvidence === true &&
        acceptedEvidenceSource &&
        acceptedGbifSource &&
        normalisedSimilarity !== null &&
        similarityEvidence &&
        normalisedTopMargin !== null &&
        marginEvidence &&
        normalisedSimilarityThreshold !== null &&
        normalisedMarginThreshold !== null &&
        thresholdEvidence &&
        normalisedSimilarity >= normalisedSimilarityThreshold &&
        normalisedTopMargin >= normalisedMarginThreshold
      ) {
        status = 'exact';
      }
    } else {
      const subjectAllowsExact =
        normalisedSubjectScore === null ||
        (normalisedSubjectScore >= MIN_SUBJECT_SCORE && Boolean(subjectScoreEvidence));
      const scoreAllowsExact =
        normalisedScore !== null &&
        normalisedScore >= MIN_EXACT_SCORE &&
        scoreEvidence &&
        subjectAllowsExact;
      // Nyckel starts with a common label. Its scientific bridge is only exact
      // when the resolver also supplied the GBIF usageKey from the documented
      // exact Aves match; the source string alone is not proof.
      if (scoreAllowsExact && (providerName !== 'nyckel' || acceptedGbifSource)) {
        status = 'exact';
      }
    }
  }

  return {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    category: categoryName,
    status,
    provider: {
      name: providerName,
      id: cleanId(providerTaxonId),
      label: cleanText(providerLabel),
    },
    taxon: {
      scientificName: scientific?.scientificName || null,
      canonicalName: scientific?.canonicalName || null,
      rank: scientific ? 'species' : null,
      gbifKey: directGbifKey,
    },
    confidence: {
      // Escala unica 0..1. A interface continua livre para mostrar percentual.
      score: normalisedScore,
      subjectScore: normalisedSubjectScore,
      exactThreshold: MIN_EXACT_SCORE,
      subjectThreshold: MIN_SUBJECT_SCORE,
      // Separada de score para a interface e a persistencia nunca exibirem
      // similaridade cosseno como uma porcentagem de probabilidade inventada.
      similarity: normalisedSimilarity,
      topMargin: normalisedTopMargin,
      similarityThreshold: normalisedSimilarityThreshold,
      marginThreshold: normalisedMarginThreshold,
    },
    provenance: {
      providerId: cleanText(providerTaxonIdSource),
      providerLabel: cleanText(providerLabelSource),
      scientificName: scientific ? scientificNameSource : null,
      score: normalisedScore === null ? null : scoreEvidence,
      subjectScore:
        normalisedSubjectScore === null ? null : subjectScoreEvidence,
      gbifKey: directGbifKey ? gbifEvidenceSource : null,
      similarity: normalisedSimilarity === null ? null : similarityEvidence,
      topMargin: normalisedTopMargin === null ? null : marginEvidence,
      exactEvidence: acceptedEvidenceSource ? evidenceSource : null,
    },
    verification: providerName === 'bioclip-2'
      ? {
          exactEvidence: exactEvidence === true && acceptedEvidenceSource,
          thresholdSetId: thresholdEvidence,
        }
      : null,
  };
}

// O servidor de sync nao confia no status enviado pelo cliente. Reconstruir o
// contrato a partir dos campos permitidos recalcula exact/candidate/unresolved
// e remove qualquer nome cientifico sem proveniencia aprovada.
function sanitiseIdentityV1(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== IDENTITY_SCHEMA_VERSION) {
    return null;
  }
  return buildIdentityV1({
    category: value.category,
    provider: value.provider?.name,
    providerTaxonId: value.provider?.id,
    providerLabel: value.provider?.label,
    providerTaxonIdSource: value.provenance?.providerId,
    providerLabelSource: value.provenance?.providerLabel,
    scientificName: value.taxon?.scientificName,
    scientificNameSource: value.provenance?.scientificName,
    score: value.confidence?.score,
    scoreSource: value.provenance?.score,
    subjectScore: value.confidence?.subjectScore,
    subjectScoreSource: value.provenance?.subjectScore,
    gbifKey: value.taxon?.gbifKey,
    gbifKeySource: value.provenance?.gbifKey,
    exactEvidence: value.verification?.exactEvidence,
    exactEvidenceSource: value.provenance?.exactEvidence,
    similarity: value.confidence?.similarity,
    similaritySource: value.provenance?.similarity,
    topMargin: value.confidence?.topMargin,
    topMarginSource: value.provenance?.topMargin,
    similarityThreshold: value.confidence?.similarityThreshold,
    marginThreshold: value.confidence?.marginThreshold,
    thresholdSetId: value.verification?.thresholdSetId,
  });
}

function exactTaxon(identity) {
  if (identity?.schemaVersion !== IDENTITY_SCHEMA_VERSION || identity.status !== 'exact') {
    return null;
  }
  return identity.taxon?.canonicalName ? { ...identity.taxon } : null;
}

// Fronteira unica para qualquer dado externo (Wikipedia, GBIF ou curadoria
// exata). Entidade nova com identityV1 so enriquece quando o contrato diz
// `exact`. Registro antigo, que ainda nao possui o campo, conserva o binomio
// legado para nao esvaziar colecoes existentes.
function enrichmentTaxon(identity, legacy = {}) {
  if (identity !== undefined) return exactTaxon(identity);
  const canonicalName = canonicalScientific(legacy.scientificName);
  if (!canonicalName) return null;
  return {
    scientificName: cleanText(legacy.scientificName),
    canonicalName,
    rank: 'species',
    gbifKey: normaliseGbifKey(legacy.gbifKey),
  };
}

module.exports = {
  IDENTITY_SCHEMA_VERSION,
  MIN_EXACT_SCORE,
  MIN_SUBJECT_SCORE,
  buildIdentityV1,
  canonicalScientific,
  enrichmentTaxon,
  exactTaxon,
  sanitiseIdentityV1,
};
