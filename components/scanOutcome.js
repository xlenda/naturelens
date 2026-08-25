import {
  addTokens,
  evaluateAchievements,
  getStreakInfo,
  recordIdentification,
} from './achievements';
import { CATEGORIES } from './categories';
import { recordMissionEvent, TOKENS_PER_MISSION } from './missions';
import { firstSentence } from './sentences';
import { trackAchievementUnlocked } from './tracking';

let requestSequence = 0;
const requestCache = new Map();

const REQUIRES_CONFIRMED_SAFE = new Set(['fish']);
const BLOCKED_RISK_LEVELS = new Set([
  'warning',
  'high',
  'danger',
  'severe',
  'critical',
  'toxic',
  'poisonous',
  'deadly',
  'fatal',
  'unknown',
  'unverified',
  'pending',
]);

const ELIGIBLE_REWARD_STATUSES = new Set(['safe', 'not_required']);

const FACT_FIELDS = Object.freeze({
  plant: ['culturalSignificance', 'commonUses', 'overview'],
  tree: ['culturalSignificance', 'commonUses', 'overview'],
  crop: ['overview'],
  insect: ['role', 'overview'],
  mushroom: ['overview'],
  fish: ['overview'],
  bird: ['overview'],
  sound: ['overview'],
});

// O recibo pode resumir apenas prosa que pertence ao candidato devolvido pela
// API. Identidade nao resolvida nao recebe "fato"; e o corte conserva uma
// frase completa para o card continuar didatico, sem parede de texto.
export function candidateFact({ category, entity } = {}) {
  if (!entity || entity.identityV1?.status === 'unresolved') return null;
  const fields = FACT_FIELDS[category] || [];
  const source = fields.map((key) => entity[key]).find((value) => typeof value === 'string' && value.trim());
  return firstSentence(source);
}

function cleanIdentityKey(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean ? clean.slice(0, 160) : null;
}

function cleanRiskLevel(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// O parecer viaja separado do texto e da identidade para continuar
// serializavel entre navegacao e remontagem. Peixe exige um "safe" explicito;
// categorias sem consulta assincrona preservam o comportamento atual, salvo
// quando a propria ficha ja conhece um risco ou bloqueio.
export function createRewardEligibility({
  category,
  celebrationAllowed,
  riskLevel,
  safetyPending = false,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) return null;

  const logicalRiskLevel = cleanRiskLevel(riskLevel);
  let status = 'not_required';
  if (safetyPending === true) status = 'pending';
  else if (BLOCKED_RISK_LEVELS.has(logicalRiskLevel)) {
    status = logicalRiskLevel === 'pending' ? 'pending' : 'unsafe';
  } else if (celebrationAllowed === false) status = 'unknown';
  else if (REQUIRES_CONFIRMED_SAFE.has(category)) {
    status = celebrationAllowed === true && logicalRiskLevel === 'safe'
      ? 'safe'
      : 'unknown';
  } else if (logicalRiskLevel === 'safe') {
    status = 'safe';
  }

  return { version: 1, category, status };
}

export function rewardEligibilityAllowsProgress(eligibility, category) {
  if (
    !eligibility
    || eligibility.version !== 1
    || eligibility.category !== category
    || !ELIGIBLE_REWARD_STATUSES.has(eligibility.status)
  ) {
    return false;
  }
  return !REQUIRES_CONFIRMED_SAFE.has(category) || eligibility.status === 'safe';
}

export function createSuppressedScanOutcome(request, eligibility) {
  if (
    !request
    || request.version !== 1
    || typeof request.id !== 'string'
    || !Object.prototype.hasOwnProperty.call(CATEGORIES, request.category)
  ) {
    return null;
  }
  const resolvedIdentityKey = cleanIdentityKey(request.identityKey);
  return {
    version: 1,
    receiptReady: true,
    recorded: false,
    category: request.category,
    rewardStatus: eligibility?.status || 'unknown',
    celebrationAllowed: false,
    tokensEarned: 0,
    currentStreak: 0,
    completedMissionIds: [],
    achievementIds: [],
    vendorFact: typeof request.fact === 'string' && request.fact.trim() ? request.fact.trim() : null,
    ...(resolvedIdentityKey ? { identityKey: resolvedIdentityKey } : {}),
  };
}

// O selo precisa sobreviver a uma troca de idioma. As APIs antigas e novas
// usam nomes de campo diferentes, mas todas devem priorizar o taxon cientifico
// antes do nome comum/localizado. Identidade explicitamente nao resolvida nao
// recebe uma assinatura visual.
export function candidateIdentityKey(entity) {
  if (!entity || entity.identityV1?.status === 'unresolved') return null;
  return cleanIdentityKey(
    entity.identityV1?.taxon?.scientificName
      || entity.scientific
      || entity.scientificName
      || entity.scientific_name
  );
}

export function createScanOutcomeRequest({ category, fact, identityKey } = {}) {
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) return null;
  requestSequence = (requestSequence + 1) % 0x100000;
  return {
    version: 1,
    id: `${Date.now().toString(36)}-${requestSequence.toString(36)}`,
    category,
    fact: typeof fact === 'string' && fact.trim() ? fact.trim() : null,
    identityKey: cleanIdentityKey(identityKey),
  };
}

