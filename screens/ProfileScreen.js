import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, shadow } from '../components/theme';
import { getCollection, getProfilePhoto, saveProfilePhoto, clearCollection, clearProfilePhoto } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../i18n';
import { startCheckout, getSubscriptionStatus, getLinkedEmail } from '../components/subscription';
import { createPassword, deleteAccount } from '../components/restore';
import { resetDeviceId } from '../components/deviceId';
import { getStreakInfo, evaluateAchievements, clearAchievements } from '../components/achievements';
import { clearRewards, hasReward } from '../components/rewardOwnership';
import { exportCollection, pickAndImport } from '../components/collectionBackup';
import { canUseLocation, isLocationEnabled, setLocationEnabled } from '../components/deviceLocation';
import { clearShields } from '../components/streakShield';
import { clearMissions } from '../components/missions';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import PasswordInput from '../components/PasswordInput';
import { useAppAlert } from '../components/useAppAlert';
import { usePageShowReset } from '../components/usePageShowReset';
import CategoryIcon from '../components/CategoryIcon';
import {
  canUsePush,
  getPermission as getPushPermission,
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

// Derived from CATEGORIES rather than hand-listed. The hardcoded version of
// this object silently dropped every saved fish and bird from the per-category
// stats the moment those categories were added - the counter loop below skips
// any key that isn't already present. Building it from the source of truth
// means the next category added can never be forgotten here again.
const EMPTY_COUNTS = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0]));

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [subStatus, setSubStatus] = useState(null);
  const [accountEmail, setAccountEmail] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(
    Platform.OS === 'web' && !isStandalone() && (canPromptInstall() || isIOS())
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [creatingPassword, setCreatingPassword] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [hasNaturalistBadge, setHasNaturalistBadge] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [locationOn, setLocationOn] = useState(true);

  useEffect(() => {
    let alive = true;
    isLocationEnabled().then((on) => {
      if (alive) setLocationOn(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleLocation = async () => {
    const next = !locationOn;
    // Optimistic: the switch has to feel instant, and a storage write that fails
    // is reverted rather than left showing a state that was not saved.
    setLocationOn(next);
    const saved = await setLocationEnabled(next);
    if (!saved) setLocationOn(!next);
  };
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  // Un-freezes the subscribe button when the page is restored from bfcache
  // after coming back from Hotmart's checkout (see usePageShowReset).
  usePageShowReset(useCallback(() => setCheckingOut(false), []));

  const load = useCallback(async () => {
    const list = await getCollection();
    setTotal(list.length);
    const next = { ...EMPTY_COUNTS };
    list.forEach((item) => {
      if (next[item.category] !== undefined) {
        next[item.category] += 1;
      }
    });
    setCounts(next);

    const status = await getSubscriptionStatus();
    setSubStatus(status);
    // The same call learns which account is linked to this device - no extra
    // request just to render the account row.
    setAccountEmail(getLinkedEmail());
    // Reuses the subStatus this screen already fetches every focus, so the
    // "Premium Member" achievement gets picked up passively without a
    // second network call of its own.
    evaluateAchievements({ subStatus: status });

    const { currentStreak: streak, tokens: tokenTotal } = await getStreakInfo();
    setCurrentStreak(streak);
    setTokens(tokenTotal);

    const photo = await getProfilePhoto();
    setPhotoUri(photo);

    // The badge is a one-time reward bought in the store; this is the effect it
    // was sold for, so it has to actually render somewhere the buyer sees it.
    setHasNaturalistBadge(await hasReward('naturalistBadge'));
    setPushOn(await isPushEnabled());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleExport = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const ok = await exportCollection();
      if (!ok) {
        // Empty collection is the common case here, not an error - saying
        // "export failed" for an empty collection would be misleading.
        showAlert(t('backup.exportEmptyTitle'), t('backup.exportEmptyBody'));
      }
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImport = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const result = await pickAndImport();
      if (!result) return; // cancelled
      await load();
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
        // Once denied, the browser will not ask again - only the user can undo
        // it in site settings, so say that instead of silently doing nothing.
        showAlert(t('notifications.deniedTitle'), t('notifications.deniedBody'));
      } else {
        showAlert(t('notifications.errorTitle'), t('notifications.errorBody'));
      }
    } finally {
      setPushBusy(false);
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

  const handleSubscribe = async (plan) => {
    setCheckingOut(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setCheckingOut(false);
    }
  };

  const handlePickPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showAlert(t('identify.libraryPermissionTitle'), t('identify.libraryPermissionMessage'));
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;

      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 300 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const dataUri = `data:image/jpeg;base64,${manipulated.base64}`;
      const saved = await saveProfilePhoto(dataUri);
      if (saved) {
        setPhotoUri(dataUri);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    } catch (err) {
      showAlert(t('identify.identificationFailedTitle'), t('identify.photoProcessingFailed'));
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { billingStillActive } = await deleteAccount();
      await clearCollection();
      await clearProfilePhoto();
      await clearAchievements();
      // Rewards bought with tokens are part of "everything about me on this
      // device" - leaving shields and badges behind after a full account wipe
      // would contradict what the confirmation dialog promises.
      await clearRewards();
      await clearShields();
      await clearMissions();
      await resetDeviceId();
      // If billing is still running at Hotmart, say so instead of letting the
      // person believe deleting the account also stopped the charge.
      showAlert(
        t('profile.deleteAccountDoneTitle'),
        billingStillActive
          ? t('profile.deleteAccountDoneBillingBody')
          : t('profile.deleteAccountDoneBody'),
        [
          // 'CollectionHome' lives in a different stack now that Profile is its
          // own tab, so naming it directly no longer resolves. Navigating to
          // the TAB works: React Navigation bubbles an unhandled action up to
          // the parent tab navigator.
          { text: t('common.ok'), onPress: () => navigation.navigate('Collection') },
        ]
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

  const handleCreatePassword = async () => {
    if (passwordInput.length < 8) {
      showAlert(t('profile.passwordTooShortTitle'), t('profile.passwordTooShortBody'));
      return;
    }
    setCreatingPassword(true);
    try {
      const email = await createPassword(passwordInput);
      setPasswordInput('');
      showAlert(t('profile.passwordCreatedTitle'), t('profile.passwordCreatedBody', { email }));
    } catch (e) {
      showAlert(t('profile.passwordCreatedFailedTitle'), e.message || t('profile.passwordCreatedFailedBody'));
    } finally {
      setCreatingPassword(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* No back chevron: Profile is a bottom tab now, so it is the root of its
          own stack and goBack() has nowhere to go. The two spacers keep the
          title optically centred, same as the other tab-root screens. */}
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.title} accessibilityRole="header">{t('profile.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={handlePickPhoto}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera" size={26} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="pencil" size={12} color={colors.white} />
          </View>
        </TouchableOpacity>

        {hasNaturalistBadge && (
          <View style={styles.naturalistPill}>
            <Ionicons name="ribbon" size={13} color={colors.warning} />
            <Text style={styles.naturalistPillText}>{t('profile.naturalistBadge')}</Text>
          </View>
        )}

        {/* Nothing found yet: an invitation, not a scoreboard of zeros.
            A brand new user used to open this screen and be shown "0 items
            identified", "0 day streak" and "0 tokens" - three zeros in a row,
            as the very first impression of a paid app. Counters are a reward
            for having done something; before that they are only a reminder that
            you have not. */}
        {total === 0 ? (
          <TouchableOpacity
            style={styles.emptyCard}
            activeOpacity={0.85}
            onPress={() => navigation.getParent()?.navigate(CATEGORIES.plant.tabLabel)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.emptyCta')}
          >
            <View style={[styles.emptyIcon, { backgroundColor: colors.accent + '1F' }]}>
              <CategoryIcon name="leaf" size={26} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>{t('profile.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('profile.emptyBody')}</Text>
            <View style={[styles.emptyBtn, { backgroundColor: colors.accent }]}>
              <Ionicons name="camera" size={16} color={colors.white} />
              <Text style={styles.emptyBtnText}>{t('profile.emptyCta')}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.totalCard}>
            <View style={styles.totalIcon}>
              <Ionicons
                name="albums-outline"
                size={30}
                color={colors.accentLight}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.totalNumber}>{total}</Text>
              <Text style={styles.totalLabel}>
                {t('profile.itemsIdentified', { count: total })}
              </Text>
            </View>
          </View>
        )}

        {/* Two cards, two destinations. The streak opens Achievements; the token
            balance opens the Rewards store - tapping a balance to go spend it is
            the affordance people expect, and until the store existed this card
            led somewhere that could not answer "what are these for?". */}
        {/* Same reasoning as the card above: a streak of 0 and a balance of 0
            are not information, they are two more zeros. Both appear the moment
            there is something to count. */}
        {total > 0 && (
        <View style={styles.streakRow}>
          <TouchableOpacity
            style={styles.streakCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Achievements')}
            accessibilityRole="button"
            accessibilityLabel={t('achievements.title')}
          >
            <View style={styles.streakIcon}>
              <Ionicons
                name="flame"
                size={22}
                color={colors.warning}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakNumber}>{currentStreak}</Text>
              <Text style={styles.streakLabel}>{t('achievements.streakLabel')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.streakCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Store')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.rewardsStore')}
          >
            <View style={[styles.streakIcon, styles.tokensIcon]}>
              <Ionicons
                name="disc"
                size={22}
                color={colors.accentLight}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakNumber}>{tokens}</Text>
              <Text style={styles.streakLabel}>{t('achievements.tokensLabel')}</Text>
            </View>
          </TouchableOpacity>
        </View>
        )}

        {/* Monthly recap: a scoreboard of the current month, built from the
            collection that already exists. Placed right under the streak/token
            cards because it is the same "how am I doing" question. */}
        {/* Account, FIRST.
            This used to be a small "already subscribed on another device?
            Restore access" link buried inside the subscription card, and only
            visible to people who were NOT subscribed. That framing was wrong in
            both directions: it reads as a recovery flow for a problem, when it
            is simply how you sign in - and someone who already pays could never
            find their own account. Signing in is an ENTRY action, so it sits at
            the top, and once there is an account it shows which one. */}
        <TouchableOpacity
          style={styles.recapRow}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('RestoreAccess')}
          accessibilityRole="button"
          accessibilityLabel={accountEmail ? t('login.accountRow') : t('login.signInRow')}
        >
          <Ionicons
            name={accountEmail ? 'person-circle' : 'log-in-outline'}
            size={19}
            color={colors.accentLight}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.recapTitle}>
              {accountEmail ? t('login.accountRow') : t('login.signInRow')}
            </Text>
            <Text style={styles.recapSub} numberOfLines={1}>
              {accountEmail || t('login.signInSubtitle')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.recapRow}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('MonthlyRecap')}
          accessibilityRole="button"
          accessibilityLabel={t('recap.title')}
        >
          <Ionicons name="stats-chart" size={19} color={colors.accentLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.recapTitle}>{t('recap.title')}</Text>
            <Text style={styles.recapSub}>{t('recap.entrySubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.recapRow}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Subscription')}
          accessibilityRole="button"
          accessibilityLabel={t('subscription.title')}
        >
          <Ionicons name="card-outline" size={19} color={colors.accentLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.recapTitle}>{t('subscription.title')}</Text>
            <Text style={styles.recapSub}>{t('subscription.entrySubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.accountCard}>
          {subStatus === 'active' ? (
            <View style={styles.subscribedPill}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={styles.subscribedText}>{t('paywall.subscribed')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.subscribeBtn, checkingOut && { opacity: 0.6 }]}
              onPress={() => setPaywallVisible(true)}
              disabled={checkingOut}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('paywall.subscribe')}
            >
              <Text style={styles.subscribeBtnText}>
                {checkingOut ? t('paywall.subscribing') : t('paywall.subscribe')}
              </Text>
            </TouchableOpacity>
          )}
          {/* The old "already subscribed on another device? Restore access"
              link lived here. It is now the account row at the top of this
              screen, where signing in belongs - repeating it inside the
              subscription card would offer the same door twice. */}
        </View>

        {subStatus === 'active' && (
          <View style={styles.accountCard}>
            <Text style={styles.passwordTitle}>{t('profile.createPasswordTitle')}</Text>
            <Text style={styles.passwordBody}>{t('profile.createPasswordBody')}</Text>
            <PasswordInput
              style={styles.passwordInput}
              placeholder={t('restore.passwordPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={passwordInput}
              onChangeText={setPasswordInput}
              editable={!creatingPassword}
            />
            <TouchableOpacity
              style={[styles.subscribeBtn, (creatingPassword || passwordInput.length < 8) && { opacity: 0.6 }]}
              onPress={handleCreatePassword}
              disabled={creatingPassword || passwordInput.length < 8}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('profile.createPasswordButton')}
            >
              <Text style={styles.subscribeBtnText}>
                {creatingPassword ? t('profile.creatingPassword') : t('profile.createPasswordButton')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionLabel}>{t('profile.byCategory')}</Text>

        {Object.values(CATEGORIES).map((meta) => (
          <View key={meta.key} style={styles.categoryCard}>
            <View style={[styles.categoryIcon, { backgroundColor: meta.accent + '33' }]}>
              <CategoryIcon
                name={meta.tabIcon}
                size={22}
                color={meta.accent}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <Text style={styles.categoryLabel}>{t(`categories.${meta.key}.tabLabel`)}</Text>
            <Text style={styles.categoryCount}>{counts[meta.key] || 0}</Text>
          </View>
        ))}

        {/* Web push. Only rendered where it can actually work: on iPhone the
            API exists in a Safari tab but is inert until the PWA is installed,
            so offering it there would teach the user the button is broken. */}
        {canUsePush() && (
          <TouchableOpacity
            style={styles.privacyRow}
            activeOpacity={0.7}
            onPress={handleTogglePush}
            disabled={pushBusy}
            accessibilityRole="switch"
            accessibilityState={{ checked: pushOn }}
            accessibilityLabel={t('notifications.row')}
          >
            <Ionicons
              name={pushOn ? 'notifications' : 'notifications-outline'}
              size={19}
              color={pushOn ? colors.accent : colors.accentLight}
            />
            <Text style={styles.privacyText}>{t('notifications.row')}</Text>
            <Text style={styles.pushState}>
              {pushOn ? t('notifications.on') : t('notifications.off')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Backup. The collection lives only in this browser's storage, so
            without this a cleared browser or a new phone loses everything -
            the one thing in the app a user cannot get back. */}
        {Platform.OS === 'web' && (
          <>
            <TouchableOpacity
              style={styles.privacyRow}
              activeOpacity={0.7}
              onPress={handleExport}
              disabled={backupBusy}
              accessibilityRole="button"
              accessibilityLabel={t('backup.exportRow')}
            >
              <Ionicons name="download-outline" size={19} color={colors.accentLight} />
              <Text style={styles.privacyText}>{t('backup.exportRow')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.privacyRow}
              activeOpacity={0.7}
              onPress={handleImport}
              disabled={backupBusy}
              accessibilityRole="button"
              accessibilityLabel={t('backup.importRow')}
            >
              <Ionicons name="cloud-upload-outline" size={19} color={colors.accentLight} />
              <Text style={styles.privacyText}>{t('backup.importRow')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        {/* Approximate location. Sits with the privacy rows rather than under a
            "settings" heading because that is what it is: a choice about what
            leaves the device. Off is always allowed - identification still
            works, just with a wider field of candidates. */}
        {canUseLocation() && (
          <TouchableOpacity
            style={styles.privacyRow}
            activeOpacity={0.7}
            onPress={toggleLocation}
            accessibilityRole="switch"
            accessibilityState={{ checked: locationOn }}
            accessibilityLabel={t('profile.locationRow')}
          >
            <Ionicons
              name={locationOn ? 'location' : 'location-outline'}
              size={19}
              color={locationOn ? colors.accentLight : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyText}>{t('profile.locationRow')}</Text>
              <Text style={styles.locationHint}>{t('profile.locationHint')}</Text>
            </View>
            <Ionicons
              name={locationOn ? 'toggle' : 'toggle-outline'}
              size={26}
              color={locationOn ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.privacyRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Privacy')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.privacyPolicy')}
        >
          <Ionicons
            name="document-lock-outline"
            size={18}
            color={colors.textSecondary}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.privacyText}>{t('profile.privacyPolicy')}</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.privacyRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Terms')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.termsOfUse')}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={colors.textSecondary}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.privacyText}>{t('profile.termsOfUse')}</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.privacyRow}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Help')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.helpAndSupport')}
        >
          <Ionicons
            name="help-circle-outline"
            size={18}
            color={colors.textSecondary}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.privacyText}>{t('profile.helpAndSupport')}</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

        {installAvailable && (
          <TouchableOpacity
            style={styles.privacyRow}
            activeOpacity={0.7}
            onPress={handleInstall}
            accessibilityRole="button"
            accessibilityLabel={t('profile.installApp')}
          >
            <Ionicons
              name="download-outline"
              size={18}
              color={colors.textSecondary}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.privacyText}>{t('profile.installApp')}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textMuted}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>{t('profile.language')}</Text>

        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = i18n.language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.languageRow, isActive && styles.languageRowActive]}
              activeOpacity={0.7}
              onPress={async () => await setAppLanguage(lang.code)}
              accessibilityRole="button"
              accessibilityLabel={`Switch language to ${lang.label}`}
            >
              <Text style={styles.languageText}>{lang.label}</Text>
              {isActive && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.accent}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={confirmDeleteAccount}
          disabled={deletingAccount}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('profile.deleteAccount')}
        >
          <Text style={styles.deleteAccountBtnText}>
            {deletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
          </Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>{t('profile.version', { version: APP_VERSION })}</Text>
      </ScrollView>

      <PaywallModal
        visible={paywallVisible}
        title={t('paywall.genericTitle')}
        body={t('paywall.genericBody')}
        subscribing={checkingOut}
        onSubscribe={async (plan) => {
          await handleSubscribe(plan);
        }}
        onCancel={() => setPaywallVisible(false)}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  scroll: { padding: 20, paddingTop: 6 },
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: 16,
    width: 88,
    height: 88,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.border,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  // Empty state. Deliberately taller and warmer than the counter it replaces:
  // it is the only thing on the screen at that moment, so it should look like an
  // invitation rather than a gap where data will go.
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { color: colors.text, fontSize: 16.5, fontWeight: '800', textAlign: 'center' },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 16,
  },
  emptyBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  totalIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  totalNumber: { fontSize: 34, fontWeight: '800', color: colors.text, lineHeight: 38 },
  totalLabel: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  streakRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  streakCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warning + '33',
    ...shadow,
  },
  tokensIcon: {
    backgroundColor: colors.accent + '22',
  },
  streakIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.warning + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  streakNumber: { fontSize: 20, fontWeight: '800', color: colors.text },
  streakLabel: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  accountCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  subscribedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent + '22',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 10,
  },
  subscribedText: { color: colors.accent, fontWeight: '700', fontSize: 13, marginLeft: 6 },
  subscribeBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  subscribeBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  restoreLink: { alignItems: 'center', paddingVertical: 4 },
  restoreLinkText: { color: colors.textMuted, fontWeight: '600', fontSize: 12.5, textDecorationLine: 'underline' },
  passwordTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  passwordBody: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginBottom: 12 },
  passwordInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 12,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  categoryLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  categoryCount: { fontSize: 16, fontWeight: '800', color: colors.accentLight },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Matches privacyText's indent so the explanation lines up under its label
  // rather than under the icon.
  locationHint: {
    marginLeft: 10,
    marginTop: 3,
    marginRight: 6,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textMuted,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  languageRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  languageText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
  },
  recapTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  recapSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pushState: { color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  naturalistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: colors.warning + '22',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  naturalistPillText: { color: colors.warning, fontSize: 12.5, fontWeight: '700' },
  versionText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  deleteAccountBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.error + '55',
  },
  deleteAccountBtnText: { color: colors.error, fontWeight: '700', fontSize: 14 },
});
