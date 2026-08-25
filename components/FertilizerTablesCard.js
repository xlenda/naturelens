import React from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { colors, radius, space, type } from './theme';
import {
  FERTILIZER_SOURCES,
  MAIZE_EXTRACTION_ROWS,
  ONION_EXCESS_ROWS,
  getFertilizerProfile,
} from './fertilizerTables';

const PLANNING_ROWS = Object.freeze([
  Object.freeze({ labelKey: 'soilAnalysis', valueKey: 'soilAnalysisUse' }),
  Object.freeze({ labelKey: 'plantAnalysis', valueKey: 'plantAnalysisUse' }),
  Object.freeze({ labelKey: 'targetDestination', valueKey: 'targetDestinationUse' }),
  Object.freeze({ labelKey: 'fieldHistory', valueKey: 'fieldHistoryUse' }),
  Object.freeze({ labelKey: 'textureWater', valueKey: 'textureWaterUse' }),
]);

const NUTRIENT_META = Object.freeze([
  Object.freeze({ key: 'n', label: 'N', color: colors.info }),
  Object.freeze({ key: 'p', label: 'P', color: colors.purple }),
  Object.freeze({ key: 'k', label: 'K', color: colors.warning }),
  Object.freeze({ key: 'ca', label: 'Ca', color: colors.accent }),
  Object.freeze({ key: 'mg', label: 'Mg', color: colors.accentLight }),
]);

const MAIZE_DESTINATIONS = Object.freeze([
  Object.freeze({ key: 'grain', icon: 'ellipse-outline' }),
  Object.freeze({ key: 'silage', icon: 'leaf-outline' }),
]);

function hasCompleteExtractionRow(row) {
  return Boolean(
    row
      && MAIZE_DESTINATIONS.some((destination) => destination.key === row.destination)
      && ['productivity', 'n', 'p', 'k', 'ca', 'mg'].every((key) => Number.isFinite(row[key]))
  );
}

function hasCompleteOnionRow(row) {
  return Boolean(row?.nutrient && row?.effectKey);
}

function SourceLink({ source, accent, t }) {
  if (!source?.url) return null;
  return (
    <TouchableOpacity
      style={styles.sourceLink}
      onPress={() => Linking.openURL(source.url)}
      activeOpacity={0.8}
      accessibilityRole="link"
      accessibilityLabel={t('detail.speciesCareSource', { citation: source.label })}
    >
      <Ionicons name="open-outline" size={15} color={accent} />
      <Text style={[styles.sourceText, { color: accent }]}>
        {t('detail.speciesCareSource', { citation: source.label })}
      </Text>
    </TouchableOpacity>
  );
}

function EntityScope({ name, t }) {
  if (!name) return null;
  return <Text style={styles.entityScope}>{t('common.identified')}: {name}</Text>;
}

function PlanningTable({ t }) {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.headerCell, styles.planLabel]}>{t('fertilizer.input')}</Text>
        <Text style={[styles.headerCell, styles.planValue]}>{t('fertilizer.decisionUse')}</Text>
      </View>
      {PLANNING_ROWS.map((row, index) => (
        <View
          key={row.labelKey}
          style={[styles.row, index > 0 && styles.rowDivider]}
          accessible
          accessibilityLabel={`${t(`fertilizer.${row.labelKey}`)}. ${t(`fertilizer.${row.valueKey}`)}`}
        >
          <Text style={[styles.labelCell, styles.planLabel]}>{t(`fertilizer.${row.labelKey}`)}</Text>
          <Text style={[styles.valueCell, styles.planValue]}>{t(`fertilizer.${row.valueKey}`)}</Text>
        </View>
      ))}
    </View>
  );
}