// Um resultado biologico nao pode depender da camada de recompensa. Esta
// funcao nunca lanca: se o storage de progresso falhar, a identificacao ainda
// abre e o recibo simplesmente nao aparece.
export async function recordScanOutcome({
  category,
  fact,
  identityKey,
  eligibility,
  automaticSaveConfirmed = false,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) return null;
  const resolvedEligibility = eligibility || createRewardEligibility({ category });
  if (!rewardEligibilityAllowsProgress(resolvedEligibility, category)) return null;

  try {
    const before = await getStreakInfo();
    await recordIdentification();

    // A leitura confirma que a identificacao foi realmente persistida. Sem
    // isso, constantes como "+5" poderiam celebrar um credito que o aparelho
    // nao conseguiu gravar.
    const afterScan = await getStreakInfo();
    if (afterScan.totalIdentifications <= before.totalIdentifications) return null;

    const completedMissionIds = await recordMissionEvent('scan', { category });
    if (automaticSaveConfirmed === true) {
      const saveMissionIds = await recordMissionEvent('save');
      completedMissionIds.push(...saveMissionIds);
    }
    if (completedMissionIds.length > 0) {
      await addTokens(completedMissionIds.length * TOKENS_PER_MISSION);
    }

    const achievementResult = await evaluateAchievements();
    const finalState = await getStreakInfo();
    const vendorFact = typeof fact === 'string' && fact.trim() ? fact.trim() : null;

    const achievementIds = [...(achievementResult?.newlyUnlocked || [])];
    achievementIds.forEach((achievementId) => trackAchievementUnlocked({ achievementId }));

    const resolvedIdentityKey = cleanIdentityKey(identityKey);
    return {
      version: 1,
      recorded: true,
      category,
      tokensEarned: Math.max(0, finalState.tokens - before.tokens),
      totalTokens: finalState.tokens,
      currentStreak: finalState.currentStreak,
      longestStreak: finalState.longestStreak,
      totalIdentifications: finalState.totalIdentifications,
      completedMissionIds: [...completedMissionIds],
      achievementIds,
      vendorFact,
      ...(resolvedIdentityKey ? { identityKey: resolvedIdentityKey } : {}),
    };
  } catch (e) {
    return null;
  }
}

// React Strict Mode pode montar a ficha duas vezes. O id serializavel garante
// que a mesma identificacao grava progresso uma vez so, mesmo com remontagem.
export function recordScanOutcomeRequest(request, {
  eligibility,
  automaticSaveConfirmed = false,
} = {}) {
  if (
    !request ||
    request.version !== 1 ||
    typeof request.id !== 'string' ||
    !Object.prototype.hasOwnProperty.call(CATEGORIES, request.category)
  ) {
    return Promise.resolve(null);
  }
  const resolvedEligibility = eligibility || createRewardEligibility({ category: request.category });
  if (!rewardEligibilityAllowsProgress(resolvedEligibility, request.category)) {
    // Nao entra no cache: um lookup ainda pendente pode voltar seguro e usar o
    // mesmo id depois, sem que a primeira negativa congele a identificacao.
    return Promise.resolve(createSuppressedScanOutcome(request, resolvedEligibility));
  }
  if (requestCache.has(request.id)) return requestCache.get(request.id);

  if (requestCache.size >= 32) {
    requestCache.delete(requestCache.keys().next().value);
  }
  const pending = recordScanOutcome({
    category: request.category,
    fact: request.fact,
    identityKey: request.identityKey,
    eligibility: resolvedEligibility,
    automaticSaveConfirmed,
  });
  requestCache.set(request.id, pending);
  return pending;
}
