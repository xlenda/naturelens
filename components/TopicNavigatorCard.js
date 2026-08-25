import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { colors } from './theme';

const META = Object.freeze({
  safety: { icon: 'shield-checkmark-outline', color: colors.warning },
  confusas: { icon: 'eye-outline', color: colors.warning },
  evidence: { icon: 'pulse-outline', color: colors.info },
  overview: { icon: 'document-text-outline', color: colors.info },
  watering: { icon: 'water-outline', color: colors.info },
  light: { icon: 'sunny-outline', color: colors.warning },
  soil: { icon: 'layers-outline', color: colors.purple },
  habitat: { icon: 'earth-outline', color: colors.info },
  role: { icon: 'leaf-outline', color: colors.accent },
  uses: { icon: 'compass-outline', color: colors.info },
  commonUses: { icon: 'construct-outline', color: colors.info },
  cultural: { icon: 'book-outline', color: colors.purple },
  edibleParts: { icon: 'restaurant-outline', color: colors.warning },
  edible: { icon: 'restaurant-outline', color: colors.warning },
  propagation: { icon: 'git-branch-outline', color: colors.accent },
  curiosity: { icon: 'sparkles-outline', color: colors.warning },
  details: { icon: 'finger-print-outline', color: colors.purple },
  diet: { icon: 'restaurant-outline', color: colors.warning },
  environment: { icon: 'water-outline', color: colors.info },
  reproduction: { icon: 'egg-outline', color: colors.purple },
  lifeCycle: { icon: 'hourglass-outline', color: colors.info },
  lifeStages: { icon: 'repeat-outline', color: colors.warning },
  plantAssociations: { icon: 'leaf-outline', color: colors.accent },
  conservation: { icon: 'shield-checkmark-outline', color: colors.warning },
  phenology: { icon: 'calendar-outline', color: colors.accent },
  cultivation: { icon: 'analytics-outline', color: colors.accent },
  substrate: { icon: 'layers-outline', color: colors.purple },
  behavior: { icon: 'footsteps-outline', color: colors.info },
  migration: { icon: 'navigate-outline', color: colors.info },
  vocalization: { icon: 'musical-notes-outline', color: colors.purple },
  frequencyTiming: { icon: 'options-outline', color: colors.warning },
});

// Indice honesto do manual: cada linha e uma porta, nunca um "fato rapido"
// com CTA fingindo ser valor. O conteudo continua no CareTopics e a lista so
// mostra topicos que realmente carregam texto.
export default function TopicNavigatorCard({
  topics = [],
  accent = colors.accent,
  onOpen,
  title,
  loading = false,
}) {
  const { t } = useTranslation();
  const visible = topics.filter((topic) => topic?.key && topic?.label
    && (topic.text || topic.groupOnly || topic.stageProfile || topic.orderStageProfile));
  // Uma especie fora do catalogo curado pode ter apenas um bloco verificado.
  // Esconder a porta inteira nesse caso fazia a ficha parecer vazia, apesar de
  // existir conteudo real. Uma unica aba honesta e melhor que nenhuma entrada.
  if ((visible.length === 0 && !loading) || typeof onOpen !== 'function') return null;

  return (
    <SectionCard icon="library-outline" title={title || t('specimen.guideTitle')} color={accent}>
      <View style={styles.rows}>
        {visible.map((topic) => {
          const meta = META[topic.key] || {};
          const color = topic.color || meta.color || accent;
          return (
            <Pressable
              key={topic.key}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onOpen(topic.key)}
              accessibilityRole="button"
              accessibilityLabel={`${topic.label}. ${t('specimen.openGuide')}`}
            >
              <View style={[styles.icon, { backgroundColor: color + '20' }]}>
                <Ionicons name={topic.icon || meta.icon || 'book-outline'} size={17} color={color} />
              </View>
              <Text style={styles.label}>{topic.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          );
        })}
        {loading ? (
          <View style={styles.loadingRow} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={accent} />
            <Text style={styles.loadingLabel}>{t('common.loading')}</Text>
          </View>
        ) : null}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  rowPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  loadingRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
  },
  loadingLabel: { color: colors.textSecondary, fontSize: 13.5, fontWeight: '700' },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
});
