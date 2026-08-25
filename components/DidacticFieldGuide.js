import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { didacticVisualFor } from './didacticVisuals';
import { colors, control, radius, space, type } from './theme';

const LEVELS = Object.freeze([
  Object.freeze({ key: 'basic', icon: 'eye-outline', label: 'learning.basic' }),
  Object.freeze({ key: 'learn', icon: 'school-outline', label: 'learning.learn' }),
  Object.freeze({ key: 'technical', icon: 'analytics-outline', label: 'learning.technical' }),
]);

const textValue = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function percentFromProbability(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : null;
}

function EvidenceRow({ icon, label, value, accent }) {
  if (!value) return null;
  return (
    <View style={styles.evidenceRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.evidenceIcon, { backgroundColor: accent + '1F' }]}>
        <Ionicons name={icon} size={15} color={accent} />
      </View>
      <Text style={styles.evidenceLabel}>{label}</Text>
      <Text style={styles.evidenceValue}>{value}</Text>
    </View>
  );
}

// O modulo ensina a LER a evidencia que ja existe. Ele nao cria anatomia da
// especie, diagnostico, habitat ou manejo. A arte e sempre marcada como geral;
// seguranca permanece fora deste seletor e continua aberta na tela principal.
export default function DidacticFieldGuide({ category, entity, accent = colors.accent }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState('basic');
  const [openPart, setOpenPart] = useState(null);
  const visual = didacticVisualFor(category, entity);

  useEffect(() => {
    setOpenPart(null);
  }, [visual]);

  const evidence = useMemo(() => {
    if (!entity) return [];
    return [
      {
        key: 'categoryMatch',
        icon: 'scan-outline',
        label: t('learning.categoryMatch'),
        value: percentFromProbability(entity.subjectProbability)
          || (Number.isFinite(entity.detectionScore) ? `${entity.detectionScore}%` : null),
      },
      {
        key: 'confidence',
        icon: 'analytics-outline',
        label: t('common.confidence'),
        value: Number.isFinite(entity.confidence) ? `${entity.confidence}%` : null,
      },
      {
        key: 'order',
        icon: 'git-network-outline',
        label: t('detail.order'),
        value: textValue(entity.ord),
      },
      {
        key: 'family',
        icon: 'layers-outline',
        label: t('detail.family'),
        value: textValue(entity.family),
      },
      {
        key: 'species',
        icon: 'finger-print-outline',
        label: t('detail.species'),
        value: textValue(entity.scientific),
      },
      {
        key: 'provider',
        icon: 'server-outline',
        label: t('learning.provider'),
        value: textValue(entity.sourceProvider),
      },
    ].filter((row) => row.value);
  }, [entity, t]);

  if (!visual || !entity) return null;

  const categoryLabel = t(`categories.${category}.label`);
  const scanHint = t(`categories.${category}.scanHint`, { defaultValue: '' });

  return (
    <SectionCard icon="school-outline" title={t('learning.title')} color={accent}>
      <View style={styles.levels} accessibilityRole="tablist">
        {LEVELS.map((item) => {
          const selected = item.key === level;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.level,
                selected && { borderColor: accent + '88', backgroundColor: accent + '1F' },
              ]}
              onPress={() => setLevel(item.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(item.label)}
            >
              <Ionicons name={item.icon} size={17} color={selected ? accent : colors.textMuted} />
              <Text style={[styles.levelText, selected && { color: accent }]} numberOfLines={2}>
                {t(item.label)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {level === 'basic' && (
        <View>
          <LinearGradient
            colors={[accent + '20', colors.surface]}
            style={styles.illustrationFrame}
          >
            <Image
              source={visual.image}
              style={styles.illustration}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={t('learning.illustrationAlt', { category: categoryLabel })}
            />
            <View style={[styles.scopeBadge, { borderColor: accent + '66' }]}>
              <Ionicons name="information-circle-outline" size={13} color={accent} />
              <Text style={[styles.scopeBadgeText, { color: accent }]}>
                {t('learning.generalDiagram')}
              </Text>
            </View>
          </LinearGradient>
          <Text style={styles.note}>{t('learning.generalNote')}</Text>
          <View style={styles.partGrid}>
            {visual.parts.map(([icon, key]) => (
              <View key={key} style={styles.partChip}>
                <Ionicons name={icon} size={15} color={accent} />
                <Text style={styles.partText}>{t(key)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {level === 'learn' && (
        <View>
          <Text style={styles.modeTitle}>{t('learning.observeTitle')}</Text>
          <Text style={styles.note}>{t('learning.observeHint')}</Text>
          <View style={styles.steps}>
            {visual.parts.map(([icon, key], index) => {
              const expanded = openPart === key;
              const detail = scanHint || t('learning.observeHint');
              return (
                <View key={key} style={styles.stepBlock}>
                  <TouchableOpacity
                    style={[
                      styles.step,
                      expanded && { borderColor: accent + '88', backgroundColor: accent + '14' },
                    ]}
                    onPress={() => setOpenPart(expanded ? null : key)}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${index + 1}. ${t(key)}`}
                    accessibilityHint={detail}
                  >
                    <View style={[styles.stepNumber, { backgroundColor: accent + '22' }]}>
                      <Text style={[styles.stepNumberText, { color: accent }]}>{index + 1}</Text>
                    </View>
                    <Ionicons name={icon} size={17} color={accent} />
                    <Text style={[styles.stepText, expanded && { color: colors.text }]}>{t(key)}</Text>
                    <Ionicons
                      name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                      size={17}
                      color={expanded ? accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                  {expanded && (
                    <View
                      style={[styles.stepDetail, { borderColor: accent + '55' }]}
                      accessible
                      accessibilityLabel={detail}
                    >
                      <Ionicons name="camera-outline" size={16} color={accent} />
                      <Text style={styles.stepDetailText}>{detail}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {level === 'technical' && (
        <View>
          <Text style={styles.modeTitle}>{t('learning.evidenceTitle')}</Text>
          <Text style={styles.note}>{t('learning.technicalNote')}</Text>
          {evidence.map((row) => (
            <EvidenceRow key={row.key} {...row} accent={accent} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  levels: { flexDirection: 'row', gap: space.xs, marginBottom: space.md },
  level: {
    flex: 1,
    minHeight: control.minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  levelText: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 3,
  },
  illustrationFrame: {
    minHeight: 208,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  illustration: { width: '88%', height: 178 },
  scopeBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.background + 'E8',
    paddingHorizontal: 9,
  },
  scopeBadgeText: { fontSize: 11.5, fontWeight: '800' },
  note: { ...type.caption, marginTop: space.sm },
  partGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  partChip: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
  },
  partText: { flex: 1, color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  modeTitle: { ...type.cardTitle },
  steps: { gap: space.xs, marginTop: space.md },
  stepBlock: { overflow: 'hidden', borderRadius: radius.sm },
  step: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
  },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: 12, fontWeight: '900' },
  stepText: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  stepDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderLeftWidth: 2,
    marginHorizontal: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  stepDetailText: { ...type.caption, flex: 1, color: colors.textSecondary },
  evidenceRow: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  evidenceIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceLabel: { flex: 1, color: colors.textMuted, fontSize: 12.5, lineHeight: 17 },
  evidenceValue: {
    maxWidth: '48%',
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
});
