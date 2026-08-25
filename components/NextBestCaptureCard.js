import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, control, radius, space, type } from './theme';

const SUPPORTED_CATEGORIES = new Set([
  'plant',
  'tree',
  'crop',
  'mushroom',
  'insect',
  'fish',
  'bird',
  'sound',
]);

export const NEXT_CAPTURE_CONFIDENCE = 85;

export function identityNeedsAnotherCapture(identityStatus) {
  return identityStatus === 'candidate' || identityStatus === 'unresolved';
}

export function shouldSuggestNextCapture({
  fromIdentify,
  category,
  confidence,
  alternatives,
  identityStatus,
}) {
  if (!SUPPORTED_CATEGORIES.has(category)) return false;
  // Um resultado salvo que parou no genero continua incompleto ao ser reaberto.
  // Explicar isso nao depende de ainda estarmos na rota original da camera.
  if (identityNeedsAnotherCapture(identityStatus)) return true;
  if (!fromIdentify) return false;
  const lowConfidence = Number.isFinite(confidence) && confidence < NEXT_CAPTURE_CONFIDENCE;
  const hasAlternatives = Array.isArray(alternatives) && alternatives.length > 0;
  return lowConfidence || hasAlternatives;
}

// A orientacao e de captura, nao de biologia: ela so aparece quando o resultado
// real traz baixa confianca ou alternativas. Sem esse sinal, nao fingimos saber
// que falta evidencia e o card inteiro some.
export default function NextBestCaptureCard({
  category,
  confidence,
  alternatives,
  fromIdentify,
  identityStatus,
  resultName,
  accent = colors.accent,
  onRetake,
}) {
  const { t } = useTranslation();
  if (!shouldSuggestNextCapture({
    fromIdentify,
    category,
    confidence,
    alternatives,
    identityStatus,
  })) return null;

  const alternativeCount = Array.isArray(alternatives) ? alternatives.length : 0;
  const needsSpecies = identityNeedsAnotherCapture(identityStatus);
  const reasonKey = needsSpecies
    ? 'nextBestCapture.reasonIdentityUnresolved'
    : alternativeCount > 0
    ? 'nextBestCapture.reasonAlternatives'
    : 'nextBestCapture.reasonLowConfidence';

  return (
    <View style={[styles.card, { borderColor: accent + '66' }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: accent + '20' }]}>
          <Ionicons name="camera-outline" size={20} color={accent} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title} accessibilityRole="header">{t('nextBestCapture.title')}</Text>
          <Text style={styles.reason}>
            {t(reasonKey, { confidence, count: alternativeCount, name: resultName })}
          </Text>
        </View>
      </View>
      <Text style={styles.instruction}>{t(`nextBestCapture.categories.${category}`)}</Text>
      {typeof onRetake === 'function' && (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: accent }]}
          onPress={onRetake}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={t('nextBestCapture.action')}
        >
          <Ionicons name="refresh-outline" size={17} color={colors.white} />
          <Text style={styles.actionText}>{t('nextBestCapture.action')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  title: { ...type.cardTitle },
  reason: { ...type.caption, marginTop: 2 },
  instruction: { ...type.body, marginTop: space.sm },
  action: {
    minHeight: control.minTouch,
    borderRadius: radius.sm,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  actionText: { color: colors.white, fontSize: 13.5, fontWeight: '800' },
});
