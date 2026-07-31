import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '../components/CategoryIcon';
import { colors } from '../components/theme';
import { CATEGORY_LIST } from '../components/categories';
import { markOnboardingSeen } from '../components/onboarding';
import { trackOnboardingCompleted } from '../components/tracking';

// First-run introduction: three screens, then never again.
//
// Before this, a new user landed straight on a raw camera button with no idea
// what the app identified, that the first scan of each category is free, or
// that results are saved. Three screens is the most that gets read - the third
// is the one that actually matters (what it costs), and it is deliberately last
// so the value is established before the limit is mentioned.

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ onDone }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const steps = [
    {
      key: 'what',
      icon: 'scan',
      // Live from CATEGORY_LIST so the intro can never advertise a category
      // that has been turned off, or omit one that was just added.
      showCategories: true,
    },
    { key: 'collect', icon: 'albums' },
    { key: 'free', icon: 'sparkles' },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  const finish = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markOnboardingSeen();
    trackOnboardingCompleted({ steps: steps.length });
    onDone();
  };

  const next = () => {
    Haptics.selectionAsync();
    if (isLast) finish();
    else setStep((s) => s + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.skipRow}>
        {!isLast && (
          <TouchableOpacity
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skip')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skip}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        <LinearGradient
          colors={[colors.accent, colors.accentDark]}
          style={styles.iconCircle}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name={current.icon} size={54} color={colors.white} />
        </LinearGradient>

        <Text style={styles.title} accessibilityRole="header">
          {t(`onboarding.${current.key}.title`)}
        </Text>
        <Text style={styles.body_}>{t(`onboarding.${current.key}.body`)}</Text>

        {current.showCategories && (
          <View style={styles.catGrid}>
            {CATEGORY_LIST.map((c) => (
              <View key={c.key} style={[styles.catChip, { borderColor: c.accent + '66' }]}>
                <CategoryIcon name={c.tabIcon} size={16} color={c.accent} />
                <Text style={[styles.catChipText, { color: c.accent }]}>
                  {t(`categories.${c.key}.tabLabel`)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {steps.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity
          style={styles.cta}
          onPress={next}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLast ? t('onboarding.start') : t('onboarding.next')}
        >
          <Text style={styles.ctaText}>{isLast ? t('onboarding.start') : t('onboarding.next')}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 8, minHeight: 40 },
  skip: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 34,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  body_: {
    color: colors.textSecondary,
    fontSize: 15.5,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: Math.min(width - 64, 420),
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 26,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  catChipText: { fontSize: 12.5, fontWeight: '700' },
  footer: { paddingHorizontal: 32, paddingBottom: 28, gap: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 22 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 17,
  },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
