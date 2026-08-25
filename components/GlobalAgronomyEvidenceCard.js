import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import TopicNavigatorCard from './TopicNavigatorCard';
import { colors, control, radius, space, type } from './theme';

function translated(t, key, fallback, values = {}) {
  return t(key, { ...values, defaultValue: fallback });
}

export default function GlobalAgronomyEvidenceCard({
  topics = [],
  scientific,
  source,
  onOpenTopic,
  onOpenSource,
}) {
  const { t } = useTranslation();
  if (!Array.isArray(topics) || topics.length === 0) return null;

  const topicCount = translated(
    t,
    'agronomyWorkspace.globalEvidence.topicCount',
    '{{count}} seções verificadas',
    { count: topics.length }
  );

  return (
    <View>
      <View style={styles.hero}>
        <View style={styles.header}>
          <View style={styles.globe}>
            <Ionicons name="earth-outline" size={23} color={colors.accentLight} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.kicker}>
              {translated(t, 'agronomyWorkspace.globalEvidence.kicker', 'CAMADA MUNDIAL')}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              {translated(
                t,
                'agronomyWorkspace.globalEvidence.title',
                'O que fontes globais documentam'
              )}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{topicCount}</Text>
          </View>
        </View>

        <Text style={styles.body}>
          {translated(
            t,
            'agronomyWorkspace.globalEvidence.body',
            'Conteúdo encontrado para {{scientific}}, ligado à espécie exata e à fonte original.',
            { scientific }
          )}
        </Text>

        <View style={styles.proofRail} accessible>
          <View style={styles.proofItem}>
            <Ionicons name="finger-print-outline" size={16} color={colors.accentLight} />
            <Text style={styles.proofText}>
              {translated(t, 'agronomyWorkspace.globalEvidence.exactSpecies', 'Espécie exata')}
            </Text>
          </View>
          <View style={styles.proofDivider} />
          <View style={styles.proofItem}>
            <Ionicons name="library-outline" size={16} color={colors.info} />
            <Text style={styles.proofText}>
              {translated(t, 'agronomyWorkspace.globalEvidence.traceableSource', 'Fonte rastreável')}
            </Text>
          </View>
          <View style={styles.proofDivider} />
          <View style={styles.proofItem}>
            <Ionicons name="globe-outline" size={16} color={colors.warning} />
            <Text style={styles.proofText}>
              {translated(t, 'agronomyWorkspace.globalEvidence.worldScope', 'Escala mundial')}
            </Text>
          </View>
        </View>

        <View style={styles.warning}>
          <Ionicons name="navigate-circle-outline" size={21} color={colors.warning} />
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>
              {translated(
                t,
                'agronomyWorkspace.globalEvidence.warningTitle',
                'Não é uma recomendação local'
              )}
            </Text>
            <Text style={styles.warningBody}>
              {translated(
                t,
                'agronomyWorkspace.globalEvidence.warningBody',
                'Esta evidência descreve a espécie. Ela não libera dose, receita de adubação nem tabela regional.'
              )}
            </Text>
          </View>
        </View>

        {source && typeof onOpenSource === 'function' ? (
          <Pressable
            style={({ pressed }) => [styles.source, pressed ? styles.sourcePressed : null]}
            onPress={() => onOpenSource(source.url)}
            accessibilityRole="link"
            accessibilityLabel={translated(
              t,
              'agronomyWorkspace.globalEvidence.openSource',
              'Abrir fonte mundial na Wikipédia'
            ) + `. ${source.license}`}
          >
            <Ionicons name="open-outline" size={17} color={colors.info} />
            <View style={styles.sourceCopy}>
              <Text style={styles.sourceTitle}>Wikipedia</Text>
              <Text style={styles.sourceLicense}>{source.license}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <TopicNavigatorCard
        topics={topics}
        accent={colors.accent}
        onOpen={onOpenTopic}
        title={translated(
          t,
          'agronomyWorkspace.globalEvidence.topicsTitle',
          'Dossiê mundial da espécie'
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    gap: space.sm,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.accent + '66',
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  globe: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.accent + '22',
  },
  headingCopy: { flex: 1 },
  kicker: {
    color: colors.accentLight,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: { ...type.cardTitle, marginTop: space.xxs },
  countBadge: {
    maxWidth: 84,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceElevated,
  },
  countText: { ...type.caption, color: colors.textSecondary, textAlign: 'center', fontWeight: '800' },
  body: { ...type.body, color: colors.textSecondary },
  proofRail: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  proofItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  proofDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  proofText: { color: colors.textSecondary, fontSize: 10.5, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.warning + '12',
  },
  warningCopy: { flex: 1 },
  warningTitle: { ...type.cardTitle, color: colors.warning },
  warningBody: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  source: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.info + '44',
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.info + '0D',
  },
  sourcePressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  sourceCopy: { flex: 1 },
  sourceTitle: { color: colors.info, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  sourceLicense: { ...type.caption, marginTop: 1 },
});
