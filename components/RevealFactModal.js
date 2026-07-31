import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';

export default function RevealFactModal({ visible, fact, onContinue }) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.85);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 60 }),
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <View style={styles.sparkleBadge}>
          <Ionicons name="sparkles" size={26} color={colors.accent} />
        </View>
        <Text style={styles.title}>{t('identify.didYouKnowTitle')}</Text>
        <ScrollView style={styles.factScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.fact}>{fact}</Text>
        </ScrollView>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={onContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('identify.continueLabel')}
        >
          <Text style={styles.continueBtnText}>{t('identify.continueLabel')}</Text>
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
    maxHeight: '85%',
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  factScroll: {
    maxHeight: 220,
    alignSelf: 'stretch',
    marginBottom: 22,
  },
  sparkleBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 10, textAlign: 'center' },
  fact: { fontSize: 14.5, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },
  continueBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  continueBtnText: { color: colors.white, fontWeight: '700', fontSize: 14.5 },
});
