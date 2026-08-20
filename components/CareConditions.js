import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import SectionCard from './SectionCard';
import shortFact from './shortFact';
import { WATER_INTERVAL_DAYS } from './watering';

// "Condicao de Cuidado" - tela principal rica (video do concorrente, 20/08).
//
// O diagnostico do dono: a tela de resultado deles EMPILHA o cuidado na tela
// principal e usa as abas so como aprofundamento; a nossa empurrou tudo pra
// aba e ficou magra. Este e o bloco de LINHAS (nao grade) deles: uma linha por
// condicao - icone colorido, rotulo cinza, valor curto branco, chevron -
// separadas por hairline, e cada linha abre a aba correspondente do manual
// (CareTopics), o mesmo openTopic que a tela ja usa nos Fatos Rapidos.
//
// Nada aqui inventa campo: os valores curtos saem do shortFact (que devolve
// null quando a prosa do vendor nao casa palavra-chave) e do mapa real de
// intervalos de rega. Linha sem dado nao renderiza; sem nenhuma linha o card
// inteiro some (ausencia honesta).

// A primeira frase da prosa de luz - o "embaixo" da linha de Luz. O corte por
// frase e o mesmo do ExpandableText; a truncagem visual fica no
// numberOfLines={1}.
const firstSentence = (text) =>
  typeof text === 'string' && text.trim() ? text.trim().split(/(?<=[.!?])\s+/)[0] : null;

export default function CareConditions({ plant, onOpenTopic }) {
  const { t } = useTranslation();
  const days = WATER_INTERVAL_DAYS[plant.water];

  const rows = [
    {
      key: 'light',
      icon: 'sunny-outline',
      color: colors.warning,
      label: t('detail.lightSection'),
      value: shortFact('light', plant.bestLightCondition, t),
      sub: firstSentence(plant.bestLightCondition),
    },
    {
      key: 'soil',
      icon: 'layers-outline',
      color: colors.purple,
      label: t('detail.soilSection'),
      value: shortFact('soil', plant.bestSoilType, t),
      sub: null,
    },
    {
      key: 'watering',
      icon: 'water-outline',
      color: colors.info,
      label: t('detail.wateringGuideSection'),
      value: shortFact('water', plant.waterLabel || plant.water, t),
      // Intervalo REAL (WATER_INTERVAL_DAYS), nunca um numero estimado: o
      // rotulo composto do vendor ('Low (prefers dry soil) to Medium') nao tem
      // entrada no mapa e a linha sai so com o nivel, honestamente.
      sub: days ? t('detail.everyNDays', { count: days }) : null,
    },
  ]
    // Quando so a frase existe (idioma que o shortFact nao cobre), ela vira o
    // valor - a linha nunca sai sem valor, e nunca sai vazia.
    .map((r) => (r.value ? r : { ...r, value: r.sub, sub: null }))
    .filter((r) => r.value);

  if (rows.length === 0) return null;

  return (
    <SectionCard
      icon="options-outline"
      title={t('detail.careConditionSection')}
      color={colors.accent}
    >
      {rows.map((r, i) => (
        <TouchableOpacity
          key={r.key}
          style={[styles.row, i > 0 && styles.divider]}
          activeOpacity={0.8}
          onPress={() => onOpenTopic(r.key)}
          accessibilityRole="button"
          accessibilityLabel={r.label + ': ' + r.value}
        >
          <View style={[styles.icon, { backgroundColor: r.color + '22' }]}>
            <Ionicons
              name={r.icon}
              size={15}
              color={r.color}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {r.label}
          </Text>
          {/* alignItems flex-end (e nao textAlign right) para o arabe: o
              alinhamento relativo espelha sozinho com o dir=rtl do documento. */}
          <View style={styles.valueBox}>
            <Text style={styles.value} numberOfLines={1}>
              {r.value}
            </Text>
            {!!r.sub && (
              <Text style={styles.sub} numberOfLines={1}>
                {r.sub}
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
      ))}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  valueBox: { flex: 1, alignItems: 'flex-end' },
  value: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
