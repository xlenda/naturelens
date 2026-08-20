import React from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// Floating "save to collection" pill for the detail screens - the persistent
// bottom CTA the competitor keeps glued to every tab of its detail view. Here
// it exists because the real Save button lived at the END of a long scroll
// (the little bookmark up top is easy to miss), so the single most important
// action of the result screen was the hardest one to find.
//
// Modeled on SubscribeFab and bound by the same layout law: positioned
// absolute WITHIN the screen (never over the dock, which lives outside it),
// and every screen that renders it must add bottom padding to its scroll
// container - a pill that hides the last row is the viewport bug in
// miniature. Render it only while `!saved`; once saved it disappears and the
// top bookmark takes over as the state indicator.
export default function SaveFab({ onPress, accent = colors.accent, visible = true }) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: accent }]}
        activeOpacity={0.85}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('common.saveToCollection')}
      >
        <Ionicons name="bookmark" size={16} color={colors.white} />
        <Text style={styles.text}>{t('common.saveToCollection')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  text: { color: colors.white, fontWeight: '800', fontSize: 14.5 },
});
