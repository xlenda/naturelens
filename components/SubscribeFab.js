import React, { useState, useCallback } from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getSubscriptionStatus, isCheckoutConfigured } from './subscription';
import { trackPaywallShown } from './tracking';

// Floating subscribe pill, sitting just above the dock on the browse screens.
//
// TWO GATES, both of them refusals to show it - and both are rules this app
// already pays for elsewhere:
//
//  1. Status must be DEFINITIVELY 'not subscribed'. getSubscriptionStatus()
//     returns `undefined` for "don't know" (offline, 429, 5xx) and that is NOT
//     the same as `null`. Showing "Subscribe" to a paying customer whose check
//     just timed out is the exact bug the three-state status exists to prevent,
//     and it would now be doing it in a pill that follows them around.
//  2. Checkout must be configured. A floating button that leads to a paywall
//     saying "not available yet" is a dead end wearing a call to action - the
//     app's own rule is that an honest absence beats a dead button.
//
// Positioned absolute WITHIN the screen (not over the tab bar, which lives
// outside it), so it never covers the dock. Screens that render it must add
// bottom padding to their scroll container - a pill that hides the last row of
// a list is the same viewport bug in miniature.
export default function SubscribeFab() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [status, setStatus] = useState(undefined);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getSubscriptionStatus().then((s) => {
        if (alive) setStatus(s);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  // `undefined` (unknown) falls through here as well as 'active' - only a
  // confirmed non-subscriber sees the pill.
  if (status !== null || !isCheckoutConfigured()) return null;

  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackPaywallShown({ trigger: 'floating_cta' });
    navigation.navigate('Profile', { screen: 'Subscription' });
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.pill}
        activeOpacity={0.85}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={t('paywall.subscribe')}
      >
        <Ionicons name="sparkles" size={16} color={colors.white} />
        <Text style={styles.text}>{t('paywall.subscribe')}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.white} />
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
    backgroundColor: colors.accent,
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
