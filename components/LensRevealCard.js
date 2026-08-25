import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, space, type } from './theme';

// O reveal e um recibo curto do que a identificacao realmente devolveu. Risco
// continua fora e acima deste card: misturar alerta grave com resumo visual
// faria a animacao da descoberta parecer comemoracao do perigo.
export default function LensRevealCard({ confidence, summary, accent = colors.accent, critical = false }) {
  const { t } = useTranslation();
  const hasConfidence = Number.isFinite(confidence);
  const hasSummary = typeof summary === 'string' && summary.trim().length > 0;

  if (!hasConfidence && !hasSummary && !critical) return null;

  const color = critical ? colors.error : accent;
  return (
    <View
      style={[styles.card, { borderColor: color + '66', backgroundColor: color + '10' }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.icon, { backgroundColor: color + '22' }]}>
        <Ionicons
          name={critical ? 'warning-outline' : 'scan-circle-outline'}
          size={22}
          color={color}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color }]} accessibilityRole="header">
          {t(critical ? 'lensReveal.safetyFirst' : 'lensReveal.title')}
        </Text>
        {!critical && hasSummary && (
          <Text style={styles.summary} numberOfLines={3}>{summary.trim()}</Text>
        )}
      </View>
      {hasConfidence && (
        <View style={[styles.confidence, { borderColor: color + '55' }]}>
          <Text style={styles.confidenceLabel}>{t('common.confidence')}</Text>
          <Text style={[styles.confidenceValue, { color }]}>{confidence}%</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { ...type.cardTitle },
  summary: { ...type.body, marginTop: space.xxs },
  confidence: {
    minWidth: 62,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
    paddingVertical: 6,
    alignItems: 'center',
  },
  confidenceLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: '700' },
  confidenceValue: { fontSize: 16, lineHeight: 20, fontWeight: '900', marginTop: 1 },
});
