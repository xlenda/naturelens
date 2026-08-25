import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

export default function AudioEvidenceCard({ waveform, durationSeconds, accent = colors.accent }) {
  const { t, i18n } = useTranslation();
  const peaks = Array.isArray(waveform) ? waveform.map(Number) : [];
  const duration = Number(durationSeconds);

  if (
    peaks.length < 32 ||
    peaks.length > 48 ||
    peaks.some((peak) => !Number.isFinite(peak) || peak < 0 || peak > 1) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  let seconds;
  try {
    seconds = new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(duration);
  } catch (e) {
    seconds = duration.toFixed(1);
  }

  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityLabel={t('sound.audioEvidenceAlt', { seconds })}
    >
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: accent + '22' }]}>
          <Ionicons name="mic-outline" size={17} color={accent} />
        </View>
        <View style={styles.heading}>
          <Text style={styles.title}>{t('sound.audioEvidenceTitle')}</Text>
          <Text style={styles.body}>{t('sound.audioEvidenceBody')}</Text>
        </View>
        <Text style={[styles.duration, { color: accent }]}>
          {t('sound.audioEvidenceDuration', { seconds })}
        </Text>
      </View>

      <View
        style={styles.waveform}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      >
        {peaks.map((peak, index) => (
          <View key={index} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: accent,
                  height: Math.max(2, Math.round(peak * 52)),
                  opacity: 0.42 + peak * 0.58,
                },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { flex: 1 },
  title: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  duration: { fontSize: 12, fontWeight: '800', paddingTop: 2 },
  waveform: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 13,
  },
  barSlot: { flex: 1, height: 54, justifyContent: 'center' },
  bar: { width: '100%', borderRadius: 8 },
});
