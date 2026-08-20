import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { WATER_INTERVAL_DAYS } from './watering';

// "Instrucoes do mes" - tela principal rica (video do concorrente, 20/08).
//
// O dispositivo deles ("Regar em Ago. / A cada 7 dias") e o que faz a tela
// principal parecer um plano e nao uma ficha: o dado ja existia, so nao tinha
// data em cima. O mes vem do relogio do aparelho no idioma do app
// (toLocaleDateString) - nenhum nome de mes hardcoded, nenhuma lista de 12
// meses x 17 idiomas para manter.
//
// SO DADO REAL: rega sai do mapa de intervalos, propagacao sai do campo do
// vendor. Adubacao e poda NAO entram - o vendor nao manda esses campos e um
// card inventado aqui seria mentira com cara de plano. Um item so renderiza um
// card so (flexGrow), nenhum item nao renderiza nada.
export default function MonthInstructions({ plant }) {
  const { t, i18n } = useTranslation();

  let month = null;
  try {
    month = new Date().toLocaleDateString(i18n.language, { month: 'short' });
  } catch (e) {
    // Intl ausente ou locale recusada: sem mes nao ha instrucao do mes.
    month = null;
  }
  if (!month) return null;

  const days = WATER_INTERVAL_DAYS[plant.water];
  const propagation = Array.isArray(plant.propagationMethods)
    ? plant.propagationMethods.join(', ')
    : plant.propagationMethods;

  const items = [
    days && {
      key: 'water',
      icon: 'water-outline',
      color: colors.info,
      label: t('detail.waterInMonth', { month }),
      value: t('detail.everyNDays', { count: days }),
    },
    propagation && {
      key: 'propagation',
      icon: 'flower-outline',
      color: colors.accent,
      label: t('detail.propagateInMonth', { month }),
      value: propagation,
    },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        {t('detail.thisMonth')}
      </Text>
      <View style={styles.grid}>
        {items.map((it) => (
          <View key={it.key} style={styles.card}>
            <View style={[styles.icon, { backgroundColor: it.color + '22' }]}>
              <Ionicons
                name={it.icon}
                size={15}
                color={it.color}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            {/* Mesma hierarquia da grade de Fatos Rapidos: o VALOR e o heroi
                (branco), o rotulo com o mes e o recibo (cinza). */}
            <View style={styles.text}>
              <Text style={styles.value} numberOfLines={1}>
                {it.value}
              </Text>
              <Text style={styles.label} numberOfLines={1}>
                {it.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 18, marginBottom: 4 },
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
  value: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  label: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: 1 },
});
