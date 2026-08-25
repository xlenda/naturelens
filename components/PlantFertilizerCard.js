import React, { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { getSpeciesCare } from './speciesCare';
import { getGroupTopic } from './groupContent';
import { getGroupFertilizerSchedule } from './scheduleContent';
import { getCareLatitude, subscribeCareRegion } from './careRegion';
import { seasonForMonth } from './CareSchedule';
import { colors, radius, space, type } from './theme';

const BOTANICAL_CATEGORIES = new Set(['plant', 'tree']);
const BOTANICAL_GROUPS = new Set([
  'succulent',
  'tropicalFoliage',
  'fern',
  'fruitVeg',
  'flowering',
  'woody',
  'orchid',
  'herb',
]);
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const FERTILITY_LEVEL_KEY = {
  none: 'detail.levelNone',
  low: 'detail.levelLow',
  medium: 'detail.levelMedium',
  high: 'detail.levelHigh',
};
const DECISION_ROWS = [
  { icon: 'pulse-outline', labelKey: 'growthStress', valueKey: 'growthStressUse' },
  { icon: 'pricetag-outline', labelKey: 'labelHistory', valueKey: 'labelHistoryUse' },
  { icon: 'water-outline', labelKey: 'textureWater', valueKey: 'textureWaterUse' },
  { icon: 'analytics-outline', labelKey: 'soilAnalysis', valueKey: 'soilAnalysisUse' },
  { icon: 'leaf-outline', labelKey: 'plantAnalysis', valueKey: 'plantAnalysisUse' },
];

function LayerHeading({ icon, label, accent }) {
  return (
    <View style={styles.layerHeading}>
      <View style={[styles.layerIcon, { backgroundColor: accent + '1F' }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <Text style={styles.layerTitle}>{label}</Text>
    </View>
  );
}

function SourceLink({ source, accent, t }) {
  if (!source?.url || !source?.label) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.sourceLink, pressed && styles.pressed]}
      onPress={() => Linking.openURL(source.url)}
      accessibilityRole="link"
      accessibilityLabel={t('detail.speciesCareSource', { citation: source.label })}
    >
      <Ionicons name="open-outline" size={15} color={accent} />
      <Text style={[styles.sourceText, { color: accent }]}>
        {t('detail.speciesCareSource', { citation: source.label })}
      </Text>
    </Pressable>
  );
}

function SpeciesLayer({ record, scientific, accent, t }) {
  const levelKey = FERTILITY_LEVEL_KEY[record?.fertility];
  if (!scientific || !levelKey) return null;
  return (
    <View style={styles.layer}>
      <LayerHeading icon="finger-print-outline" label={t('detail.speciesCareSection')} accent={accent} />
      <View style={styles.exactRow}>
        <Text style={styles.exactLabel}>{t('detail.usdaFertility')}</Text>
        <Text style={[styles.exactValue, { color: accent }]}>{t(levelKey)}</Text>
      </View>
      <Text style={styles.scopeNote}>{t('detail.speciesCareNote', { species: scientific })}</Text>
      {!!record.source && (
        <Text style={styles.sourcePlain}>
          {t('detail.speciesCareSource', { citation: record.source })}
        </Text>
      )}
    </View>
  );
}

function GroupLayer({ topic, accent, t }) {
  const advice = (topic?.advice || []).filter((line) => typeof line === 'string' && line.trim());
  const checklist = (topic?.checklist || []).filter((line) => typeof line === 'string' && line.trim());
  if (!topic?.label || (advice.length === 0 && checklist.length === 0)) return null;

  return (
    <View style={styles.layer}>
      <LayerHeading icon="layers-outline" label={topic.label} accent={accent} />
      <Text style={styles.scopeNote}>{t('detail.groupGuideNote', { group: topic.label })}</Text>
      {advice.map((line, index) => (
        <Text key={`advice-${index}`} style={[styles.advice, index > 0 && styles.adviceGap]}>
          {line}
        </Text>
      ))}
      {checklist.length > 0 && (
        <View style={styles.checklist}>
          <Text style={styles.checklistTitle}>{t('detail.checklistLabel')}</Text>
          {checklist.map((line, index) => (
            <View key={`check-${index}`} style={styles.checkRow}>
              <Ionicons name="checkmark-circle" size={17} color={accent} />
              <Text style={styles.checkText}>{line}</Text>
            </View>
          ))}
        </View>
      )}
      {(topic.sources || []).map((source) => (
        <SourceLink key={source.url} source={source} accent={accent} t={t} />
      ))}
    </View>
  );
}

