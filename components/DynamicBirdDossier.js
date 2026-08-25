import React, { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { insectRedListLabel } from './insectRedList';
import SectionCard from './SectionCard';
import { colors, control, radius, space, type } from './theme';

const SOURCE_NAMES = Object.freeze({ gbif: 'GBIF', wikidata: 'Wikidata' });

function FactSection({ icon, title, facts, accent }) {
  if (!facts.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {facts.map((fact) => (
        <View key={fact.id} style={styles.factRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={styles.factText}>{fact.label}</Text>
        </View>
      ))}
    </View>
  );
}

function MeasurementSection({ icon, title, measurements, accent, language, t }) {
  const number = useMemo(() => new Intl.NumberFormat(language, {
    maximumFractionDigits: 2,
  }), [language]);
  const unitFormatters = useMemo(() => {
    const result = {};
    for (const unit of ['hour', 'day', 'week', 'month', 'year']) {
      try {
        result[unit] = new Intl.NumberFormat(language, {
          style: 'unit',
          unit,
          unitDisplay: 'long',
          maximumFractionDigits: 2,
        });
      } catch (error) {
        result[unit] = null;
      }
    }
    return result;
  }, [language]);
  if (!measurements.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {measurements.map((item) => {
        // Intl flexiona unidade e plural no idioma do aparelho. Se a engine nao
        // conhecer uma unidade, fica apenas o numero, nunca uma palavra inglesa.
        const value = item.unit === 'count' || !unitFormatters[item.unit]
          ? number.format(item.amount)
          : unitFormatters[item.unit].format(item.amount);
        return (
          <View key={`${item.id}:${item.amount}:${item.unit}`} style={styles.measurementRow}>
            <Text style={styles.measurementLabel}>{t(`speciesDossier.measurements.${item.id}`)}</Text>
            <Text style={[styles.measurementValue, { color: accent }]}>
              {value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function DynamicBirdDossier({ dossier, accent = colors.accent }) {
  const { t, i18n } = useTranslation();
  const conservation = dossier?.conservation
    ? insectRedListLabel(dossier.conservation, t)
    : null;
  if (!dossier) return null;

  return (
    <SectionCard icon="library-outline" title={t('speciesDossier.title')} color={accent}>
      <View style={[styles.exactBadge, { borderColor: accent + '66', backgroundColor: accent + '14' }]}>
        <Ionicons name="checkmark-circle" size={16} color={accent} />
        <Text style={[styles.exactText, { color: accent }]}>
          {t('speciesDossier.exactEvidence', { species: dossier.scientific })}
        </Text>
      </View>
      <Text style={styles.note}>{t('speciesDossier.evidenceNote')}</Text>

      <FactSection
        icon="restaurant-outline"
        title={t('speciesDossier.diet')}
        facts={dossier.diet}
        accent={accent}
      />
      <FactSection
        icon="earth-outline"
        title={t('speciesDossier.habitat')}
        facts={dossier.habitat}
        accent={accent}
      />
      <MeasurementSection
        icon="egg-outline"
        title={t('speciesDossier.reproduction')}
        measurements={dossier.reproduction}
        accent={accent}
        language={i18n.language}
        t={t}
      />
      <MeasurementSection
        icon="hourglass-outline"
        title={t('speciesDossier.lifeCycle')}
        measurements={dossier.lifeCycle}
        accent={accent}
        language={i18n.language}
        t={t}
      />

      {conservation ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: colors.warning + '1F' }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.warning} />
            </View>
            <Text style={styles.sectionTitle}>{t('detail.conservationStatus')}</Text>
          </View>
          <Text style={styles.factText}>{conservation}</Text>
        </View>
      ) : null}

      <View style={styles.sources}>
        {dossier.sources.map((source) => {
          const name = SOURCE_NAMES[source.id];
          if (!name) return null;
          const citation = `${name} · ${source.license}`;
          const label = t('detail.speciesCareSource', { citation });
          return (
            <Pressable
              key={source.id}
              style={({ pressed }) => [styles.source, pressed && styles.sourcePressed]}
              onPress={() => Linking.openURL(source.url)}
              accessibilityRole="link"
              accessibilityLabel={label}
            >
              <Ionicons name="open-outline" size={15} color={colors.info} />
              <Text style={styles.sourceText}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  exactBadge: {
    minHeight: 36,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
  },
  exactText: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  note: { ...type.caption, marginTop: space.sm },
  section: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: space.md,
    paddingTop: space.md,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...type.cardTitle },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  factText: { ...type.body, flex: 1 },
  measurementRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  measurementLabel: { ...type.body, flex: 1 },
  measurementValue: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  sources: { gap: 2, marginTop: space.sm },
  source: {
    minHeight: control.minTouch,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
  },
  sourcePressed: { opacity: 0.65 },
  sourceText: { color: colors.info, fontSize: 11.5, lineHeight: 16, textDecorationLine: 'underline' },
});
