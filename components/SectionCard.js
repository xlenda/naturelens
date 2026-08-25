import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, space, type } from './theme';

export default function SectionCard({ icon, title, color, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={icon}
          size={18}
          color={color || colors.accent}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
        <Text
          style={[styles.title, { color: color || colors.accent }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  title: {
    ...type.cardTitle,
    marginLeft: space.xs,
  },
});
