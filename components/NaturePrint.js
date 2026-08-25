import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import CategoryIcon from './CategoryIcon';
import { CATEGORIES } from './categories';
import { colors } from './theme';

export function naturePrintHash(value) {
  const input = String(value || 'naturelens');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function naturePrintPattern(identityKey, category) {
  const hash = naturePrintHash(`${category || 'nature'}:${identityKey || 'unknown'}`);
  return {
    code: hash.toString(36).toUpperCase().padStart(7, '0').slice(0, 7),
    rotation: hash % 180,
    orbitRotation: (hash >>> 8) % 180,
    dotA: 9 + ((hash >>> 16) % 16),
    dotB: 48 + ((hash >>> 22) % 13),
  };
}

// Assinatura visual deterministica: a mesma identidade produz sempre o mesmo
// selo, sem transformar o desenho em dado biologico ou alegar certeza extra.
export default function NaturePrint({
  identityKey,
  category,
  accent = colors.accent,
}) {
  const { t } = useTranslation();
  const pattern = naturePrintPattern(identityKey, category);
  const meta = CATEGORIES[category] || CATEGORIES.plant;

  return (
    <View
      style={[styles.card, { borderColor: accent + '55', backgroundColor: accent + '0F' }]}
      accessible
      accessibilityLabel={`${t('discoveryReceipt.title')}: NaturePrint ${pattern.code}`}
    >
      <View style={[styles.mark, { borderColor: accent + '66' }]} accessible={false}>
        <View
          style={[
            styles.orbit,
            { borderColor: accent + '88', transform: [{ rotate: `${pattern.rotation}deg` }] },
          ]}
        />
        <View
          style={[
            styles.orbit,
            styles.orbitTight,
            { borderColor: accent + '55', transform: [{ rotate: `${pattern.orbitRotation}deg` }] },
          ]}
        />
        <View style={[styles.dot, { top: pattern.dotA, left: 13, backgroundColor: accent }]} />
        <View style={[styles.dot, styles.dotSmall, { top: 21, left: pattern.dotB, backgroundColor: accent }]} />
        <View style={[styles.center, { backgroundColor: accent + '28' }]}>
          <CategoryIcon name={meta.tabIcon || meta.icon} size={25} color={accent} />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: accent }]}>NATUREPRINT</Text>
        <Text style={styles.title}>{t('discoveryReceipt.ready')}</Text>
        <Text style={styles.code}>NL · {pattern.code}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 13,
    overflow: 'hidden',
  },
  mark: {
    width: 70,
    height: 70,
    borderWidth: 1,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orbit: {
    position: 'absolute',
    width: 58,
    height: 25,
    borderWidth: 1,
    borderRadius: 999,
  },
  orbitTight: { width: 48, height: 19 },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  dotSmall: { width: 4, height: 4, borderRadius: 2 },
  center: {
    width: 39,
    height: 39,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  eyebrow: { fontSize: 9.5, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
  title: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 2 },
  code: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0.45,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
});
