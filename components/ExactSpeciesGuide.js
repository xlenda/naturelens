import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import ZoneBand from './ZoneBand';
import { getCuratedDetail } from './curatedDetails';
import { colors } from './theme';

const FIELDS = Object.freeze([
  Object.freeze({ key: 'overview', title: 'common.overview', icon: 'document-text-outline' }),
  Object.freeze({ key: 'habitat', title: 'fieldGuide.habitat', icon: 'earth-outline' }),
  Object.freeze({ key: 'curiosity', title: 'fieldGuide.curiosity', icon: 'sparkles-outline' }),
]);

const asText = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).join('\n\n')
    : typeof value === 'string' && value.trim()
    ? value.trim()
    : null;

// Esta camada so abre quando o binomio casa exatamente com o catalogo curado.
// O nome popular nunca participa do join: um falso positivo seria pior que
// esconder habitat e curiosidade quando a especie ainda nao tem verbete.
export default function ExactSpeciesGuide({
  category,
  scientific,
  accent = colors.accent,
  includeOverview = false,
}) {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    getCuratedDetail(i18n.language, category, scientific).then((value) => {
      if (alive) setDetail(value);
    });
    return () => {
      alive = false;
    };
  }, [category, scientific, i18n.language]);

  const visible = FIELDS
    .filter((field) => includeOverview || field.key !== 'overview')
    .map((field) => ({ ...field, value: asText(detail?.[field.key]) }))
    .filter((field) => field.value);

  if (!detail?.scientific || visible.length === 0) return null;

  return (
    <ZoneBand gutter={20}>
      <View style={[styles.scope, { borderColor: accent + '55', backgroundColor: accent + '12' }]}>
        <Ionicons name="finger-print-outline" size={15} color={accent} />
        <Text style={[styles.scopeText, { color: accent }]}>
          {t('common.identified')}: {detail.scientific}
        </Text>
      </View>
      {visible.map((field) => (
        <SectionCard key={field.key} icon={field.icon} title={t(field.title)} color={accent}>
          <Text style={styles.body}>{field.value}</Text>
        </SectionCard>
      ))}
    </ZoneBand>
  );
}

const styles = StyleSheet.create({
  scope: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    marginBottom: 10,
  },
  scopeText: { fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
});
