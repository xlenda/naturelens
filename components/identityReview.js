export const IDENTITY_REVIEW_VERSION = 1;

function cleanText(value, limit = 160) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, limit);
  return clean || null;
}

function cleanConfidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : null;
}

export function originalIdentity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const name = cleanText(entity.name || entity.displayName || entity.scientific);
  if (!name) return null;
  return {
    name,
    scientific: cleanText(entity.scientific),
    confidence: cleanConfidence(entity.confidence),
    provider: cleanText(entity.provider || entity.sourceProvider || entity.identityV1?.provider?.name, 80),
  };
}

export function createIdentityReview(entity, decision, alternative) {
  const original = originalIdentity(entity);
  if (!original || !['confirmed', 'alternative'].includes(decision)) return null;
  const finalChoice = decision === 'confirmed'
    ? original
    : {
        name: cleanText(alternative?.name || alternative?.scientific),
        scientific: cleanText(alternative?.scientific),
        confidence: cleanConfidence(alternative?.confidence),
        provider: original.provider,
      };
  if (!finalChoice.name) return null;
  return {
    schemaVersion: IDENTITY_REVIEW_VERSION,
    decision,
    original,
    finalChoice,
    requiresRecapture: decision === 'alternative',
    reviewedAt: new Date().toISOString(),
  };
}

export function sanitiseIdentityReview(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== IDENTITY_REVIEW_VERSION) return null;
  const original = originalIdentity(value.original);
  const finalChoice = originalIdentity(value.finalChoice);
  if (!original || !finalChoice || !['confirmed', 'alternative'].includes(value.decision)) return null;
  const reviewedAt = typeof value.reviewedAt === 'string' && Number.isFinite(Date.parse(value.reviewedAt))
    ? new Date(value.reviewedAt).toISOString()
    : null;
  if (!reviewedAt) return null;
  return {
    schemaVersion: IDENTITY_REVIEW_VERSION,
    decision: value.decision,
    original,
    finalChoice,
    requiresRecapture: value.decision === 'alternative',
    reviewedAt,
  };
}
