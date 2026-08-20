import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// Auditoria de diagramacao 20/08: o bloco de Fatos Rapidos estava COPIADO em 6
// telas (Plant, Tree, Insect, Mushroom, Bird, Sound), cada copia com o seu
// proprio tamanho de fonte, o seu proprio espacamento e a sua propria ordem -
// e todas com o valor truncado em numberOfLines={2}. Um componente so, com a
// hierarquia certa: o VALOR curto e o heroi do card (grande, branco), o rotulo
// e o recibo embaixo (pequeno, cinza).
//
// Regra de honestidade (a mesma do shortFact.js): o card so entra na grade se
// tiver `value`. Sem nenhum card, a grade inteira - titulo incluido - nao
// renderiza. Nunca um card vazio, nunca um titulo orfao.
//
// facts: [{ key, icon, color, label, value, onPress }] - itens falsy ou sem
// value sao descartados aqui, entao a tela pode montar a lista direto sem
// filtrar antes. `label` e opcional (o card de comestibilidade do cogumelo
// nao tem um). `accent` e a cor de fallback do icone.
export default function QuickFactGrid({ facts, accent }) {
  const { t } = useTranslation();
  const visible = (facts || []).filter((f) => f && f.value);
  if (visible.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        {t('detail.quickFacts')}
      </Text>
      <View style={styles.grid}>
        {visible.map((f) => {
          const color = f.color || accent || colors.accent;
          return (
            <TouchableOpacity
              key={f.key}
              style={styles.card}
              onPress={f.onPress}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={f.label ? f.label + ': ' + f.value : f.value}
            >
              <View style={[styles.icon, { backgroundColor: color + '22' }]}>
                <Ionicons
                  name={f.icon}
                  size={15}
                  color={color}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
              <View style={styles.text}>
                <Text style={styles.value} numberOfLines={1}>
                  {f.value}
                </Text>
                {!!f.label && (
                  <Text style={styles.label} numberOfLines={1}>
                    {f.label}
                  </Text>
                )}
              </View>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.textMuted}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 20, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexBasis: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  // O valor manda: 15.5/700 em branco. O rotulo e recibo: 12/500 em cinza.
  value: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  label: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: 1 },
});
