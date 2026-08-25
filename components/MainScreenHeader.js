import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, type } from './theme';

// Cabecalho das telas-raiz. O titulo pode crescer em idiomas longos, enquanto
// as acoes continuam no proprio fluxo e nunca cobrem o texto.
export default function MainScreenHeader({ title, subtitle, leading, right, style }) {
  return (
    <View style={[styles.header, style]}>
      {!!leading && <View style={styles.leading}>{leading}</View>}
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {!!right && <View style={styles.actions}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: space.lg,
  },
  leading: { marginRight: space.sm },
  copy: { flex: 1, minWidth: 0, paddingTop: 2 },
  title: { ...type.screenTitle },
  subtitle: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: space.xxs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginLeft: space.sm,
  },
});
