import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import SectionCard from './SectionCard';
import { getCareProfile } from './careDifficulty';
import { WATER_INTERVAL_DAYS } from './watering';
import shortFact, { isNonToxic } from './shortFact';

// Paridade 120% (video do concorrente, 20/08): o card "Facil / Resistencia Alta
// / Manutencao Baixa" que o dono apontou, com o mesmo formato (nivel grande no
// meio, duas metricas nas laterais, chips de beneficio embaixo) e sem nenhuma
// das tres afirmacoes inventadas.
//
// DE ONDE VEM CADA NUMERO:
//   centro   -> GRUPO (components/careDifficulty.js, tabela com a frase do
//               dossie que justifica cada linha).
//   esquerda -> ESPECIE, dado real: o intervalo de WATER_INTERVAL_DAYS quando o
//               campo `watering` da Kindwise e um dos tres valores limpos, e o
//               rotulo curto do shortFact quando o vendor manda faixa composta
//               ("Low ... to Medium").
//   direita  -> GRUPO, a escala de manutencao (recorrencia do manejo), que e
//               separada da de dificuldade porque o dossie de lenhosas prova
//               que as duas divergem.
//   chips    -> so quando o texto AFIRMA o beneficio. "Seguro para pets" sai da
//               regra de negacao que ja existe no shortFact.js (isNonToxic), e
//               nao de "nao achei a palavra toxico".
//
// Sem grupo reconhecido, nada renderiza - o resto da tela continua inteiro. O
// concorrente carimba "Facil" em tudo; aqui, sem base, o card some.

const LEVEL_KEY = { 1: 'detail.careEasy', 2: 'detail.careModerate', 3: 'detail.careDemanding' };
const LEVEL_COLOR = { 1: colors.success, 2: colors.warning, 3: colors.error };
const MAINT_KEY = { 1: 'detail.maintenanceLow', 2: 'detail.maintenanceMedium', 3: 'detail.maintenanceHigh' };

function Metric({ icon, color, value, label }) {
  return (
    <View style={styles.metric}>
      <Ionicons
        name={icon}
        size={16}
        color={color}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Chip({ icon, label, color }) {
  return (
    <View style={[styles.chip, { borderColor: color + '55', backgroundColor: color + '1A' }]}>
      <Ionicons
        name={icon}
        size={12}
        color={color}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export default function CareProfile({ groupKey, plant, accent }) {
  const { t } = useTranslation();
  const profile = getCareProfile(groupKey);
  if (!profile || !plant) return null;

  // Rega: numero real primeiro, rotulo curto como segunda opcao. Faixa composta
  // do vendor nao tem intervalo - mostra o nivel, nunca uma media inventada.
  const rawWater = plant.waterLabel || plant.water;
  const wateringValue = WATER_INTERVAL_DAYS[plant.water]
    ? t('detail.everyNDays', { count: WATER_INTERVAL_DAYS[plant.water] })
    : shortFact('water', rawWater, t);

  const chips = [
    // Afirmativo: o texto de toxicidade DIZ que nao e toxica.
    isNonToxic(plant.toxicity) && {
      key: 'petSafe',
      icon: 'paw-outline',
      color: colors.success,
      label: t('detail.chipPetSafe'),
    },
    // A Kindwise so devolve edible_parts quando ha parte comestivel conhecida.
    // O rotulo e o mesmo da secao que ja existe - o chip aponta pro dado, nao
    // faz promessa nova (a doutrina de comestibilidade mora no manual).
    !!(Array.isArray(plant.edibleParts) ? plant.edibleParts.length : plant.edibleParts) && {
      key: 'edible',
      icon: 'restaurant-outline',
      color: colors.warning,
      label: t('detail.edibleParts'),
    },
  ].filter(Boolean);

  const levelColor = LEVEL_COLOR[profile.level];

  return (
    <SectionCard
      icon="speedometer-outline"
      title={t('detail.careProfileTitle')}
      color={accent || colors.accent}
    >
      <View style={styles.row}>
        {!!wateringValue && (
          <Metric
            icon="water-outline"
            color={colors.info}
            value={wateringValue}
            label={t('detail.wateringSection')}
          />
        )}

        {/* Heroi do card: o nivel, grande e centralizado. */}
        <View
          style={styles.level}
          accessibilityRole="text"
          accessibilityLabel={t('detail.careLevelLabel') + ': ' + t(LEVEL_KEY[profile.level])}
        >
          <Text style={[styles.levelValue, { color: levelColor }]} numberOfLines={2}>
            {t(LEVEL_KEY[profile.level])}
          </Text>
          <Text style={styles.levelLabel} numberOfLines={1}>{t('detail.careLevelLabel')}</Text>
        </View>

        <Metric
          icon="construct-outline"
          color={colors.purple}
          value={t(MAINT_KEY[profile.maintenance])}
          label={t('detail.maintenanceLabel')}
        />
      </View>

      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((c) => (
            <Chip key={c.key} icon={c.icon} label={c.label} color={c.color} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // O centro pesa mais que as laterais - e ele que o olho tem que pegar
  // primeiro, como no card do concorrente.
  level: { flex: 1.3, alignItems: 'center', paddingHorizontal: 4 },
  levelValue: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  levelLabel: { fontSize: 11, color: colors.textMuted, marginTop: 3, textAlign: 'center' },
  metric: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  metricValue: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginTop: 5, textAlign: 'center' },
  metricLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
});
