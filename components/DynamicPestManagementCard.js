import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_BASE } from './apiBase';
import { enrichmentTaxon } from './taxonIdentity';
import { getIpmDossier, getSupportedIpmCrops } from './ipmDossier';
import SectionCard from './SectionCard';
import { colors, control, radius, space, type } from './theme';

const CROP_KEYS = Object.freeze({
  'Coffea arabica': 'arabicaCoffee',
  'Glycine max': 'soybean',
  'Gossypium hirsutum': 'uplandCotton',
  'Phaseolus vulgaris': 'commonBean',
  'Solanum lycopersicum': 'tomato',
  'Zea mays': 'maize',
});

const SOURCE_NAMES = Object.freeze({
  'embrapa-bean-whitefly': 'Embrapa',
  'embrapa-coffee-berry-borer': 'Embrapa',
  'embrapa-cotton-boll-weevil': 'Embrapa',
  'embrapa-maize': 'Embrapa',
  'embrapa-maize-leafhopper': 'Embrapa',
  'embrapa-tomato': 'Embrapa',
  'embrapa-soy': 'Embrapa',
  'embrapa-soy-looper': 'Embrapa',
  'embrapa-soy-caterpillar': 'Embrapa',
  agrofit: 'MAPA Agrofit',
});

function ActionList({ actions, accent, t }) {
  if (!actions.length) return null;
  return (
    <View style={styles.actionList}>
      {actions.map((action) => (
        <View key={action} style={styles.actionRow}>
          <Ionicons name="checkmark-circle-outline" size={17} color={accent} />
          <Text style={styles.actionText}>{t(`ipm.actions.${action}`)}</Text>
        </View>
      ))}
    </View>
  );
}

function Strategy({ icon, title, actions, accent, t }) {
  if (!actions.length) return null;
  return (
    <View style={styles.strategy}>
      <View style={styles.strategyHeader}>
        <View style={[styles.strategyIcon, { backgroundColor: accent + '1C' }]}>
          <Ionicons name={icon} size={17} color={accent} />
        </View>
        <Text style={styles.strategyTitle}>{title}</Text>
      </View>
      <ActionList actions={actions} accent={accent} t={t} />
    </View>
  );
}

