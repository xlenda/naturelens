import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { trackResultFeedback } from './tracking';
import PressScale from './PressScale';
import { sensoryFeedback } from './sensoryFeedback';
import { recordPositiveReviewSignal } from './storeReview';

// "Was this helpful? Yes/No" - the competitor asks it at the end of every
// content surface; it is the denominator of wrong identifications the app
// never measured. One tap, optimistic thanks state, event to the dataLayer
// (web-only by tracking.js's own guard) - never a modal, never a form.
export default function HelpfulRow({ category, context }) {
  const { t } = useTranslation();
  const [answered, setAnswered] = useState(false);

  const answer = (useful) => {
    if (answered) return;
    sensoryFeedback.selection();
    setAnswered(true);
    trackResultFeedback({ category, context, useful });
    if (useful) recordPositiveReviewSignal().catch(() => undefined);
  };

  if (answered) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('detail.feedbackThanks')}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.accent} accessible={false} />
        <Text style={styles.thanks}>{t('detail.feedbackThanks')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t('detail.wasHelpful')}</Text>
      <PressScale>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => answer(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.yes')}
        >
          <Ionicons name="thumbs-up-outline" size={14} color={colors.textSecondary} accessible={false} />
          <Text style={styles.btnText}>{t('common.yes')}</Text>
        </TouchableOpacity>
      </PressScale>
      <PressScale>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => answer(false)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.no')}
        >
          <Ionicons name="thumbs-down-outline" size={14} color={colors.textSecondary} accessible={false} />
          <Text style={styles.btnText}>{t('common.no')}</Text>
        </TouchableOpacity>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    minHeight: 56,
  },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginRight: 4 },
  thanks: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  btn: {
    minHeight: 44,
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
