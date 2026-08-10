import React, { useState, useCallback } from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getSubscriptionStatus, isCheckoutConfigured } from './subscription';

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

  // Hide for exactly two states, and show for everything else.
  //
  // Getting this backwards was a real revenue bug: the first version hid the
  // pill for any status other than `null`, which silently excluded 'canceled'
  // and 'expired' - people who already proved they will pay and who, per
  // api/_lib/entitlement.js, have no access right now. They are the warmest
  // audience this pill has, and it was invisible to exactly them.
  //
  //   undefined -> "don't know" (offline/429/5xx). Never say "subscribe" to
  //                someone who might be paying right now.
  //   'active'  -> they already have it.
  //   anything else (null, 'canceled', 'expired', 'past_due') -> show.
  if (status === undefined || status === 'active' || !isCheckoutConfigured()) return null;

  // No tracking call here on purpose. This tap NAVIGATES; it does not show a
  // paywall, and SubscriptionScreen already fires `paywall_shown` when the
  // paywall actually opens. Firing it here too put two events in one journey
  // and halved the measured paywall->checkout rate for this traffic.
  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