function SeasonLayer({ row, current, groupLabel, accent, t }) {
  if (!row?.activity) return null;
  const values = SEASONS
    .map((season) => ({ season, value: typeof row[season] === 'string' ? row[season].trim() : '' }))
    .filter((item) => item.value);
  if (values.length === 0) return null;

  return (
    <View style={styles.layer}>
      <LayerHeading icon="calendar-outline" label={t('detail.scheduleSection')} accent={accent} />
      <Text style={styles.seasonActivity}>{row.activity}</Text>
      <View style={styles.seasonGrid}>
        {values.map(({ season, value }) => {
          const isCurrent = current === season;
          return (
            <View
              key={season}
              style={[
                styles.seasonTile,
                isCurrent && { borderColor: accent + '88', backgroundColor: accent + '14' },
              ]}
            >
              <Text style={[styles.seasonName, isCurrent && { color: accent }]}>
                {t(`detail.season.${season}`)}
                {isCurrent ? ` · ${t('detail.scheduleNow')}` : ''}
              </Text>
              <Text style={styles.seasonValue}>{value}</Text>
            </View>
          );
        })}
      </View>
      {!!row.note && <Text style={styles.scheduleNote}>{row.note}</Text>}
      <Text style={styles.scopeNote}>
        {groupLabel
          ? t('detail.scheduleGroupNote', { group: groupLabel })
          : t('detail.scheduleGroupNoteShort')}
      </Text>
      {current === null && <Text style={styles.scopeNote}>{t('detail.scheduleNoLocation')}</Text>}
    </View>
  );
}

