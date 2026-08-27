import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';

// Temporary fail-closed surface while native store billing is not connected.
// It contains no price, plan, payment URL or purchase verb that could imply a
// transaction exists. The real paywall must render products supplied by the
// device store, never hardcoded values.
export default function PaywallModal({ visible, title, body, onCancel }) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.title}>{title || t('paywall.title')}</Text>
        {!!body && <Text style={styles.body}>{body}</Text>}
        <Text style={styles.notice}>{t('paywall.notAvailableYet')}</Text>
        <Pressable
          style={styles.closeBtn}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Text style={styles.closeText}>{t('common.close')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center',
    justifyContent: 'center', padding: 24, zIndex: 1000,
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: colors.card,
    borderRadius: 20, padding: 24, borderWidth: 1,
    borderColor: colors.border, ...shadow,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', marginBottom: 16 },
  notice: { color: colors.warning, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 16 },
  closeBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.text, fontWeight: '700', fontSize: 14 },
});
