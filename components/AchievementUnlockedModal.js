import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';
import { ACHIEVEMENT_LIST, TOKENS_PER_ACHIEVEMENT } from './achievements';

const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENT_LIST.map((a) => [a.id, a]));

// Shows one unlocked achievement at a time even when several unlock in the
// same evaluateAchievements() call (e.g. reopening the app after a long
// streak-breaking gap, then hitting several collector milestones at once
// after a bulk import scenario never happens today, but multiple could still
// unlock together in normal use) - `ids` is consumed front-to-back.
export default function AchievementUnlockedModal({ ids, onDone }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const visible = !!ids && ids.length > 0;
  const currentId = visible ? ids[index] : null;
  const meta = currentId ? ACHIEVEMENT_BY_ID[currentId] : null;

  useEffect(() => {
    if (visible) {
      setIndex(0);
      scale.setValue(0.85);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }),
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ids]);

  if (!visible || !meta) return null;

  const isLast = index >= ids.length - 1;

  const handleNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    setIndex((i) => i + 1);
    scale.setValue(0.85);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={styles.backdrop}>
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <View style={styles.badge}>
          <Ionicons name={meta.icon} size={30} color={colors.warning} />
        </View>
        <Text style={styles.eyebrow}>{t('achievements.unlockedTitle')}</Text>
        <Text style={styles.title}>{t(`achievements.${meta.id}.title`)}</Text>
        <Text style={styles.body}>{t(`achievements.${meta.id}.body`)}</Text>
        <View style={styles.tokensPill}>
          <Ionicons name="disc" size={14} color={colors.accentLight} />
          <Text style={styles.tokensPillText}>
            {t('achievements.tokensEarned', { count: TOKENS_PER_ACHIEVEMENT })}
          </Text>
        </View>
        {ids.length > 1 && (
          <Text style={styles.progress}>{index + 1}/{ids.length}</Text>
        )}
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLast ? t('identify.continueLabel') : t('common.next')}
        >
          <Text style={styles.continueBtnText}>
            {isLast ? t('identify.continueLabel') : t('common.next')}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 3000,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning + '55',
    ...shadow,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warning + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: 14 },
  tokensPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '22',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
  },
  tokensPillText: { color: colors.accentLight, fontWeight: '700', fontSize: 13, marginLeft: 6 },
  progress: { fontSize: 12, color: colors.textMuted, marginBottom: 14 },
  continueBtn: {
    backgroundColor: colors.warning,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  continueBtnText: { color: colors.background, fontWeight: '800', fontSize: 14.5 },
});
