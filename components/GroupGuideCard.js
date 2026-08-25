import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { getGroups } from './groupContent';
import { canonicalTopicKey } from './topicKey';
import { colors } from './theme';

const META = {
  safety: { icon: 'shield-checkmark-outline', label: 'detail.safetySection', color: colors.warning },
  role: { icon: 'leaf-outline', label: 'detail.ecologicalRoleSection', color: colors.accent },
  watering: { icon: 'water-outline', label: 'detail.wateringSection', color: colors.info },
  soil: { icon: 'layers-outline', label: 'detail.soilSection', color: colors.purple },
  // Nos dossies de fauna e lavoura, `uses` e manejo/interacao, nao uso
  // medicinal da especie. "Fundamentos" e o rotulo neutro ja traduzido.
  uses: { icon: 'compass-outline', label: 'detail.fundamentals', color: colors.info },
};

// Lavoura nao e uma lista de "cuidados". A decisao vem de tres protocolos:
// agua quando existe medida, solo/nutricao e manejo integrado. O mesmo dossie
// alimenta os dois modos, mas a ficha agronomica mostra o primeiro criterio de
// campo antes do toque; fauna e fungos preservam o guia compacto de sempre.
const AGRONOMY_META = {
  watering: META.watering,
  soil: META.soil,
  uses: {
    ...META.uses,
    icon: 'analytics-outline',
    label: 'detail.integratedManagementSection',
    color: colors.warning,
  },
};

const firstUsefulLine = (topic) =>
  [...(topic?.checklist || []), ...(topic?.advice || [])].find(
    (line) => typeof line === 'string' && line.trim()
  ) || null;

export default function GroupGuideCard({
  groupKey,
  entityName,
  topics = [],
  accent = colors.accent,
  onOpen,
  variant = 'guide',
}) {
  const { t, i18n } = useTranslation();
  const [group, setGroup] = useState(null);
  const isAgronomy = variant === 'agronomy';

  useEffect(() => {
    let alive = true;
    setGroup(null);
    if (!groupKey) return () => { alive = false; };
    getGroups(i18n.language).then((all) => {
      if (alive) setGroup(all?.[groupKey] || null);
    });
    return () => { alive = false; };
  }, [groupKey, i18n.language]);

  const entries = useMemo(() => {
    if (!group?.topics) return [];
    const meta = isAgronomy ? AGRONOMY_META : META;
    return Object.keys(meta)
      .filter((key) => {
        const value = group.topics[key];
        return value && ((value.advice || []).length > 0 || (value.checklist || []).length > 0);
      })
      .map((key) => ({
        key,
        ...meta[key],
        preview: firstUsefulLine(group.topics[key]),
      }));
  }, [group, isAgronomy]);

  if (!group?.label || entries.length === 0) return null;

  // Une texto especifico da especie com as abas que existem apenas no dossie
  // do grupo. CareTopics distingue `groupOnly`, portanto nunca apresenta o
  // conselho geral como se tivesse vindo do fornecedor para esta especie.
  const entryTopics = entries.map((entry) => {
    // No painel de lavoura, `uses` significa MIP. Nao o misture com um futuro
    // `commonUses` do fornecedor: uso da especie e protocolo de campo sao
    // dominios diferentes, mesmo que os dois tenham a mesma chave canonica.
    if (isAgronomy) {
      return {
        key: entry.key,
        label: t(entry.label),
        text: null,
        groupOnly: true,
      };
    }
    const exact = topics.find((topic) => topic?.key === entry.key);
    // Overview e habitat consultam o dossie de ecologia quando a pessoa abre
    // essas abas, mas nao devem substituir a porta chamada "Papel ecologico".
    // Sem este filtro, tocar em Papel ecologico abria uma aba chamada Visao
    // geral. Os demais aliases preservam a equivalencia editorial existente.
    const aliased = topics.find(
      (topic) => !['overview', 'habitat'].includes(topic?.key)
        && canonicalTopicKey(topic?.key) === entry.key
    );
    const existing = exact || aliased;
    return existing || {
      key: entry.key,
      label: t(entry.label),
      text: null,
      groupOnly: true,
    };
  });
  const mergedTopics = [
    ...topics,
    ...entryTopics.filter((candidate) => !topics.some((topic) => topic?.key === candidate.key)),
  ];

  if (isAgronomy) {
    return (
      <SectionCard icon="analytics-outline" title={t('detail.agronomySection')} color={accent}>
        <View style={[styles.scopeBadge, { backgroundColor: accent + '18', borderColor: accent + '44' }]}>
          <Ionicons name="layers-outline" size={14} color={accent} />
          <Text style={[styles.scopeLabel, { color: accent }]}>{group.label}</Text>
        </View>
        {!!entityName && (
          <Text style={styles.entityScope}>{t('common.identified')}: {entityName}</Text>
        )}
        <Text style={styles.note}>{t('detail.groupGuideNote', { group: group.label })}</Text>
        <Text style={styles.decisionNote}>{t('detail.agronomyDecisionNote')}</Text>

        <View style={styles.protocols}>
          {entries.map((entry, index) => {
            const topic = entryTopics[index];
            const label = t(entry.label);
            return (
              <TouchableOpacity
                key={entry.key}
                style={[styles.protocol, index > 0 && styles.protocolDivider]}
                onPress={() => onOpen?.(mergedTopics, topic.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${label}. ${t('detail.openFullProtocol')}`}
              >
                <View style={styles.protocolHead}>
                  <View style={[styles.protocolIcon, { backgroundColor: entry.color + '22' }]}>
                    <Ionicons name={entry.icon} size={17} color={entry.color} />
                  </View>
                  <Text style={styles.protocolTitle}>{label}</Text>
                </View>
                {!!entry.preview && <Text style={styles.protocolPreview}>{entry.preview}</Text>}
                <View style={styles.protocolAction}>
                  <Text style={[styles.protocolActionText, { color: accent }]}>
                    {t('detail.openFullProtocol')}
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color={accent} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard icon="compass-outline" title={group.label} color={accent}>
      {!!entityName && (
        <Text style={styles.entityScope}>{t('common.identified')}: {entityName}</Text>
      )}
      <Text style={styles.note}>{t('detail.groupGuideNote', { group: group.label })}</Text>
      <View style={styles.rows}>
        {entries.map((entry, index) => {
          const topic = entryTopics[index];
          return (
            <TouchableOpacity
              key={entry.key}
              style={styles.row}
              onPress={() => onOpen?.(mergedTopics, topic.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t(entry.label)}
            >
              <View style={[styles.icon, { backgroundColor: entry.color + '22' }]}>
                <Ionicons name={entry.icon} size={16} color={entry.color} />
              </View>
              <Text style={styles.label}>{t(entry.label)}</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  entityScope: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  scopeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    minHeight: 30,
    marginBottom: 9,
  },
  scopeLabel: { fontSize: 12.5, fontWeight: '800' },
  decisionNote: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 4,
  },
  protocols: { marginTop: 4 },
  protocol: { minHeight: 44, paddingVertical: 14 },
  protocolDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  protocolHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  protocolIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protocolTitle: { flex: 1, color: colors.text, fontSize: 14.5, fontWeight: '800' },
  protocolPreview: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 9,
    marginLeft: 42,
  },
  protocolAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 9,
    marginLeft: 42,
  },
  protocolActionText: { fontSize: 12.5, fontWeight: '800' },
  rows: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '700' },
});