export default function DynamicPestManagementCard({ scientific, identityV1, accent = colors.warning }) {
  const { t, i18n } = useTranslation();
  const [crops, setCrops] = useState(null);
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [dossier, setDossier] = useState(null);
  const enrichment = enrichmentTaxon(identityV1, { scientificName: scientific });
  const exactInsect = enrichment?.canonicalName || null;

  useEffect(() => {
    let alive = true;
    setCrops(null);
    setSelectedCrop(null);
    setDossier(null);
    if (!exactInsect) return () => { alive = false; };
    getSupportedIpmCrops({
      apiBase: API_BASE,
      insectScientific: exactInsect,
      language: i18n.language,
    }).then((value) => {
      if (alive) setCrops(value?.length ? value : null);
    });
    return () => { alive = false; };
  }, [exactInsect, i18n.language]);

  useEffect(() => {
    let alive = true;
    setDossier(null);
    if (!exactInsect || !selectedCrop) return () => { alive = false; };
    getIpmDossier({
      apiBase: API_BASE,
      insectScientific: exactInsect,
      cropScientific: selectedCrop,
      language: i18n.language,
    }).then((value) => {
      if (alive) setDossier(value);
    });
    return () => { alive = false; };
  }, [exactInsect, selectedCrop, i18n.language]);

  const sources = useMemo(() => dossier?.sources || [], [dossier]);
  if (!crops) return null;

  return (
    <SectionCard icon="shield-checkmark-outline" title={t('ipm.title')} color={accent}>
      <Text style={styles.note}>{t('ipm.chooseCrop')}</Text>
      <View style={styles.cropRow}>
        {crops.map((crop) => {
          const selected = crop === selectedCrop;
          const cropKey = CROP_KEYS[crop];
          if (!cropKey) return null;
          return (
            <Pressable
              key={crop}
              onPress={() => setSelectedCrop(crop)}
              style={({ pressed }) => [
                styles.cropButton,
                selected && { borderColor: accent, backgroundColor: accent + '18' },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? accent : colors.textMuted} />
              <View style={styles.cropCopy}>
                <Text style={styles.cropName}>{t(`ipm.crops.${cropKey}`)}</Text>
                <Text style={styles.cropScientific}>{crop}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {dossier && (
        <>
          <View style={[styles.exactBadge, { borderColor: accent + '66', backgroundColor: accent + '12' }]}>
            <Ionicons name="git-compare-outline" size={16} color={accent} />
            <Text style={[styles.exactText, { color: accent }]}>
              {t('ipm.exactPair', {
                insect: dossier.insectScientific,
                crop: dossier.cropScientific,
              })}
            </Text>
          </View>

          <Strategy icon="leaf-outline" title={t('ipm.prevention')} actions={dossier.prevention} accent={accent} t={t} />
          <Strategy icon="scan-outline" title={t('ipm.monitoring')} actions={dossier.monitoring} accent={accent} t={t} />

          {dossier.thresholds.length > 0 && (
            <View style={styles.strategy}>
              <View style={styles.strategyHeader}>
                <View style={[styles.strategyIcon, { backgroundColor: accent + '1C' }]}>
                  <Ionicons name="speedometer-outline" size={17} color={accent} />
                </View>
                <Text style={styles.strategyTitle}>{t('ipm.threshold')}</Text>
              </View>
              {dossier.thresholds.map((threshold) => (
                <Text key={threshold.id} style={styles.thresholdText}>
                  {t(`ipm.thresholds.${threshold.labelKey}`, threshold)}
                </Text>
              ))}
            </View>
          )}

          <Strategy icon="earth-outline" title={t('ipm.cultural')} actions={dossier.controls.cultural} accent={accent} t={t} />
          <Strategy icon="hand-left-outline" title={t('ipm.mechanical')} actions={dossier.controls.mechanical} accent={accent} t={t} />
          <Strategy icon="flower-outline" title={t('ipm.biological')} actions={dossier.controls.biological} accent={accent} t={t} />

          {dossier.chemical && (
            <View style={styles.chemicalBox}>
              <Ionicons name="document-text-outline" size={19} color={accent} />
              <View style={styles.chemicalCopy}>
                <Text style={styles.chemicalTitle}>{t('ipm.chemical')}</Text>
                <Text style={styles.actionText}>{t('ipm.chemicalReferral')}</Text>
              </View>
            </View>
          )}

          <View style={styles.sources}>
            {sources.map((source) => {
              const sourceName = SOURCE_NAMES[source.id];
              if (!sourceName) return null;
              const license = source.license === 'citation-only'
                ? t('ipm.citationOnly')
                : source.license;
              const citation = `${sourceName} · ${license}`;
              return (
                <Pressable
                  key={source.id}
                  onPress={() => Linking.openURL(source.url)}
                  style={({ pressed }) => [styles.source, pressed && styles.pressed]}
                  accessibilityRole="link"
                  accessibilityLabel={t('detail.speciesCareSource', { citation })}
                >
                  <Ionicons name="open-outline" size={15} color={colors.info} />
                  <Text style={styles.sourceText}>{t('detail.speciesCareSource', { citation })}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  note: { ...type.body, marginBottom: space.sm },
  cropRow: { gap: space.xs },
  cropButton: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
    paddingVertical: 9,
  },
  cropCopy: { flex: 1 },
  cropName: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontWeight: '800' },
  cropScientific: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, fontStyle: 'italic' },
  exactBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
    marginTop: space.md,
  },
  exactText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  strategy: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.md, paddingTop: space.md },
  strategyHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: 5 },
  strategyIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  strategyTitle: { ...type.cardTitle },
  actionList: { gap: 7 },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  actionText: { ...type.body, flex: 1 },
  thresholdText: { ...type.body, fontWeight: '700' },
  chemicalBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.warning + '55',
    borderRadius: radius.md,
    backgroundColor: colors.warning + '0F',
    padding: space.sm,
    marginTop: space.md,
  },
  chemicalCopy: { flex: 1 },
  chemicalTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900', marginBottom: 3 },
  sources: { gap: 2, marginTop: space.sm },
  source: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sourceText: { color: colors.info, fontSize: 11.5, lineHeight: 16, textDecorationLine: 'underline', flex: 1 },
  pressed: { opacity: 0.65 },
});
