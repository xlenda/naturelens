import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { colors, radius, space, type } from './theme';
import {
  MAIZE_PEST_ROWS,
  PEST_MANAGEMENT_SOURCES,
  SOY_ACTION_ROWS,
  SOY_SAMPLE_ROWS,
  getPestManagementProfile,
} from './pestManagementTables';

const DECISION_ROWS = Object.freeze([
  Object.freeze({ labelKey: 'identifyDamage', valueKey: 'identifyDamageUse' }),
  Object.freeze({ labelKey: 'samplingPlan', valueKey: 'samplingPlanUse' }),
  Object.freeze({ labelKey: 'countStage', valueKey: 'countStageUse' }),
]);

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

function NumberedProtocolRail({ leftTitle, rightTitle, rows, accessibilityLabel }) {
  return (
    <View style={styles.rail} accessibilityLabel={accessibilityLabel}>
      <View style={styles.railHeader}>
        <Text style={styles.railHeaderText}>{leftTitle}</Text>
        <Ionicons
          name="arrow-forward-outline"
          size={15}
          color={colors.warning}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={[styles.railHeaderText, styles.railHeaderRight]}>{rightTitle}</Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={[styles.railRow, index % 2 === 1 && styles.railRowAlt]}
          accessible
          accessibilityLabel={`${row.label}. ${row.value}`}
        >
          <View
            style={styles.railMarker}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.railNumberCircle}>
              <Text style={styles.railNumber}>{String(index + 1).padStart(2, '0')}</Text>
            </View>
            {index < rows.length - 1 && <View style={styles.railLine} />}
          </View>
          <View style={styles.railContent}>
            <Text style={styles.railLabel}>{row.label}</Text>
            <Text style={styles.railValue}>{row.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MaizeTable({ entityName, t }) {
  const rows = MAIZE_PEST_ROWS.map((row) => ({
    key: row.key,
    label: t(`pestManagement.${row.key}`),
    value: t(`pestManagement.${row.key}Protocol`, row),
  }));
  return (
    <SectionCard icon="bug-outline" title={t('pestManagement.maizeTitle')} color={colors.warning}>
      <EntityScope name={entityName} t={t} />
      <NumberedProtocolRail
        leftTitle={t('pestManagement.target')}
        rightTitle={t('pestManagement.fieldProtocol')}
        rows={rows}
        accessibilityLabel={t('pestManagement.maizeTitle')}
      />
      <Text style={styles.localNote}>{t('pestManagement.maizeThresholdNote')}</Text>
      <SourceLink source={PEST_MANAGEMENT_SOURCES.general} accent={colors.warning} t={t} />
      <SourceLink source={PEST_MANAGEMENT_SOURCES.maizeDamage} accent={colors.warning} t={t} />
    </SectionCard>
  );
}

function SoyTable({ entityName, t }) {
  const sampleRows = SOY_SAMPLE_ROWS.map((row, index) => ({
    key: `area-${index}`,
    label: row.maxAreaHa
      ? t('pestManagement.upToHectares', { count: row.maxAreaHa })
      : t('pestManagement.overHectares', { count: 100 }),
    value: row.minimumPoints
      ? t('pestManagement.samplePoints', { count: row.minimumPoints })
      : t('pestManagement.dividePlots', { count: row.splitAreaHa }),
  }));
  const actionRows = SOY_ACTION_ROWS.map((row) => ({
    key: row.key,
    label: t(`pestManagement.${row.key}`),
    value: t(`pestManagement.${row.key}Level`, row),
  }));

  return (
    <SectionCard icon="grid-outline" title={t('pestManagement.soyTitle')} color={colors.warning}>
      <EntityScope name={entityName} t={t} />
      <Text style={styles.subheading}>{t('pestManagement.soySamplingTitle')}</Text>
      <NumberedProtocolRail
        leftTitle={t('pestManagement.fieldArea')}
        rightTitle={t('pestManagement.minimumSamples')}
        rows={sampleRows}
        accessibilityLabel={t('pestManagement.soySamplingTitle')}
      />

      <Text style={[styles.subheading, styles.secondHeading]}>{t('pestManagement.soyThresholdTitle')}</Text>
      <NumberedProtocolRail
        leftTitle={t('pestManagement.situation')}
        rightTitle={t('pestManagement.actionLevel')}
        rows={actionRows}
        accessibilityLabel={t('pestManagement.soyThresholdTitle')}
      />
      <Text style={styles.localNote}>{t('pestManagement.soyThresholdNote')}</Text>
      <SourceLink source={PEST_MANAGEMENT_SOURCES.soySampling} accent={colors.warning} t={t} />
      <SourceLink source={PEST_MANAGEMENT_SOURCES.soyThresholds} accent={colors.warning} t={t} />
    </SectionCard>
  );
}

export default function PestManagementTablesCard({ scientific, groupKey, entityName }) {
  const { t } = useTranslation();
  const profile = getPestManagementProfile({ scientific, groupKey });
  if (!profile) return null;

  const decisionRows = DECISION_ROWS.map((row) => ({
    key: row.labelKey,
    label: t(`pestManagement.${row.labelKey}`),
    value: t(`pestManagement.${row.valueKey}`),
  }));

  return (
    <>
      <SectionCard icon="scan-outline" title={t('pestManagement.title')} color={colors.warning}>
        <Text style={styles.note}>{t('pestManagement.decisionNote')}</Text>
        <NumberedProtocolRail
          leftTitle={t('pestManagement.whatToCheck')}
          rightTitle={t('pestManagement.fieldDecision')}
          rows={decisionRows}
          accessibilityLabel={t('pestManagement.title')}
        />
        <View style={styles.warningBox}>
          <Ionicons name="hand-left-outline" size={18} color={colors.warning} />
          <Text style={styles.warningText}>{t('pestManagement.noCountWarning')}</Text>
        </View>
        {profile.speciesTable === 'maize' && (
          <SourceLink source={PEST_MANAGEMENT_SOURCES.general} accent={colors.warning} t={t} />
        )}
        <View style={styles.chemicalBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.chemicalTitle}>{t('pestManagement.chemicalSafetyTitle')}</Text>
            <Text style={styles.chemicalText}>{t('disease.chemicalCaution')}</Text>
          </View>
        </View>
        <SourceLink source={PEST_MANAGEMENT_SOURCES.agrofit} accent={colors.warning} t={t} />
      </SectionCard>

      {profile.speciesTable === 'maize' && <MaizeTable entityName={entityName} t={t} />}
      {profile.speciesTable === 'soy' && <SoyTable entityName={entityName} t={t} />}
    </>
  );
}

const styles = StyleSheet.create({
  entityScope: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', marginBottom: 6 },
  note: { ...type.body, marginBottom: space.sm },
  subheading: { ...type.cardTitle, marginBottom: space.xs },
  secondHeading: { marginTop: space.lg },
  rail: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  railHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  railHeaderText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
  },
  railHeaderRight: { textAlign: 'right' },
  railRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  railRowAlt: { backgroundColor: colors.surfaceElevated },
  railMarker: { width: 34, alignItems: 'center', marginRight: 10 },
  railNumberCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.warning + '88',
    backgroundColor: colors.warning + '16',
  },
  railNumber: { color: colors.warning, fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  railLine: { flex: 1, width: 1, marginTop: 3, backgroundColor: colors.warning + '44' },
  railContent: { flex: 1, justifyContent: 'center' },
  railLabel: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  railValue: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.warning + '66',
    backgroundColor: colors.warning + '12',
    borderRadius: radius.sm,
    padding: space.sm,
    marginTop: space.sm,
  },
  warningText: { ...type.body, flex: 1, color: colors.text },
  chemicalBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  chemicalTitle: { ...type.cardTitle, fontSize: 13.5, marginBottom: 4 },
  chemicalText: { ...type.caption, color: colors.textSecondary },
  localNote: { ...type.caption, marginTop: space.sm },
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
