import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, space, type } from './theme';
import useReducedMotion from './useReducedMotion';

const MASCOT = require('../assets/art/naturelens-mascot.jpg');

export default function MascotWelcomeCard() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const float = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      float.setValue(0.45);
      glow.setValue(0.55);
      return undefined;
    }

    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1550, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1550, useNativeDriver: true }),
      ])
    );
    const pulsing = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    );

    floating.start();
    pulsing.start();
    return () => {
      floating.stop();
      pulsing.stop();
    };
  }, [float, glow, reduceMotion]);

  const mascotStyle = {
    transform: [
      {
        translateY: float.interpolate({
          inputRange: [0, 1],
          outputRange: [3, -5],
        }),
      },
      {
        rotate: float.interpolate({
          inputRange: [0, 1],
          outputRange: ['-1.5deg', '1.5deg'],
        }),
      },
    ],
  };
  const glowStyle = {
    opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.5] }),
    transform: [
      {
        scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }),
      },
    ],
  };

  return (
    <View style={styles.card} accessible>
      <LinearGradient
        colors={['rgba(127,199,154,0.20)', 'rgba(31,42,37,0.94)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.copy}>
        <Text style={styles.kicker}>{t('discover.mascot.kicker')}</Text>
        <Text style={styles.title}>{t('discover.mascot.title')}</Text>
        <Text style={styles.body}>{t('discover.mascot.body')}</Text>
        <View style={styles.pills}>
          {['photo', 'sound', 'journal'].map((item) => (
            <View key={item} style={styles.pill}>
              <Ionicons
                name={item === 'photo' ? 'camera' : item === 'sound' ? 'mic' : 'book'}
                size={13}
                color={colors.accentLight}
              />
              <Text style={styles.pillText}>{t(`discover.mascot.${item}`)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.stage}>
        <Animated.View style={[styles.halo, glowStyle]} />
        <Animated.View style={[styles.mascotFrame, mascotStyle]}>
          <Image source={MASCOT} style={styles.mascot} resizeMode="cover" />
        </Animated.View>
        <Animated.View style={[styles.spark, styles.sparkOne, glowStyle]}>
          <Ionicons name="sparkles" size={14} color={colors.warning} />
        </Animated.View>
        <Animated.View style={[styles.spark, styles.sparkTwo, glowStyle]}>
          <Ionicons name="leaf" size={13} color={colors.accentLight} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 148,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accentLight + '3D',
    backgroundColor: colors.surface,
    marginBottom: space.lg,
    padding: space.md,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    ...shadow,
  },
  copy: { flex: 1, minWidth: 0 },
  kicker: {
    ...type.caption,
    color: colors.accentLight,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    marginTop: 4,
  },
  body: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 5,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: space.sm,
  },
  pill: {
    minHeight: 28,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.accentLight + '2E',
    backgroundColor: colors.background + '77',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  stage: {
    width: 104,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: colors.accentLight,
  },
  mascotFrame: {
    width: 86,
    height: 86,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.accentLight + '99',
    backgroundColor: colors.surfaceElevated,
  },
  mascot: { width: '100%', height: '100%' },
  spark: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background + 'DD',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sparkOne: { top: 9, right: 5 },
  sparkTwo: { bottom: 9, left: 4 },
});
