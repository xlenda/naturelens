import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { trackResultFeedback } from './tracking';

// "Was this helpful? Yes/No" - the competitor asks it at the end of every
// content surface; it is the denominator of wrong identifications the app
// never measured. One tap, optimistic thanks state, event to the dataLayer
// (web-only by tracking.js's own guard) - never a modal, never a form.
export default function HelpfulRow({ category, context }) {
  const { t } = useTranslation();
  const [answered, setAnswered] = useState(false);

  const answer = (useful) => {
    if (answered) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAnswered(true);
    trackResultFeedback({ category, context, useful });
  };

  if (answered) {
    return (
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t('detail.wasHelpful')}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => answer(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('common.yes')}
      >
        <Ionicons name="thumbs-up-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.btnText}>{t('common.yes')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => answer(false)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('common.no')}
      >
        <Ionicons name="thumbs-down-outline" size={14} color={colors.textSecondary} />
        <Text style={styles.btnText}>{t('common.no')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    minHeight: 56,
  },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginRight: 4 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
});
