import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';

// The membership CARD - the competitor's single most differentiated settings
// device: a gold credit-card-styled object ("PictureThis Pro, NO. …,
// Expires on: …") that turns a subscription row into something OWNED.
// Ours is honest end to end: every line is real server data - the linked
// email and the actual end of the paid period (currentPeriodEnd) - no fake
// serial numbers.
//
// Renders nothing unless the subscription is definitively active, so it can
// be dropped into any screen without its own status logic.
function formatDate(iso, language) {
  try {
    return new Date(iso).toLocaleDateString(language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch (e) {
    return '';
  }
}

export default function MemberCard({ status, email, periodEnd, onPress }) {
  const { t, i18n } = useTranslation();
  if (status !== 'active') return null;

  const until = periodEnd ? formatDate(periodEnd, i18n.language) : null;

  const Card = (
    <LinearGradient
      colors={['#20402E', '#2E5B41', '#1A3325']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Watermark leaf, oversized and translucent - the "embossed art"
          corner of the competitor's card, from the app's own icon glyph. */}
      <Ionicons name="leaf" size={130} color={colors.warning + '26'} style={styles.watermark} />

      <View style={styles.topRow}>
        <Text style={styles.brand}>NatureLens</Text>
        <View style={styles.premiumPill}>
          <Ionicons name="sparkles" size={11} color="#0E1512" />
          <Text style={styles.premiumPillText}>{t('paywall.subscribed')}</Text>
        </View>
      </View>

      {!!email && (
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
      )}

      {!!until && <Text style={styles.until}>{t('settings.validUntil', { date: until })}</Text>}
    </LinearGradient>
  );

  if (!onPress) return <View style={styles.wrap}>{Card}</View>;
  return (
    <TouchableOpacity
      style={styles.wrap}
      activeOpacity={0.88}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('subscription.title')}
    >
      {Card}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { ...shadow },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.warning + '55',
    padding: 20,
    minHeight: 130,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  watermark: { position: 'absolute', right: -22, bottom: -30 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.warning, fontSize: 19, fontWeight: '800', letterSpacing: 0.4 },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warning,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  premiumPillText: { color: '#0E1512', fontSize: 11, fontWeight: '800' },
  email: { color: colors.text, fontSize: 13.5, fontWeight: '600', marginTop: 18 },
  until: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
