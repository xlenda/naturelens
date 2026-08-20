import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '../components/CategoryIcon';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
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

// The illustrated scenes, generated with the app's own palette (deep greens,
// cream, amber). This is CHROME art - it decorates the welcome, it never
// states a species fact, so the honest-data doctrine is untouched. Compressed
// to ~50-70KB each; Metro serves them as separate files, so they only load
// on this screen.
const SCENES = {
  what: require('../assets/art/onboarding-identify.jpg'),
  collect: require('../assets/art/onboarding-collect.jpg'),
  free: require('../assets/art/onboarding-learn.jpg'),
};

export default function OnboardingScreen({ onDone }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  // Micro-animacao (diagramacao-premium): subtle fade+slide when the slide
  // changes. useNativeDriver:false because this ships on react-native-web.
  // It only animates opacity/translate of content that is already mounted -
  // it never delays the press handler or alters any text.
  const slideIn = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    slideIn.setValue(0);
    Animated.timing(slideIn, {
      toValue: 1,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [step, slideIn]);

  // Ken Burns: the scene breathes - a slow 9s zoom drift, back and forth.
  // This is the competitor's "living illustration" first-entry device. An
  // ambient loop is acceptable HERE because onboarding is a transient screen
  // seen once; the loop dies with the unmount (cleanup below), it never runs
  // during normal app use.
  const kenBurns = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(kenBurns, { toValue: 1, duration: 9000, useNativeDriver: false }),
        Animated.timing(kenBurns, { toValue: 0, duration: 9000, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [kenBurns]);

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
      {/* Cenario em camadas (diagramacao-premium): first child of the root,
          pointerEvents none inside, root keeps its backgroundColor beneath. */}
      <NatureScene />
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

      {/* The illustrated scene: full-bleed, cover-cropped, fading into the
          page background at its base so the art and the screen read as one
          place instead of a pasted picture (ancora cenica da doutrina). */}
      <Animated.View style={[styles.sceneWrap, { opacity: slideIn }]} pointerEvents="none">
        <Animated.Image
          source={SCENES[current.key]}
          style={[
            styles.sceneImage,
            {
              transform: [
                { scale: kenBurns.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
                { translateY: kenBurns.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
              ],
            },
          ]}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', colors.background]}
          style={styles.sceneFade}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.body,
          {
            opacity: slideIn,
            transform: [
              {
                translateY: slideIn.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          },
        ]}
      >
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
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {steps.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        {/* Press-scale by OUTER wrapper (diagramacao-premium): the Touchable
            below stays byte for byte - label, role and onPress untouched, so
            the e2e gate that clicks this CTA sees exactly what it always saw. */}
        <PressScale>
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
        </PressScale>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 8, minHeight: 40 },
  skip: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  // The scene takes the upper half edge to edge; the text keeps the lower
  // half. flex ratios instead of fixed heights so small phones shrink the
  // art, never the copy.
  sceneWrap: { flex: 1.15, marginTop: -40, overflow: 'hidden' },
  sceneImage: { width: '100%', height: '100%' },
  sceneFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
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
