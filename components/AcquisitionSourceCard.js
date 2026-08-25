import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ACQUISITION_SOURCES, getAcquisitionSource, saveAcquisitionSource } from './acquisitionSource';
import { sensoryFeedback } from './sensoryFeedback';
import { trackAcquisitionSourceAnswered } from './tracking';
import { colors } from './theme';

export default function AcquisitionSourceCard({ visible = true, accent = colors.accent }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    if (!visible) {
      setStatus('hidden');
      return () => { alive = false; };
    }
    getAcquisitionSource()
      .then((value) => {
        if (alive) setStatus(value ? 'hidden' : 'ready');
      })
      .catch(() => {
        if (alive) setStatus('hidden');
      });
    return () => { alive = false; };
  }, [visible]);

  const answer = async (source) => {
    if (status !== 'ready') return;
    setStatus('saving');
    const saved = await saveAcquisitionSource(source);
    if (!saved) {
      setStatus('ready');
      return;
    }
    trackAcquisitionSourceAnswered({ source });
    sensoryFeedback.success();
    setStatus('thanks');
  };

  if (!visible || status === 'loading' || status === 'hidden') return null;

  if (status === 'thanks') {
    return (
      <View style={styles.thanks} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={17} color={accent} accessible={false} />
        <Text style={styles.thanksText}>{t('acquisition.thanks')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">{t('acquisition.title')}</Text>
      <Text style={styles.subtitle}>{t('acquisition.subtitle')}</Text>
      <View style={styles.options}>
        {ACQUISITION_SOURCES.map((source) => (
          <TouchableOpacity
            key={source}
            style={styles.option}
            onPress={() => answer(source)}
            disabled={status === 'saving'}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ disabled: status === 'saving' }}
          >
            <Text style={styles.optionText}>{t(`acquisition.options.${source}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={styles.skip}
        onPress={() => answer('skipped')}
        disabled={status === 'saving'}
        accessibilityRole="button"
      >
        <Text style={styles.skipText}>{t('acquisition.skip')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 14,
    paddingTop: 14,
  },
  title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  option: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  optionText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '700' },
  skip: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 2 },
  skipText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  thanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 14,
    paddingTop: 14,
  },
  thanksText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
});