function NutrientLegend({ t }) {
  return (
    <View
      style={styles.nutrientLegend}
      accessible
      accessibilityLabel={`N, P, K, Ca, Mg. ${t('fertilizer.kgPerHectare')}`}
    >
      <View style={styles.legendCodes}>
        {NUTRIENT_META.map((nutrient) => (
          <View key={nutrient.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: nutrient.color }]} />
            <Text style={[styles.legendCode, { color: nutrient.color }]}>{nutrient.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.legendUnit}>{t('fertilizer.kgPerHectare')}</Text>
    </View>
  );
}

function MaizeExtractionCard({ row, accent, formatter, index, t }) {
  if (!hasCompleteExtractionRow(row)) return null;
  const destination = t(`fertilizer.${row.destination}`);
  const accessibilityLabel = `${destination}, ${formatter.format(row.productivity)} ${t('fertilizer.tonnesPerHectare')}; N ${row.n}, P ${row.p}, K ${row.k}, Ca ${row.ca}, Mg ${row.mg} ${t('fertilizer.kgPerHectare')}`;

  return (
    <View
      style={[styles.extractionCard, index % 2 === 1 && styles.extractionCardAlt]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.extractionHeader}>
        <View style={[styles.productivityIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name="stats-chart-outline" size={17} color={accent} />
        </View>
        <View style={styles.productivityBlock}>
          <Text style={styles.extractionEyebrow}>{t('fertilizer.productivity')}</Text>
          <View style={styles.productivityLine}>
            <Text style={styles.productivityValue}>{formatter.format(row.productivity)}</Text>
            <Text style={styles.productivityUnit}>{t('fertilizer.tonnesPerHectare')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.nutrientGrid}>
        {NUTRIENT_META.map((nutrient, nutrientIndex) => (
          <View
            key={nutrient.key}
            style={[
              styles.nutrientTile,
              nutrientIndex >= 3 && styles.nutrientTileSecondary,
              (nutrientIndex === 0 || nutrientIndex === 1 || nutrientIndex === 3)
                && styles.nutrientDivider,
            ]}
          >
            <View style={[styles.nutrientDot, { backgroundColor: nutrient.color }]} />
            <Text style={[styles.nutrientLabel, { color: nutrient.color }]}>{nutrient.label}</Text>
            <Text style={styles.nutrientValue}>{row[nutrient.key]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MaizeDestinationSection({ destination, accent, formatter, t }) {
  const rows = MAIZE_EXTRACTION_ROWS.filter((row) => row.destination === destination.key);
  if (rows.length === 0) return null;

  return (
    <View style={styles.destinationSection}>
      <View style={[styles.destinationHeader, { borderColor: accent + '55' }]}>
        <View style={[styles.destinationIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={destination.icon} size={19} color={accent} />
        </View>
        <View style={styles.destinationHeading}>
          <Text style={styles.extractionEyebrow}>{t('fertilizer.destination')}</Text>
          <Text style={[styles.destinationTitle, { color: accent }]}>
            {t(`fertilizer.${destination.key}`)}
          </Text>
        </View>
      </View>
      <View style={styles.extractionList}>
        {rows.map((row, index) => (
          <MaizeExtractionCard
            key={`${row.destination}-${row.productivity}`}
            row={row}
            accent={accent}
            formatter={formatter}
            index={index}
            t={t}
          />
        ))}
      </View>
    </View>
  );
}

function MaizeTable({ accent, entityName, i18n, t }) {
  if (
    MAIZE_EXTRACTION_ROWS.length === 0
      || !MAIZE_EXTRACTION_ROWS.every(hasCompleteExtractionRow)
  ) return null;

  const formatter = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <SectionCard icon="stats-chart-outline" title={t('fertilizer.maizeTitle')} color={accent}>
      <EntityScope name={entityName} t={t} />
      <Text style={styles.note}>{t('fertilizer.maizeIntro')}</Text>
      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={styles.warningText}>{t('fertilizer.notDoseWarning')}</Text>
      </View>
      <NutrientLegend t={t} />
      {/* Destino e a unica etapa comparavel documentada nesta fonte. Separar os
          dois caminhos evita sugerir uma fase fenologica que nao foi medida. */}
      <View style={styles.destinationList} accessibilityLabel={t('fertilizer.maizeTitle')}>
        {MAIZE_DESTINATIONS.map((destination) => (
          <MaizeDestinationSection
            key={destination.key}
            destination={destination}
            accent={accent}
            formatter={formatter}
            t={t}
          />
        ))}
      </View>
      <Text style={styles.unitNote}>{t('fertilizer.extractedUnit')}</Text>
      <SourceLink source={FERTILIZER_SOURCES.maize} accent={accent} t={t} />
    </SectionCard>
  );
}

function OnionTable({ accent, entityName, t }) {
  if (ONION_EXCESS_ROWS.length === 0 || !ONION_EXCESS_ROWS.every(hasCompleteOnionRow)) return null;

  return (
    <SectionCard icon="swap-horizontal-outline" title={t('fertilizer.onionTitle')} color={accent}>
      <EntityScope name={entityName} t={t} />
      <Text style={styles.note}>{t('fertilizer.onionIntro')}</Text>
      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={styles.warningText}>{t('fertilizer.notDoseWarning')}</Text>
      </View>
      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.headerCell, styles.onionNutrient]}>{t('fertilizer.excess')}</Text>
          <Text style={[styles.headerCell, styles.onionEffect]}>{t('fertilizer.possibleEffect')}</Text>
        </View>
        {ONION_EXCESS_ROWS.map((row, index) => (
          <View
            key={row.nutrient}
            style={[styles.row, index > 0 && styles.rowDivider]}
            accessible
            accessibilityLabel={`${row.nutrient}. ${t(`fertilizer.${row.effectKey}`)}`}
          >
            <Text style={[styles.nutrientCode, styles.onionNutrient]}>{row.nutrient}</Text>
            <Text style={[styles.valueCell, styles.onionEffect]}>{t(`fertilizer.${row.effectKey}`)}</Text>
          </View>
        ))}
      </View>
      <SourceLink source={FERTILIZER_SOURCES.onion} accent={accent} t={t} />
    </SectionCard>
  );
}

export default function FertilizerTablesCard({
  scientific,
  groupKey,
  entityName,
  accent = colors.accent,
  showPlannerFallback = false,
}) {
  const { t, i18n } = useTranslation();
  const profile = getFertilizerProfile({ scientific, groupKey });
  if (!profile && !showPlannerFallback) return null;

  return (
    <>
      {(!profile || profile.speciesTable === 'maize') && (
        <SectionCard icon="flask-outline" title={t('fertilizer.title')} color={accent}>
          {!profile && <EntityScope name={entityName} t={t} />}
          <Text style={styles.note}>{t('fertilizer.planningNote')}</Text>
          <PlanningTable t={t} />
          <SourceLink source={FERTILIZER_SOURCES.planning} accent={accent} t={t} />
          <View style={styles.cautionBox}>
            <Ionicons name="eye-outline" size={18} color={colors.info} />
            <Text style={styles.cautionText}>{t('fertilizer.diagnosisCaution')}</Text>
          </View>
        </SectionCard>
      )}

      {profile?.speciesTable === 'maize' && (
        <MaizeTable accent={accent} entityName={entityName} i18n={i18n} t={t} />
      )}
      {profile?.speciesTable === 'onion' && (
        <OnionTable accent={accent} entityName={entityName} t={t} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  entityScope: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', marginBottom: 6 },
  note: { ...type.body, marginBottom: space.sm },
  table: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'stretch', minHeight: 52 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  headerRow: { backgroundColor: colors.surfaceElevated, minHeight: 44 },
  headerCell: {
    color: colors.text,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '800',
    paddingHorizontal: 9,
    paddingVertical: 9,
    textAlignVertical: 'center',
  },
  labelCell: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingVertical: 10,
    textAlignVertical: 'center',
  },
  valueCell: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 9,
    paddingVertical: 10,
    textAlignVertical: 'center',
  },
  planLabel: { width: '38%', borderRightWidth: 1, borderRightColor: colors.border },
  planValue: { width: '62%' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.warning + '66',
    backgroundColor: colors.warning + '12',
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.sm,
  },
  warningText: { ...type.body, flex: 1, color: colors.text },
  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: colors.info + '12',
    borderRadius: radius.sm,
    padding: space.sm,
    marginTop: space.sm,
  },
  cautionText: { ...type.caption, flex: 1, color: colors.textSecondary },
  nutrientLegend: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: space.sm,
    paddingVertical: 9,
    marginBottom: space.md,
  },
  legendCodes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendCode: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  legendUnit: {
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 5,
  },
  destinationList: { gap: space.md },
  destinationSection: { gap: space.sm },
  destinationHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingHorizontal: 2,
    paddingBottom: 9,
  },
  destinationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationHeading: { flex: 1 },
  destinationTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 1 },
  extractionList: { gap: space.sm },
  extractionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  extractionCardAlt: { backgroundColor: colors.surfaceElevated },
  extractionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 58,
    paddingHorizontal: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productivityIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productivityBlock: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  productivityLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  extractionEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productivityValue: { color: colors.text, fontSize: 18, lineHeight: 21, fontWeight: '900', marginTop: 1 },
  productivityUnit: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  nutrientGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  nutrientTile: {
    width: '33.333%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
  },
  nutrientTileSecondary: { width: '50%', borderTopWidth: 1, borderTopColor: colors.border },
  nutrientDivider: { borderRightWidth: 1, borderRightColor: colors.border },
  nutrientDot: { width: 5, height: 5, borderRadius: 3, marginBottom: 2 },
  nutrientLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  nutrientValue: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  unitNote: { ...type.caption, marginTop: space.xs },
  onionNutrient: { width: '26%', borderRightWidth: 1, borderRightColor: colors.border },
  onionEffect: { width: '74%' },
  nutrientCode: {
    color: colors.warning,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 12,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
    marginTop: 2,
  },
  sourceText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
});
