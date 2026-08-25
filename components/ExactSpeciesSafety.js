import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { getCuratedSafety } from './curatedDetails';
import { colors } from './theme';

const LEVEL_COLORS = Object.freeze({
  danger: colors.error,
  warning: colors.warning,
});

// So aparece para um binomio, uma chave de risco e um texto localizado que
// casem no catalogo. Prosa do fornecedor nunca e usada para deduzir perigo.
export default function ExactSpeciesSafety({ category, scientific }) {
  const { t, i18n } = useTranslation();
  const [safety, setSafety] = useState(null);

  useEffect(() => {
    let alive = true;
    setSafety(null);
    getCuratedSafety(i18n.language, category, scientific).then((value) => {
      if (alive) setSafety(value);
    });
    return () => {
      alive = false;
    };
  }, [category, scientific, i18n.language]);

  const color = LEVEL_COLORS[safety?.riskLevel];
  if (!color || !safety?.text) return null;

  return (
    <View accessibilityLiveRegion="polite">
      <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={color}>
        <Text style={styles.body}>{safety.text}</Text>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
});
