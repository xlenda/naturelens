import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import BackChevron from '../components/BackChevron';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { trackRewardRedeemed } from '../components/tracking';
import { colors, shadow } from '../components/theme';
import { getStreakInfo, spendTokens } from '../components/achievements';
import { getAvailableRewards, WALLPAPERS } from '../components/rewards';
import { getOwnedRewards, grantReward } from '../components/rewardOwnership';
import { addShield } from '../components/streakShield';

const IS_WEB = Platform.OS === 'web';

export default function StoreScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  const [tokens, setTokens] = useState(0);
  const [shields, setShields] = useState(0);
  const [owned, setOwned] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [wallpapersOpen, setWallpapersOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [info, ownedMap] = await Promise.all([getStreakInfo(), getOwnedRewards()]);
    setTokens(info.tokens);
    setShields(info.shields || 0);
    setOwned(ownedMap);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const rewards = getAvailableRewards(IS_WEB);

  const openWallpapers = () => {
    Haptics.selectionAsync();
    setWallpapersOpen(true);
  };

  const handleRedeem = async (reward) => {
    // Disable synchronously, before the first await - otherwise a fast double
    // tap fires two redemptions and charges twice.
    if (busyId) return;
    setBusyId(reward.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const isOwned = reward.kind === 'onetime' && owned[reward.id];

      // Already-owned one-time rewards reopen for free, never re-charge.
      if (isOwned) {
        if (reward.id === 'wallpapers') openWallpapers();
        else showAlert(t(`store.items.${reward.id}.title`), t(`store.items.${reward.id}.ownedBody`));
        return;
      }

      // spendTokens re-reads the balance from storage before debiting, so a
      // stale on-screen number cannot overdraw. Only grant if it returns true.
      const paid = await spendTokens(reward.cost);
      if (!paid) {
        showAlert(t('store.notEnoughTitle'), t('store.notEnoughBody', { cost: reward.cost }));
        return;
      }

      if (reward.kind === 'repeatable' && reward.id === 'streakShield') {
        await addShield();
      } else {
        await grantReward(reward.id);
      }

      await refresh();
      trackRewardRedeemed({ rewardId: reward.id, cost: reward.cost });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('store.redeemedTitle'), t(`store.items.${reward.id}.redeemedBody`));

      if (reward.id === 'wallpapers') openWallpapers();
    } finally {
      setBusyId(null);
    }
  };

  const downloadWallpaper = (wp) => {
    // Web-only by construction (the reward is flagged webOnly), so this path is
    // never reached on a native build.
    try {
      const a = document.createElement('a');
      a.href = wp.uri;
      a.download = `${wp.file}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      showAlert(t('store.downloadErrorTitle'), t('store.downloadErrorBody'));
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
          {t('store.title')}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.balanceCard}>
          <Ionicons name="disc" size={28} color={colors.accentLight} />
          <Text style={styles.balanceValue}>{tokens}</Text>
          <Text style={styles.balanceLabel}>{t('achievements.tokensLabel')}</Text>
        </View>

        {shields > 0 && (
          <View style={styles.shieldRow}>
            <Ionicons name="shield-checkmark" size={16} color="#5AA9C9" />
            <Text style={styles.shieldText}>{t('store.shieldsHeld', { count: shields })}</Text>
          </View>
        )}

        <Text style={styles.intro}>{t('store.intro')}</Text>

        {rewards.map((reward) => {
          const isOwned = reward.kind === 'onetime' && !!owned[reward.id];
          const affordable = tokens >= reward.cost;
          const disabled = busyId !== null || (!isOwned && !affordable);

          return (
            <View key={reward.id} style={styles.card}>
              <View style={[styles.cardIcon, { backgroundColor: reward.accent + '26' }]}>
                <Ionicons name={reward.icon} size={22} color={reward.accent} />
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{t(`store.items.${reward.id}.title`)}</Text>
                <Text style={styles.cardDesc}>{t(`store.items.${reward.id}.description`)}</Text>

                <View style={styles.cardFooter}>
                  {isOwned ? (
                    <Text style={[styles.ownedTag, { color: reward.accent }]}>
                      {t('store.owned')}
                    </Text>
                  ) : (
                    <View style={styles.costRow}>
                      <Ionicons name="disc-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.costText}>{reward.cost}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.redeemBtn,
                      { backgroundColor: reward.accent },
                      disabled && styles.redeemBtnDisabled,
                    ]}
                    onPress={() => handleRedeem(reward)}
                    disabled={disabled}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isOwned ? t('store.open') : t('store.redeemLabel', { cost: reward.cost })
                    }
                  >
                    <Text style={styles.redeemBtnText}>
                      {isOwned ? t('store.open') : t('store.redeem')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        <Text style={styles.footnote}>{t('store.earnHint')}</Text>
      </ScrollView>

      <Modal
        visible={wallpapersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setWallpapersOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('store.items.wallpapers.title')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wpScroll}>
              {WALLPAPERS.map((wp) => (
                <View key={wp.id} style={styles.wpItem}>
                  <Image source={{ uri: wp.uri }} style={styles.wpImage} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.wpBtn}
                    onPress={() => downloadWallpaper(wp)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('store.download')}
                  >
                    <Ionicons name="download-outline" size={15} color={colors.white} />
                    <Text style={styles.wpBtnText}>{t('store.download')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setWallpapersOpen(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={styles.modalCloseText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    ...shadow,
  },
  balanceValue: { fontSize: 38, fontWeight: '800', color: colors.text, marginTop: 6 },
  balanceLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
  shieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  shieldText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  intro: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cardDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  costText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  ownedTag: { fontSize: 12.5, fontWeight: '700' },
  redeemBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  redeemBtnDisabled: { opacity: 0.4 },
  redeemBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  footnote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  wpScroll: { marginBottom: 6 },
  wpItem: { marginRight: 12, alignItems: 'center' },
  wpImage: {
    width: 120,
    height: 213,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  wpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 8,
  },
  wpBtnText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  modalClose: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
  },
  modalCloseText: { color: colors.text, fontWeight: '700', fontSize: 14 },
});
