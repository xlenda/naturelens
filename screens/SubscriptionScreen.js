import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import BackChevron from '../components/BackChevron';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import { colors, shadow, type } from '../components/theme';
import {
  canManageStoreSubscription,
  getLinkedEmail,
  getPeriodEnd,
  getSubscriptionStatus,
  openStoreSubscriptionManagement,
} from '../components/subscription';
import MemberCard from '../components/MemberCard';

export default function SubscriptionScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [status, setStatus] = useState(undefined);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getSubscriptionStatus().then((value) => {
        if (alive) setStatus(value);
      });
      return () => { alive = false; };
    }, [])
  );

  const isActive = status === 'active';
  const isUnknown = status === undefined;

  const manageSubscription = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await openStoreSubscriptionManagement();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NatureScene />
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} accessibilityRole="header">{t('subscription.title')}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isActive && (
          <View style={styles.memberCardGap}>
            <MemberCard status={status} email={getLinkedEmail()} periodEnd={getPeriodEnd()} />
          </View>
        )}

        <View style={[styles.statusCard, isActive && styles.statusCardActive]}>
          <Ionicons
            name={isActive ? 'checkmark-circle' : isUnknown ? 'help-circle-outline' : 'lock-closed-outline'}
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
              : t('paywall.notAvailableYet')}
          </Text>
        </View>

        {isActive && canManageStoreSubscription() && (
          <ZoneBand gutter={20} style={styles.zoneGap}>
            <Text style={styles.sectionTitle}>{t('subscription.manageTitle')}</Text>
            <Text style={styles.manageBody}>{t('subscription.manageBody')}</Text>
            <Pressable
              style={styles.secondaryBtn}
              onPress={manageSubscription}
              accessibilityRole="button"
              accessibilityLabel={t('subscription.manageStore')}
            >
              <Ionicons name="open-outline" size={17} color={colors.text} />
              <Text style={styles.secondaryBtnText}>{t('subscription.manageStore')}</Text>
            </Pressable>
          </ZoneBand>
        )}

        <Pressable
          style={styles.linkRow}
          onPress={() => navigation.navigate('RestoreAccess')}
          accessibilityRole="button"
          accessibilityLabel={t('login.signInRow')}
        >
          <Ionicons name="log-in-outline" size={17} color={colors.accentLight} />
          <Text style={styles.linkRowText}>{t('login.signInRow')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, paddingBottom: 40 },
  memberCardGap: { marginBottom: 18 },
  statusCard: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 22, alignItems: 'center', gap: 8, ...shadow },
  statusCardActive: { borderColor: colors.accent + '66' },
  statusTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  statusBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  zoneGap: { marginTop: 20 },
  sectionTitle: { ...type.sectionTitle },
  manageBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  secondaryBtn: { minHeight: 48, marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryBtnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  linkRow: { minHeight: 52, marginTop: 20, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkRowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
});
