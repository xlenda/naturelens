import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors } from '../components/theme';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import AlertModal from '../components/AlertModal';
import MemberCard from '../components/MemberCard';
import { useAppAlert } from '../components/useAppAlert';
import { SUPPORTED_LANGUAGES } from '../i18n';
import { getSubscriptionStatus, getLinkedEmail, getPeriodEnd } from '../components/subscription';
import { deleteAccount, signOut } from '../components/restore';
import { resetDeviceId } from '../components/deviceId';
import { getCollection, clearCollection, clearProfilePhoto } from '../components/storage';
import { clearLocalReminders, isNativeReminderAvailable } from '../components/localReminders';
import { clearAchievements } from '../components/achievements';
import { clearRewards } from '../components/rewardOwnership';
import { clearShields } from '../components/streakShield';
import { clearMissions } from '../components/missions';
import { requestOnboardingReplay } from '../components/onboarding';
import {
  DEFAULT_DISCOVERY_PREFERENCES,
  getDiscoveryPreferences,
  updateDiscoveryPreferences,
} from '../components/discoveryPreferences';
import {
  DEFAULT_SENSORY_PREFERENCES,
  getSensoryPreferences,
  MOTION_MODES,
  setSensoryPreference,
} from '../components/sensoryPreferences';
import { sensoryFeedback } from '../components/sensoryFeedback';
import { exportCollection, pickAndImport } from '../components/collectionBackup';
import { canUseLocation, isLocationEnabled, setLocationEnabled } from '../components/deviceLocation';
import {
  CARE_REGION,
  getCareRegionPreference,
  setCareRegionPreference,
} from '../components/careRegion';
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

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
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
  const [careRegion, setCareRegion] = useState(CARE_REGION.AUTO);
  const [discoveryPreferences, setDiscoveryPreferences] = useState(
    DEFAULT_DISCOVERY_PREFERENCES
  );
  const [sensoryPreferences, setSensoryPreferences] = useState(
    DEFAULT_SENSORY_PREFERENCES
  );
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
    setCareRegion(await getCareRegionPreference());
    setDiscoveryPreferences(await getDiscoveryPreferences());
    setSensoryPreferences(await getSensoryPreferences());
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
  const careRegionLabel = t(`profile.careRegion${
    careRegion === CARE_REGION.SOUTH ? 'South' : careRegion === CARE_REGION.NORTH ? 'North' : 'Auto'
  }`);

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

  const applyCareRegion = async (value) => {
    const previous = careRegion;
    setCareRegion(value);
    const saved = await setCareRegionPreference(value);
    if (!saved) {
      setCareRegion(previous);
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const chooseCareRegion = () => {
    showAlert(t('profile.careRegionRow'), t('profile.careRegionHint'), [
      { text: t('profile.careRegionAuto'), onPress: () => applyCareRegion(CARE_REGION.AUTO) },
      { text: t('profile.careRegionSouth'), onPress: () => applyCareRegion(CARE_REGION.SOUTH) },
      { text: t('profile.careRegionNorth'), onPress: () => applyCareRegion(CARE_REGION.NORTH) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const applyDiscoveryPreference = async (key, value) => {
    const previous = discoveryPreferences;
    const optimistic = { ...previous, [key]: value };
    setDiscoveryPreferences(optimistic);
    try {
      const saved = await updateDiscoveryPreferences({ [key]: value });
      setDiscoveryPreferences(saved);
    } catch {
      setDiscoveryPreferences(previous);
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const chooseDiscoveryPreference = (group, values, titleKey, bodyKey) => {
    showAlert(t(titleKey), t(bodyKey), [
      ...values.map((value) => ({
        text: t(`onboarding.${group}.options.${value}.title`),
        onPress: () => applyDiscoveryPreference(group, value),
      })),
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const toggleHaptics = async () => {
    const previous = sensoryPreferences;
    const next = !previous.hapticsEnabled;
    setSensoryPreferences({ ...previous, hapticsEnabled: next });
    try {
      setSensoryPreferences(await setSensoryPreference('hapticsEnabled', next));
    } catch {
      setSensoryPreferences(previous);
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const applyMotion = async (motionMode) => {
    const previous = sensoryPreferences;
    setSensoryPreferences({ ...previous, motionMode });
    try {
      setSensoryPreferences(await setSensoryPreference('motionMode', motionMode));
    } catch {
      setSensoryPreferences(previous);
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const chooseMotion = () => {
    showAlert(t('settings.motion'), t('settings.motionSubtitle'), [
      {
        text: t('settings.motionSystem'),
        onPress: () => applyMotion(MOTION_MODES.SYSTEM),
      },
      {
        text: t('settings.motionReduced'),
        onPress: () => applyMotion(MOTION_MODES.REDUCED),
      },
      {
        text: t('settings.motionFull'),
        onPress: () => applyMotion(MOTION_MODES.FULL),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const motionLabel = t(
    sensoryPreferences.motionMode === MOTION_MODES.REDUCED
      ? 'settings.motionReduced'
      : sensoryPreferences.motionMode === MOTION_MODES.FULL
      ? 'settings.motionFull'
      : 'settings.motionSystem'
  );

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
    sensoryFeedback.open();
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
      // Cancela primeiro: depois que a conta some do servidor nao ha como
      // desfazer a exclusao se o Android ainda mantiver um alarme local.
      if (isNativeReminderAvailable()) {
        const remindersCleared = await clearLocalReminders();
        if (!remindersCleared?.ok) throw new Error(t('common.saveErrorBody'));
      }
      const { billingStillActive } = await deleteAccount();
      if (!await clearCollection()) throw new Error(t('common.saveErrorBody'));
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
        {subStatus === 'active' ? (
          // The differentiated membership object (competitor's gold-card
          // device): subscribers see their card, not a settings row.
          <MemberCard
            status={subStatus}
            email={accountEmail}
            periodEnd={getPeriodEnd()}
            onPress={() => navigation.navigate('Subscription')}
          />
        ) : (
          <View style={styles.card}>
            <Row
              icon="card-outline"
              label={t('subscription.title')}
              onPress={() => navigation.navigate('Subscription')}
              last
            />
          </View>
        )}

        <Text style={styles.eyebrow}>{t('onboarding.personalizeKicker')}</Text>
        <View style={styles.card}>
          <Row
            icon="compass-outline"
            label={t('onboarding.goal.title')}
            hint={t('onboarding.goal.body')}
            value={t(`onboarding.goal.options.${discoveryPreferences.goal}.title`)}
            onPress={() => chooseDiscoveryPreference(
              'goal',
              ['identify', 'safety', 'care', 'field', 'learn'],
              'onboarding.goal.title',
              'onboarding.goal.body'
            )}
          />
          <Row
            icon="map-outline"
            label={t('onboarding.context.title')}
            hint={t('onboarding.context.body')}
            value={t(`onboarding.context.options.${discoveryPreferences.context}.title`)}
            onPress={() => chooseDiscoveryPreference(
              'context',
              ['home', 'field', 'nature', 'water', 'study'],
              'onboarding.context.title',
              'onboarding.context.body'
            )}
          />
          <Row
            icon="layers-outline"
            label={t('onboarding.depth.title')}
            hint={t('onboarding.depth.body')}
            value={t(`onboarding.depth.options.${discoveryPreferences.depth}.title`)}
            onPress={() => chooseDiscoveryPreference(
              'depth',
              ['essential', 'visual', 'technical'],
              'onboarding.depth.title',
              'onboarding.depth.body'
            )}
          />
          <Row
            icon="play-circle-outline"
            label={t('settings.replayOnboarding')}
            hint={t('settings.replayOnboardingHint')}
            onPress={requestOnboardingReplay}
            last
          />
        </View>

        <Text style={styles.eyebrow}>{t('settings.sensoryTitle')}</Text>
        <View style={styles.card}>
          <Row
            icon={sensoryPreferences.hapticsEnabled ? 'phone-portrait' : 'phone-portrait-outline'}
            label={t('settings.haptics')}
            hint={t('settings.hapticsSubtitle')}
            onPress={toggleHaptics}
            toggle
            checked={sensoryPreferences.hapticsEnabled}
          />
          <Row
            icon="accessibility-outline"
            label={t('settings.motion')}
            hint={t('settings.motionSubtitle')}
            value={motionLabel}
            onPress={chooseMotion}
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
          <Row
            icon="partly-sunny-outline"
            label={t('profile.careRegionRow')}
            hint={t('profile.careRegionHint')}
            value={careRegionLabel}
            onPress={chooseCareRegion}
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
            last
          />
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

        {/* About the App trio, mirroring the competitor: App info opens the
            About screen and Tell Friends lives here (moved from Support),
            exactly where the competitor puts it. */}
        <Text style={styles.eyebrow}>{t('settings.sectionAbout')}</Text>
        <View style={styles.card}>
          <Row
            icon="information-circle-outline"
            label={t('about.appInfo')}
            onPress={() => navigation.navigate('About')}
          />
          <Row icon="share-social-outline" label={t('settings.tellFriends')} onPress={handleTellFriends} last />
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
