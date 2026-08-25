import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENT_LIST } from './achievements';
import { colors, shadow } from './theme';
import {
  createRewardEligibility,
  createSuppressedScanOutcome,
  recordScanOutcomeRequest,
  rewardEligibilityAllowsProgress,
} from './scanOutcome';
import AcquisitionSourceCard from './AcquisitionSourceCard';
import NaturePrint from './NaturePrint';

const KNOWN_ACHIEVEMENTS = new Set(ACHIEVEMENT_LIST.map(({ id }) => id));
const NON_CELEBRATORY_RISK_LEVELS = new Set([
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

// Recebe somente nivel LOGICO cru. Texto traduzido nunca decide se um risco
// pode ganhar brilho, trofeu ou streak.
export function shouldCelebrateDiscovery({ category, celebrationAllowed, riskLevel, safetyPending, outcome } = {}) {
  if (celebrationAllowed === false || outcome?.celebrationAllowed === false) return false;
  const logicalRiskLevel = typeof riskLevel === 'string'
    ? riskLevel
    : outcome?.riskLevel;
  if (safetyPending === true) return false;
  return !NON_CELEBRATORY_RISK_LEVELS.has(String(logicalRiskLevel || '').trim().toLowerCase());
}

// Recibo inline, nunca modal: identidade, risco e evidencia continuam sendo o
// produto. Aqui so aparece o que recordScanOutcome confirmou no storage e o
// fato que veio no proprio resultado do fornecedor.
export default function DiscoveryReceiptCard({
  outcome,
  request,
  accent = colors.accent,
  celebrationAllowed,
  automaticSaveConfirmed = false,
  naturePrintAllowed = true,
  riskLevel,
  safetyPending = false,
}) {
  const { t } = useTranslation();
  const [resolved, setResolved] = useState(outcome || null);
  const [loading, setLoading] = useState(!outcome && !!request);
  const category = request?.category || outcome?.category;
  const eligibility = createRewardEligibility({
    category,
    celebrationAllowed,
    riskLevel,
    safetyPending,
  });

  useEffect(() => {
    let alive = true;
    if (outcome) {
      setResolved(outcome);
      setLoading(false);
      return () => { alive = false; };
    }
    setResolved(null);
    if (!request) {
      setLoading(false);
      return () => { alive = false; };
    }
    if (!rewardEligibilityAllowsProgress(eligibility, request.category)) {
      setResolved(createSuppressedScanOutcome(request, eligibility));
      setLoading(false);
      return () => { alive = false; };
    }
    setLoading(true);
    recordScanOutcomeRequest(request, { eligibility, automaticSaveConfirmed })
      .then((value) => {
        if (alive) setResolved(value);
      })
      .catch(() => {
        if (alive) setResolved(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [outcome, request?.id, eligibility?.status, automaticSaveConfirmed]);

  if (loading) {
    return (
      <View
        style={[styles.card, { borderColor: accent + '55' }]}
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy: true }}
      >
        <View style={styles.loadingHeading} accessible={false} />
        <View style={styles.loadingLine} accessible={false} />
        <View style={[styles.loadingLine, styles.loadingLineShort]} accessible={false} />
      </View>
    );
  }

  if (
    !resolved
    || resolved.version !== 1
    || (resolved.recorded !== true && resolved.receiptReady !== true)
  ) return null;

  const tokensEarned = Number.isFinite(resolved.tokensEarned)
    ? Math.max(0, Math.floor(resolved.tokensEarned))
    : 0;
  const currentStreak = Number.isFinite(resolved.currentStreak)
    ? Math.max(0, Math.floor(resolved.currentStreak))
    : 0;
  const achievementIds = Array.isArray(resolved.achievementIds)
    ? resolved.achievementIds.filter((id) => KNOWN_ACHIEVEMENTS.has(id))
    : [];
  const vendorFact = typeof resolved.vendorFact === 'string' && resolved.vendorFact.trim()
    ? resolved.vendorFact.trim()
    : null;
  const celebrate = resolved.recorded === true && shouldCelebrateDiscovery({
    category,
    celebrationAllowed,
    riskLevel,
    safetyPending,
    outcome: resolved,
  });
  const hasReward = tokensEarned > 0 || currentStreak > 0 || achievementIds.length > 0;

  return (
    <View
      style={[styles.card, { borderColor: accent + '55' }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: accent + '22' }]}>
          <Ionicons
            name={celebrate && hasReward ? 'sparkles-outline' : 'bookmark-outline'}
            size={20}
            color={accent}
            accessible={false}
          />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title} accessibilityRole="header">
            {t('discoveryReceipt.title')}
          </Text>
          <Text style={styles.ready}>{t('discoveryReceipt.ready')}</Text>
        </View>
      </View>

      {celebrate && (tokensEarned > 0 || currentStreak > 0) && (
        <View style={styles.rewardRow}>
          {tokensEarned > 0 && (
            <View style={styles.pill}>
              <Ionicons name="disc-outline" size={13} color={accent} accessible={false} />
              <Text style={[styles.pillText, { color: accent }]}>
                {t('discoveryReceipt.tokens', { count: tokensEarned })}
              </Text>
            </View>
          )}
          {currentStreak > 0 && (
            <View style={styles.pill}>
              <Ionicons name="flame-outline" size={13} color={colors.warning} accessible={false} />
              <Text style={styles.pillText}>
                {t('discoveryReceipt.streak', { count: currentStreak })}
              </Text>
            </View>
          )}
        </View>
      )}

      {celebrate && achievementIds.map((id) => (
        <View key={id} style={styles.achievementRow}>
          <Ionicons name="trophy-outline" size={15} color={colors.warning} accessible={false} />
          <Text style={styles.achievementText}>
            {t('discoveryReceipt.achievement', { title: t(`achievements.${id}.title`) })}
          </Text>
        </View>
      ))}

      {naturePrintAllowed && !!resolved.identityKey && (
        <NaturePrint
          identityKey={resolved.identityKey}
          category={resolved.category || request?.category}
          accent={accent}
        />
      )}

      {!!vendorFact && (
        <View style={styles.factBlock}>
          <Text style={styles.factTitle}>{t('discoveryReceipt.factTitle')}</Text>
          <Text style={styles.fact}>{vendorFact}</Text>
        </View>
      )}

      <View style={styles.saveRow}>
        <Ionicons name="bookmark-outline" size={15} color={colors.textMuted} accessible={false} />
        <Text style={styles.saveHint}>{t('discoveryReceipt.saveHint')}</Text>
      </View>

      <AcquisitionSourceCard visible={celebrate} accent={accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    ...shadow,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  ready: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  rewardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '700' },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 11,
  },
  achievementText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  factBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 13,
    paddingTop: 13,
  },
  factTitle: {
    color: colors.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  fact: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  saveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 13 },
  saveHint: { flex: 1, color: colors.textMuted, fontSize: 11.5, lineHeight: 17 },
  loadingHeading: {
    width: '48%',
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  loadingLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
    marginTop: 8,
  },
  loadingLineShort: { width: '72%' },
});
