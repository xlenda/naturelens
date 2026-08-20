import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../components/theme';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { getSubscriptionStatus, getLinkedEmail } from '../components/subscription';
import { deleteAccount, signOut } from '../components/restore';
import { resetDeviceId } from '../components/deviceId';
import { getCollection, clearCollection, clearProfilePhoto } from '../components/storage';
import { clearAchievements } from '../components/achievements';
import { clearRewards } from '../components/rewardOwnership';
import { clearShields } from '../components/streakShield';
import { clearMissions } from '../components/missions';
import { exportCollection, pickAndImport } from '../components/collectionBackup';
import { canUseLocation, isLocationEnabled, setLocationEnabled } from '../components/deviceLocation';
import {
  canUsePush,
  enablePush,
  disablePush,
  isPushEnabled,
} from '../components/pushNotifications';
import {
  canPromptInstall,
  isStandalone,
  isIOS,
  onInstallAvailabilityChange,
  promptInstall,
} from '../components/pwaInstall';

const APP_VERSION = '1.0.0';
const APP_URL = 'https://naturelensapp.cloud';

// Settings, extracted out of the Profile screen. The Profile used to be a
// 900-line drawer where identity, stats, preferences, backup, legal links,
// the language list and account deletion all lived in one scroll - the exact
// "meio perdido" the owner complained about. The competitor's anatomy
// (studied frame by frame): section titles as eyebrows OUTSIDE grouped cards,
// rows of icon + label + inline value + chevron, native-style toggles inline
// for booleans, membership first, the About trio last.
//
// A row is data, not JSX copy-paste: `value` renders as quiet text before the
// chevron (the "0B on Clear Cache" device - state visible without entering),
// `toggle` swaps the chevron for a switch glyph.
function Row({ icon, label, value, hint, onPress, toggle, checked, disabled, destructive, last }) {
  return (
    <PressScale>
      <TouchableOpacity
        style={[styles.row, !last && styles.rowDivider]}
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole={toggle ? 'switch' : 'button'}
        accessibilityState={toggle ? { checked } : undefined}
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon}
          size={19}
          color={destructive ? colors.error : colors.accentLight}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
          {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
        </View>
        {!!value && (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        )}
        {toggle ? (
          <Ionicons
            name={checked ? 'toggle' : 'toggle-outline'}
            size={26}
            color={checked ? colors.accent : colors.textMuted}
          />
        ) : (
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    </PressScale>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  const [subStatus, setSubStatus] = useState(undefined);
  const [accountEmail, setAccountEmail] = useState(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [locationOn, setLocationOn] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(
    Platform.OS === 'web' && !isStandalone() && (canPromptInstall() || isIOS())
  );

  const load = useCallback(async () => {
    const status = await getSubscriptionStatus();
    setSubStatus(status);
    setAccountEmail(getLinkedEmail());
    setPushOn(await isPushEnabled());
    setLocationOn(await isLocationEnabled());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    return onInstallAvailabilityChange(() => {
      setInstallAvailable(!isStandalone() && (canPromptInstall() || isIOS()));
    });
  }, []);

  // The current language shown as an inline value, written in itself (the
  // endonym) - the competitor's "state without opening the screen" device.
  const currentLanguage =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.label || i18n.language;

  const handleTogglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        return;
      }
      const result = await enablePush();
      if (result === 'granted') {
        setPushOn(true);
        showAlert(t('notifications.enabledTitle'), t('notifications.enabledBody'));
      } else if (result === 'denied') {
        showAlert(t('notifications.deniedTitle'), t('notifications.deniedBody'));
      } else {
        showAlert(t('notifications.errorTitle'), t('notifications.errorBody'));
      }
    } finally {
      setPushBusy(false);
    }
  };

  const toggleLocation = async () => {
    const next = !locationOn;
    setLocationOn(next);
    const saved = await setLocationEnabled(next);
    if (!saved) setLocationOn(!next);
  };

  const handleExport = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const ok = await exportCollection();
      if (!ok) showAlert(t('backup.exportEmptyTitle'), t('backup.exportEmptyBody'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImport = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const result = await pickAndImport();
      if (!result) return;
      showAlert(
        t('backup.importDoneTitle'),
        t('backup.importDoneBody', { added: result.added, skipped: result.skipped })
      );
    } catch (err) {
      const key =
        err.code === 'wrong_format' || err.code === 'invalid_file'
          ? 'backup.errorWrongFile'
          : err.code === 'newer_version'
          ? 'backup.errorNewerVersion'
          : err.code === 'storage_full'
          ? 'backup.errorStorageFull'
          : 'backup.errorGeneric';
      showAlert(t('backup.importFailedTitle'), t(key));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleInstall = async () => {
    if (canPromptInstall()) {
      const choice = await promptInstall();
      if (choice?.outcome === 'accepted') setInstallAvailable(false);
      return;
    }
    if (isIOS()) {
      showAlert(t('profile.installAppIOSTitle'), t('profile.installAppIOSBody'));
    }
  };

  // The competitor's "Tell Friends" - here through the platform's own share
  // sheet (Web Share API / RN Share). Clipboard is the last-resort fallback on
  // desktop browsers without navigator.share. A user cancelling the sheet is
  // not an error.
  const handleTellFriends = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message: APP_URL });
      } else if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'NatureLens', url: APP_URL });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(APP_URL);
        showAlert(t('settings.tellFriends'), t('settings.linkCopied'));
      }
    } catch (e) {
      // share sheet dismissed
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setAccountEmail(null);
      await load();
    } catch (e) {
      showAlert(t('login.signOutFailedTitle'), e.message || t('restore.genericError'));
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { billingStillActive } = await deleteAccount();
      await clearCollection();
      await clearProfilePhoto();
      await clearAchievements();
      await clearRewards();
      await clearShields();
      await clearMissions();
      await resetDeviceId();
      showAlert(
        t('profile.deleteAccountDoneTitle'),
        billingStillActive
          ? t('profile.deleteAccountDoneBillingBody')
          : t('profile.deleteAccountDoneBody'),
        [{ text: t('common.ok'), onPress: () => navigation.navigate('Collection') }]
      );
    } catch (e) {
      showAlert(t('profile.deleteAccountFailedTitle'), e.message || t('profile.deleteAccountFailedBody'));
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteAccount = () => {
    showAlert(t('profile.deleteAccountConfirmTitle'), t('profile.deleteAccountConfirmBody'), [
      { text: t('profile.deleteAccountConfirmButton'), style: 'destructive', onPress: handleDeleteAccount },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas: first child, pointerEvents none inside the
          component, container keeps its backgroundColor underneath. */}
      <NatureScene />

      <TopBar title={t('settings.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Membership first - the competitor's Settings opens with it, and it
            is the row a paying user comes here to find. */}
        <Text style={styles.eyebrow}>{t('settings.sectionMembership')}</Text>
        <View style={styles.card}>
          <Row
            icon="card-outline"
            label={t('subscription.title')}
            value={subStatus === 'active' ? t('paywall.subscribed') : ''}
            onPress={() => navigation.navigate('Subscription')}
            last
          />
        </View>

        <Text style={styles.eyebrow}>{t('settings.sectionGeneral')}</Text>
        <View style={styles.card}>
          <Row
            icon="globe-outline"
            label={t('profile.language')}
            value={currentLanguage}
            onPress={() => navigation.navigate('Language')}
          />
          {canUsePush() && (
            <Row
              icon={pushOn ? 'notifications' : 'notifications-outline'}
              label={t('notifications.row')}
              onPress={handleTogglePush}
              toggle
              checked={pushOn}
              disabled={pushBusy}
            />
          )}
          {canUseLocation() && (
            <Row
              icon={locationOn ? 'location' : 'location-outline'}
              label={t('profile.locationRow')}
              hint={t('profile.locationHint')}
              onPress={toggleLocation}
              toggle
              checked={locationOn}
            />
          )}
          {Platform.OS === 'web' && (
            <>
              <Row
                icon="download-outline"
                label={t('backup.exportRow')}
                onPress={handleExport}
                disabled={backupBusy}
              />
              <Row
                icon="cloud-upload-outline"
                label={t('backup.importRow')}
                onPress={handleImport}
                disabled={backupBusy}
                last={!installAvailable}
              />
            </>
          )}
          {installAvailable && (
            <Row icon="phone-portrait-outline" label={t('profile.installApp')} onPress={handleInstall} last />
          )}
        </View>

        <Text style={styles.eyebrow}>{t('settings.sectionSupport')}</Text>
        <View style={styles.card}>
          <Row
            icon="help-circle-outline"
            label={t('profile.helpAndSupport')}
            onPress={() => navigation.navigate('Help')}
          />
          <Row icon="share-social-outline" label={t('settings.tellFriends')} onPress={handleTellFriends} last />
        </View>

        <Text style={styles.eyebrow}>{t('settings.sectionLegal')}</Text>
        <View style={styles.card}>
          <Row
            icon="document-lock-outline"
            label={t('profile.privacyPolicy')}
            onPress={() => navigation.navigate('Privacy')}
          />
          <Row
            icon="document-text-outline"
            label={t('profile.termsOfUse')}
            onPress={() => navigation.navigate('Terms')}
            last
          />
        </View>

        <Text style={styles.eyebrow}>{t('settings.sectionAccount')}</Text>
        <View style={styles.card}>
          {!!accountEmail && (
            <Row
              icon="log-out-outline"
              label={signingOut ? t('login.signingOut') : t('login.signOut')}
              value={accountEmail}
              onPress={handleSignOut}
              disabled={signingOut}
            />
          )}
          <Row
            icon="trash-outline"
            label={deletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
            onPress={confirmDeleteAccount}
            disabled={deletingAccount}
            destructive
            last
          />
        </View>

        <Text style={styles.versionText}>{t('profile.version', { version: APP_VERSION })}</Text>
      </ScrollView>

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
  scroll: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  // Eyebrow OUTSIDE the card - the competitor's grouping device. Deliberately
  // NOT the centred 22/800 sectionTitle: these are quiet group labels in a
  // utility screen, not editorial section openers.
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // Inset divider starting after the icon, like the competitor's lists.
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowHint: { fontSize: 11.5, lineHeight: 16, color: colors.textMuted, marginTop: 3, marginRight: 6 },
  rowValue: { fontSize: 13, color: colors.textMuted, maxWidth: 140 },
  versionText: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 26 },
});
