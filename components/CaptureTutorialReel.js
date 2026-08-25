import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import CategoryIcon from './CategoryIcon';
import useReducedMotion from './useReducedMotion';
import { colors, radius, shadow, space, type } from './theme';

export default function CaptureTutorialReel({ category, categoryIcon, accent = colors.accent }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const scan = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      scan.setValue(0.65);
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scan, { toValue: 1, duration: 1450, useNativeDriver: false }),
          Animated.delay(180),
          Animated.timing(scan, { toValue: 0, duration: 0, useNativeDriver: false }),
          Animated.delay(520),
        ]),
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion, scan]);

  const subject = t(`identify.captureDemo.subject.${category}`, {
    defaultValue: t('identify.captureDemo.subject.plant'),
  });
  const categoryLabel = t(`categories.${category}.label`, { defaultValue: t('categories.plant.label') });

  return (
    <View
      style={[styles.card, { borderColor: accent + '55' }]}
      accessible
      accessibilityLabel={t('identify.captureDemo.accessibility', { category: categoryLabel })}
    >
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: accent + '20' }]}>
          <Ionicons name="play" size={15} color={accent} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('identify.captureDemo.title')}</Text>
          <Text style={styles.body}>{t('identify.captureDemo.body', { category: categoryLabel.toLowerCase() })}</Text>
        </View>
      </View>

      <View style={styles.scene}>
        <View style={[styles.subjectCard, { borderColor: accent + '55' }]}>
          <View style={[styles.subjectIcon, { backgroundColor: accent + '18' }]}>
            <CategoryIcon name={categoryIcon} size={31} color={accent} />
          </View>
          <Text style={styles.subjectText} numberOfLines={2}>{subject}</Text>
        </View>

        <Animated.View
          style={[
            styles.tapHalo,
            {
              borderColor: accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.65] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) },
              ],
            },
          ]}
        />

        <View style={styles.phone}>
          <View style={styles.phoneTop} />
          <View style={styles.phoneScreen}>
            <View style={[styles.focus, { borderColor: accent }]} />
            <Animated.View
              style={[
                styles.scanLine,
                {
                  backgroundColor: accent,
                  top: scan.interpolate({ inputRange: [0, 1], outputRange: [22, 92] }),
                },
              ]}
            />
            <View style={[styles.shutter, { backgroundColor: accent }]}>
              <Ionicons name="camera" size={15} color={colors.white} />
            </View>
          </View>
        </View>

        <View style={styles.resultBubble}>
          <View style={[styles.resultDot, { backgroundColor: accent }]} />
          <Text style={styles.resultText}>{t('identify.captureDemo.result')}</Text>
        </View>
      </View>

      <View style={styles.steps}>
        {['aim', 'tap', 'confirm'].map((key, index) => (
          <View key={key} style={styles.step}>
            <Text style={[styles.stepNumber, { color: accent }]}>{index + 1}</Text>
            <Text style={styles.stepText}>{t(`identify.captureDemo.steps.${key}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: space.md,
    marginTop: space.md,
    marginBottom: space.sm,
    ...shadow,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  title: { ...type.cardTitle },
  body: { ...type.caption, marginTop: 2 },
  scene: {
    height: 168,
    marginTop: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  subjectCard: {
    position: 'absolute',
    left: 14,
    top: 18,
    width: 112,
    minHeight: 118,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.background + 'D9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  subjectIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectText: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  tapHalo: {
    position: 'absolute',
    left: 173,
    top: 66,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
  },
  phone: {
    position: 'absolute',
    right: 18,
    top: 18,
    width: 92,
    height: 132,
    borderRadius: 20,
    backgroundColor: '#101613',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 7,
  },
  phoneTop: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginBottom: 6,
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 15,
    backgroundColor: colors.background,
    overflow: 'hidden',
    alignItems: 'center',
  },
  focus: {
    position: 'absolute',
    left: 13,
    right: 13,
    top: 22,
    bottom: 30,
    borderWidth: 1.5,
    borderRadius: 13,
  },
  scanLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 2,
    shadowOpacity: 0.8,
    shadowRadius: 7,
  },
  shutter: {
    position: 'absolute',
    bottom: 7,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBubble: {
    position: 'absolute',
    left: 126,
    right: 112,
    bottom: 18,
    minHeight: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.background + 'E6',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
  },
  resultDot: { width: 8, height: 8, borderRadius: 4 },
  resultText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
  steps: { flexDirection: 'row', gap: 7, marginTop: space.sm },
  step: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  stepNumber: { fontSize: 11, lineHeight: 14, fontWeight: '900' },
  stepText: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2 },
});
