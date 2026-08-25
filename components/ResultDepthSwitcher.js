import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, control, radius, space, type } from './theme';
import {
  getCachedDiscoveryPreferences,
  getDiscoveryPreferences,
  subscribeDiscoveryPreferences,
  updateDiscoveryPreferences,
} from './discoveryPreferences';

export const RESULT_DEPTHS = Object.freeze({
  ESSENTIAL: 'essential',
  VISUAL: 'visual',
  EXPERT: 'expert',
});

const OPTIONS = Object.freeze([
  { key: RESULT_DEPTHS.ESSENTIAL, icon: 'flash-outline' },
  { key: RESULT_DEPTHS.VISUAL, icon: 'images-outline' },
  { key: RESULT_DEPTHS.EXPERT, icon: 'flask-outline' },
]);

function depthFromPreference(depth) {
  if (depth === 'visual') return RESULT_DEPTHS.VISUAL;
  if (depth === 'technical') return RESULT_DEPTHS.EXPERT;
  return RESULT_DEPTHS.ESSENTIAL;
}

function preferenceFromDepth(depth) {
  if (depth === RESULT_DEPTHS.VISUAL) return 'visual';
  if (depth === RESULT_DEPTHS.EXPERT) return 'technical';
  return 'essential';
}

export function useResultDepthPreference() {
  const [depth, setDepth] = useState(() => (
    depthFromPreference(getCachedDiscoveryPreferences().depth)
  ));

  useEffect(() => {
    let alive = true;
    getDiscoveryPreferences().then((preferences) => {
      if (alive) setDepth(depthFromPreference(preferences.depth));
    });
    const unsubscribe = subscribeDiscoveryPreferences((preferences) => {
      if (alive) setDepth(depthFromPreference(preferences.depth));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const chooseDepth = (nextDepth) => {
    if (!Object.values(RESULT_DEPTHS).includes(nextDepth)) return;
    setDepth(nextDepth);
    updateDiscoveryPreferences({ depth: preferenceFromDepth(nextDepth) }).catch(() => undefined);
  };

  return [depth, chooseDepth];
}

export default function ResultDepthSwitcher({ value, onChange, accent = colors.accent }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('resultDepth.label')}</Text>
      <View style={styles.rail}>
        {OPTIONS.map((option) => {
          const selected = value === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.option,
                selected && { backgroundColor: accent + '22', borderColor: accent + '66' },
              ]}
              onPress={() => onChange(option.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`resultDepth.${option.key}`)}
            >
              <Ionicons
                name={option.icon}
                size={16}
                color={selected ? accent : colors.textMuted}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={[styles.optionText, selected && { color: accent }]} numberOfLines={1}>
                {t(`resultDepth.${option.key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Especialista e a ficha completa: inclui Essencial e Visual, preservando os
// componentes ricos que ja existiam. As duas leituras menores reduzem ruido sem
// excluir conhecimento nem alterar a fonte dos dados.
export function ResultDepthLayer({ activeDepth, depth, children }) {
  const visible = activeDepth === depth || activeDepth === RESULT_DEPTHS.EXPERT;
  if (!visible) return null;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: { ...type.caption, marginBottom: space.xs, fontWeight: '700' },
  rail: { flexDirection: 'row', gap: space.xs },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: control.minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  optionText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
});
