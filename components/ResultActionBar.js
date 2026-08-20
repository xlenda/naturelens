import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// The competitor's fixed bottom action bar on the result: New (retake) |
// Share | the dominant green Save pill - conversion one tap away at any
// scroll position, replacing the single-purpose SaveFab on detail screens.
//
// Same layout law as the FABs: absolute WITHIN the screen (never over the
// dock), and the host screen adds bottom padding to its scroll content.
export default function ResultActionBar({ onNew, onShare, onSave, saved, accent = colors.accent }) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      {!!onNew && (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onNew}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('detail.actionNew')}
        >
          <Ionicons name="camera-outline" size={19} color={colors.text} />
          <Text style={styles.secondaryText}>{t('detail.actionNew')}</Text>
        </TouchableOpacity>
      )}
      {!!onShare && (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onShare}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('common.shareThisResult')}
        >
          <Ionicons name="share-social-outline" size={19} color={colors.text} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.primary, { backgroundColor: accent }, saved && styles.primarySaved]}
        onPress={onSave}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
      >
        <Ionicons name={saved ? 'checkmark' : 'bookmark'} size={17} color={colors.white} />
        <Text style={styles.primaryText} numberOfLines={1}>
          {saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors.background + 'F2',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 46,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    height: 46,
  },
  primarySaved: { opacity: 0.85 },
  primaryText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
