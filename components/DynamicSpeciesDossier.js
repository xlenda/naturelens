import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_BASE } from './apiBase';
import { enrichmentTaxon } from './taxonIdentity';
import { insectRedListLabel } from './insectRedList';
import { getSpeciesDossier } from './speciesDossier';
import SectionCard from './SectionCard';
import { colors, control, radius, space, type } from './theme';

const SOURCE_NAMES = Object.freeze({
  worms: 'WoRMS',
  wikidata: 'Wikidata',
  gbif: 'GBIF',
  globi: 'GloBI',
});

function interactionFacts(value) {
  return (value || []).map((fact) => ({ id: fact.id, label: fact.name }));
}

function mergeFacts(...lists) {
  const byLabel = new Map();
  for (const fact of lists.flat()) {
    const key = fact.label.toLocaleLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, fact);
  }
  return [...byLabel.values()];
}

function FactSection({ icon, title, facts, accent }) {
  if (!facts.length) return null;
  return (
    <View style={styles.factSection}>
      <View style={styles.factHeader}>
        <View style={[styles.factIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.factTitle}>{title}</Text>
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
    <View style={styles.factSection}>
      <View style={styles.factHeader}>
        <View style={[styles.factIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.factTitle}>{title}</Text>
      </View>
      {measurements.map((item) => {
        // Intl flexiona a unidade no idioma ativo. Se a engine nao conhecer a
        // unidade, exibe apenas o numero e nunca injeta uma palavra inglesa.
        const value = item.unit === 'count' || !unitFormatters[item.unit]
          ? number.format(item.amount)
          : unitFormatters[item.unit].format(item.amount);
        return (
          <View key={`${item.id}:${item.amount}:${item.unit}`} style={styles.measurementRow}>
            <Text style={styles.measurementLabel}>
              {t(`speciesDossier.measurements.${item.id}`)}
            </Text>
            <Text style={[styles.measurementValue, { color: accent }]}>{value}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function DynamicSpeciesDossier({
  category,
  scientific,
  identityV1,
  dossier: providedDossier,
  accent = colors.accent,
}) {
  const { t, i18n } = useTranslation();
  const [loadedDossier, setLoadedDossier] = useState(null);
  const externallyManaged = providedDossier !== undefined;
  const enrichment = enrichmentTaxon(identityV1, { scientificName: scientific });
  const exactScientific = enrichment?.canonicalName || null;
  const dossier = externallyManaged
    ? (providedDossier?.scientific === exactScientific ? providedDossier : null)
    : loadedDossier;

  useEffect(() => {
    let alive = true;
    setLoadedDossier(null);
    if (externallyManaged || !exactScientific) return () => { alive = false; };

    getSpeciesDossier({
      apiBase: API_BASE,
      category,
      scientific: exactScientific,
      language: i18n.language,
    }).then((value) => {
      if (alive) setLoadedDossier(value);
    });
    return () => { alive = false; };
  }, [category, exactScientific, externallyManaged, i18n.language]);

  const waters = useMemo(() => {
    if (!dossier?.environment) return [];
    return [
      dossier.environment.freshwater && {
        key: 'freshwater',
        icon: 'water-outline',
        label: t('observationWorkspace.contexts.fish.freshwater'),
      },
      dossier.environment.brackish && {
        key: 'brackish',
        icon: 'swap-horizontal-outline',
        label: t('speciesDossier.brackish'),
      },
      dossier.environment.marine && {
        key: 'marine',
        icon: 'fish-outline',
        label: t('observationWorkspace.contexts.fish.marine'),
      },
    ].filter(Boolean);
  }, [dossier, t]);

  const conservation = dossier?.conservation
    ? insectRedListLabel(dossier.conservation, t)
    : null;
  const feedingFacts = useMemo(() => mergeFacts(
    dossier?.diet || [],
    interactionFacts(dossier?.feeding)
  ), [dossier]);
  const plantFacts = useMemo(
    () => interactionFacts(dossier?.plantAssociations),
    [dossier]
  );
  const ecologyFacts = useMemo(() => {
    const alreadyShown = new Set(
      [...feedingFacts, ...plantFacts].map((fact) => fact.label.toLocaleLowerCase())
    );
    return interactionFacts(dossier?.ecologicalRelations)
      .filter((fact) => !alreadyShown.has(fact.label.toLocaleLowerCase()));
  }, [dossier, feedingFacts, plantFacts]);
  const lifeStageFacts = useMemo(
    () => (dossier?.documentedLifeStages || []).map((stage) => ({
      id: stage,
      label: t(`speciesDossier.lifeStages.${stage}`),
    })),
    [dossier, t]
  );

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

      {waters.length > 0 ? (
        <View style={styles.factSection}>
          <Text style={styles.factTitle}>{t('speciesDossier.environment')}</Text>
          <View style={styles.waterGrid}>
            {waters.map((water) => (
              <View key={water.key} style={styles.waterChip}>
                <Ionicons name={water.icon} size={16} color={accent} />
                <Text style={styles.waterText}>{water.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <FactSection
        icon="restaurant-outline"
        title={t('speciesDossier.diet')}
        facts={feedingFacts}
        accent={accent}
      />
      {category === 'insect' ? (
        <FactSection
          icon="leaf-outline"
          title={t('observationWorkspace.contexts.insect.onPlant')}
          facts={plantFacts}
          accent={accent}
        />
      ) : null}
      {category === 'insect' ? (
        <FactSection
          icon="git-compare-outline"
          title={t('detail.ecologicalRoleSection')}
          facts={ecologyFacts}
          accent={accent}
        />
      ) : null}
      {category === 'insect' ? (
        <FactSection
          icon="repeat-outline"
          title={t('speciesDossier.lifeStagesTitle')}
          facts={lifeStageFacts}
          accent={accent}
        />
      ) : null}
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
        <View style={styles.factSection}>
          <View style={styles.factHeader}>
            <View style={[styles.factIcon, { backgroundColor: colors.warning + '1F' }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.warning} />
            </View>
            <Text style={styles.factTitle}>{t('detail.conservationStatus')}</Text>
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
              key={`${source.id}:${source.url}`}
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
  factSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: space.md,
    paddingTop: space.md,
  },
  factHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  factIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  factTitle: { ...type.cardTitle },
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
  waterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  waterChip: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
  },
  waterText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
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
