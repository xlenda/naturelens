import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import BackChevron from '../components/BackChevron';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { usePageShowReset } from '../components/usePageShowReset';
import { colors, shadow } from '../components/theme';
import {
  getSubscriptionStatus,
  startCheckout,
  PLAN_PRICES,
  PLAN_ORDER,
} from '../components/subscription';
import { trackPaywallShown, trackPaywallDismissed } from '../components/tracking';

// "My subscription".
//
// Exists because the honest answer in the Help FAQ used to be: the only way to
// stop being charged is to delete your account. That is a conversion killer -
// people who fear they cannot cancel simply do not subscribe - and it reads as
// a dark pattern even when it is not intended as one.
//
// With Hotmart the cancel button cannot live here: cancellation happens in the
// buyer's own Hotmart account, and there is no server-side cancel available
// with only the webhook token. So this screen does the next best thing - states
// the status plainly and sends them straight to the right place.
const HOTMART_ACCOUNT_URL = 'https://consumer.hotmart.com/purchase';

export default function SubscriptionScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  const [status, setStatus] = useState(undefined); // undefined = unknown/loading
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Un-freezes the subscribe button when the page is restored from bfcache
  // after coming back from Hotmart's checkout (see usePageShowReset).
  usePageShowReset(useCallback(() => setSubscribing(false), []));

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

  const isActive = status === 'active';
  // undefined means the check itself failed (offline, 429, server error). That
  // is NOT "not subscribed" - saying so to a paying customer is the exact bug
  // the three-state status was introduced to prevent.
  const isUnknown = status === undefined;

  const openPaywall = () => {
    trackPaywallShown({ trigger: 'subscription_screen' });
    setPaywallVisible(true);
  };

  const handleSubscribe = async (plan) => {
    setSubscribing(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setSubscribing(false);
      showAlert(t('paywall.checkoutFailedTitle'), e.message || t('paywall.checkoutFailedBody'));
    }
  };

  const openHotmart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(HOTMART_ACCOUNT_URL, '_blank');
    } else {
      Linking.openURL(HOTMART_ACCOUNT_URL);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header">
          {t('subscription.title')}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusCard, isActive && styles.statusCardActive]}>
          <Ionicons
            name={isActive ? 'checkmark-circle' : isUnknown ? 'help-circle-outline' : 'lock-open-outline'}
            size={34}
            color={isActive ? colors.accent : colors.textMuted}
          />
          <Text style={styles.statusTitle}>
            {isActive
              ? t('subscription.activeTitle')
              : isUnknown
              ? t('subscription.unknownTitle')
              : t('subscription.freeTitle')}
          </Text>
          <Text style={styles.statusBody}>
            {isActive
              ? t('subscription.activeBody')
              : isUnknown
              ? t('subscription.unknownBody')
              : t('subscription.freeBody')}
          </Text>
        </View>

        {!isActive && !isUnknown && (
          <>
            <Text style={styles.sectionTitle}>{t('subscription.plansTitle')}</Text>
            {PLAN_ORDER.map((plan) => (
              <View key={plan} style={styles.planRow}>
                <Text style={styles.planName}>{t(`paywall.${plan}Plan`)}</Text>
                <Text style={styles.planPrice}>${PLAN_PRICES[plan]}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={openPaywall}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('paywall.subscribe')}
            >
              <Text style={styles.primaryBtnText}>{t('paywall.subscribe')}</Text>
            </TouchableOpacity>
          </>
        )}

        {isActive && (
          <>
            {/* The cancellation answer, stated plainly instead of buried. */}
            <Text style={styles.sectionTitle}>{t('subscription.manageTitle')}</Text>
            <Text style={styles.manageBody}>{t('subscription.manageBody')}</Text>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={openHotmart}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('subscription.openHotmart')}
            >
              <Ionicons name="open-outline" size={17} color={colors.text} />
              <Text style={styles.secondaryBtnText}>{t('subscription.openHotmart')}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Signing in belongs on the subscription screen too - this is exactly
            where someone realises their subscription is not showing up. The
            wording is "Sign in", not "restore access on another device": the
            latter described the situation instead of the action, and only made
            sense to someone who already knew what had gone wrong. */}
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('RestoreAccess')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('login.signInRow')}
        >
          <Ionicons name="log-in-outline" size={17} color={colors.accentLight} />
          <Text style={styles.linkRowText}>{t('login.signInRow')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      <PaywallModal
        visible={paywallVisible}
        title={t('paywall.genericTitle')}
        body={t('paywall.genericBody')}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onCancel={() => {
          trackPaywallDismissed({ trigger: 'subscription_screen' });
          setPaywallVisible(false);
        }}
      />

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, paddingBottom: 40 },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    ...shadow,
  },
  statusCardActive: { borderColor: colors.accent + '66' },
  statusTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  statusBody: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 26, marginBottom: 12 },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  planName: { color: colors.textSecondary, fontSize: 14 },
  planPrice: { color: colors.text, fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  manageBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginBottom: 16 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 15,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  linkRowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
});