function DecisionLayer({ accent, t }) {
  return (
    <View style={styles.layer}>
      <LayerHeading icon="checkbox-outline" label={t('detail.checklistLabel')} accent={accent} />
      <View style={styles.decisionList}>
        {DECISION_ROWS.map((row, index) => (
          <View key={row.labelKey} style={[styles.decisionRow, index > 0 && styles.decisionDivider]}>
            <View style={[styles.decisionIcon, { backgroundColor: accent + '14' }]}>
              <Ionicons name={row.icon} size={16} color={accent} />
            </View>
            <View style={styles.decisionCopy}>
              <Text style={styles.decisionLabel}>{t(`fertilizer.${row.labelKey}`)}</Text>
              <Text style={styles.decisionValue}>{t(`fertilizer.${row.valueKey}`)}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={styles.warningText}>{t('fertilizer.plantNoDoseWarning')}</Text>
      </View>
      <View style={styles.cautionBox}>
        <Ionicons name="eye-outline" size={18} color={colors.info} />
        <Text style={styles.cautionText}>{t('fertilizer.diagnosisCaution')}</Text>
      </View>
    </View>
  );
}

export default function PlantFertilizerCard({
  category,
  scientific,
  groupKey,
  entityName,
  defaultExpanded = false,
  accent = colors.accent,
}) {
  const { t, i18n } = useTranslation();
  const [record, setRecord] = useState(null);
  const [topic, setTopic] = useState(undefined);
  const [schedule, setSchedule] = useState(null);
  const [current, setCurrent] = useState(undefined);
  const [expandedOverride, setExpandedOverride] = useState(undefined);
  const botanicalGroup = BOTANICAL_GROUPS.has(groupKey) ? groupKey : null;
  const expanded = expandedOverride ?? defaultExpanded;

  useEffect(() => {
    let alive = true;
    setRecord(null);
    getSpeciesCare(scientific).then((value) => {
      if (alive) setRecord(value);
    });
    return () => { alive = false; };
  }, [scientific]);

  useEffect(() => {
    let alive = true;
    setTopic(undefined);
    setSchedule(null);
    if (!botanicalGroup) {
      setTopic(null);
      return () => { alive = false; };
    }
    getGroupTopic(botanicalGroup, 'soil', i18n.language).then((value) => {
      if (alive) setTopic(value);
    });
    getGroupFertilizerSchedule(botanicalGroup, i18n.language).then((value) => {
      if (alive) setSchedule(value);
    });
    return () => { alive = false; };
  }, [botanicalGroup, i18n.language]);

  useEffect(() => {
    let alive = true;
    const resolve = () => getCareLatitude().then((latitude) => {
      if (alive) setCurrent(seasonForMonth(new Date().getMonth(), latitude));
    });
    resolve();
    const unsubscribe = subscribeCareRegion(resolve);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!BOTANICAL_CATEGORIES.has(category)) return null;

  return (
    <SectionCard icon="flask-outline" title={t('fertilizer.botanicalTitle')} color={accent}>
      {!!entityName && (
        <Text style={styles.entityScope}>{t('common.identified')}: {entityName}</Text>
      )}
      <Text style={styles.intro}>{t('fertilizer.botanicalIntro')}</Text>
      {expanded ? (
        <>
          <SpeciesLayer record={record} scientific={scientific} accent={accent} t={t} />
          <GroupLayer topic={topic} accent={accent} t={t} />
          {!botanicalGroup ? (
            <View style={styles.unknownBox}>
              <Ionicons name="help-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.unknownText}>{t('fertilizer.unknownGroupNote')}</Text>
            </View>
          ) : null}
          <SeasonLayer
            row={schedule}
            current={current}
            groupLabel={topic?.label || null}
            accent={accent}
            t={t}
          />
          <DecisionLayer accent={accent} t={t} />
        </>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        onPress={() => setExpandedOverride(!expanded)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t(expanded ? 'common.readLess' : 'common.readMore')}
      >
        <Text style={[styles.toggleText, { color: accent }]}>
          {t(expanded ? 'common.readLess' : 'common.readMore')}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={accent} />
      </Pressable>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  entityScope: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '800',
    marginBottom: 5,
  },
  intro: { ...type.body, color: colors.textSecondary },
  toggle: {
    minHeight: 44,
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  toggleText: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  layer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.md,
    marginTop: space.md,
  },
  layerHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  layerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerTitle: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  exactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: space.sm,
  },
  exactLabel: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  exactValue: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  scopeNote: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
    fontStyle: 'italic',
    marginTop: 8,
  },
  sourcePlain: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 5 },
  advice: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
  adviceGap: { marginTop: 9 },
  checklist: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: space.sm,
    marginTop: space.sm,
  },
  checklistTitle: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginBottom: 7,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 5 },
  checkText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 9,
  },
  sourceText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  seasonActivity: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900', marginBottom: 8 },
  seasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seasonTile: {
    width: '48.5%',
    minHeight: 78,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: 9,
  },
  seasonName: {
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  seasonValue: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  scheduleNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 9 },
  decisionList: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  decisionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: space.sm },
  decisionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  decisionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionCopy: { flex: 1 },
  decisionLabel: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  decisionValue: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  unknownBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.warning + '55',
    borderRadius: radius.sm,
    backgroundColor: colors.warning + '10',
    padding: space.sm,
    marginTop: space.md,
  },
  unknownText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.warning + '66',
    borderRadius: radius.sm,
    backgroundColor: colors.warning + '12',
    padding: space.sm,
    marginTop: space.sm,
  },
  warningText: { ...type.body, flex: 1, color: colors.text },
  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.info + '12',
    padding: space.sm,
    marginTop: space.sm,
  },
  cautionText: { ...type.caption, flex: 1, color: colors.textSecondary },
});
