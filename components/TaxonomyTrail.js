import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, space, type } from './theme';

function fieldText(value) {
  const values = Array.isArray(value) ? value : [value];
  const clean = values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

export default function TaxonomyTrail({ order, family, scientific, accent = colors.purple }) {
  const { t } = useTranslation();
  const nodes = [
    { key: 'order', label: t('detail.order'), value: fieldText(order) },
    { key: 'family', label: t('detail.family'), value: fieldText(family) },
    { key: 'species', label: t('detail.species'), value: fieldText(scientific), italic: true },
  ].filter((node) => node.value);

  if (nodes.length < 2) return null;

  return (
    <View style={styles.block} accessible accessibilityLabel={nodes.map((node) => `${node.label}: ${node.value}`).join('. ')}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: accent + '20' }]}>
          <Ionicons name="git-network-outline" size={17} color={accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header">{t('detail.taxonomyTitle')}</Text>
      </View>

      <View style={styles.trail}>
        {nodes.map((node, index) => (
          <View key={node.key} style={styles.nodeRow}>
            <View style={styles.axis}>
              <View style={[styles.dot, { borderColor: accent, backgroundColor: index === nodes.length - 1 ? accent : colors.surface }]} />
              {index < nodes.length - 1 && <View style={[styles.line, { backgroundColor: accent + '66' }]} />}
            </View>
            <View style={[styles.node, index === nodes.length - 1 && { borderColor: accent + '66' }]}>
              <Text style={styles.nodeLabel}>{node.label}</Text>
              <Text style={[styles.nodeValue, node.italic && styles.italic]}>{node.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    marginBottom: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.cardTitle, flex: 1 },
  trail: { paddingTop: space.xs },
  nodeRow: { flexDirection: 'row', alignItems: 'stretch' },
  axis: { width: 28, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 16, zIndex: 1 },
  line: { width: 2, flex: 1, minHeight: 38 },
  node: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: space.xs,
    paddingLeft: space.sm,
  },
  nodeLabel: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '800', textTransform: 'uppercase' },
  nodeValue: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 2 },
  italic: { fontStyle: 'italic', fontWeight: '600' },
});
