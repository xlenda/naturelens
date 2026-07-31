import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors } from '../components/theme';
import { identify } from '../components/identify';
import {
  trackScanStarted,
  trackScanCompleted,
  trackScanFailed,
  trackPaywallShown,
  trackPaywallDismissed,
  trackAchievementUnlocked,
} from '../components/tracking';
import { CATEGORIES, CATEGORY_LIST } from '../components/categories';
import { startCheckout } from '../components/subscription';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import RevealFactModal from '../components/RevealFactModal';
import AchievementUnlockedModal from '../components/AchievementUnlockedModal';
import { recordIdentification, evaluateAchievements, addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { useAppAlert } from '../components/useAppAlert';
import { usePageShowReset } from '../components/usePageShowReset';
import CategoryIcon from '../components/CategoryIcon';

export default function IdentifyScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const category = route.params?.category || 'plant';
  const meta = CATEGORIES[category];

  const [scanning, setScanning] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [revealFact, setRevealFact] = useState(null);
  const [pendingNav, setPendingNav] = useState(null);
  const [unlockedIds, setUnlockedIds] = useState(null);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  // Un-freezes the subscribe button when the page is restored from bfcache
  // after coming back from Hotmart's checkout (see usePageShowReset).
  usePageShowReset(useCallback(() => setSubscribing(false), []));

  const runScanAnimation = () => {
    scanAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  };

  // Real phone photos (12MP+) easily exceed Vercel's 4.5MB serverless request
  // body limit once base64-encoded, even with launchCameraAsync's `quality`
  // compression alone - that only reduces JPEG quality, not resolution. Cap
  // the longest dimension so uploads stay comfortably under that limit.
  const prepareForUpload = async (asset) => {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return manipulated;
  };

  // Extra angles of the SAME specimen, queued before running the scan. Kindwise
  // uses every photo it is given for one identification and gets measurably
  // better at it - a leaf close-up plus the whole plant beats either alone.
  // Capped at 3 total (see MAX_IMAGES server-side; also keeps the request body
  // under Vercel's 4.5MB limit).
  const MAX_PHOTOS = 3;
  const [extraPhotos, setExtraPhotos] = useState([]);

  const runIdentification = async (photo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScanning(true);
    runScanAnimation();
    trackScanStarted({
      category,
      source: photo.fromLibrary ? 'library' : 'camera',
      photoCount: extraPhotos.length + 1,
    });
    try {
      // The queued extras go FIRST-added-first; the freshly taken photo is the
      // primary one, so it leads the list.
      const entity = await identify(category, [photo.base64, ...extraPhotos.map((p) => p.base64)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackScanCompleted({
        category,
        confidence: entity.confidence,
        hasAlternatives: Boolean(entity.alternatives?.length),
      });
      await recordIdentification();
      // Missions completed by this scan pay out immediately - the mission map
      // is idempotent, so a double invocation can never pay twice.
      const completedMissions = await recordMissionEvent('scan', { category });
      if (completedMissions.length) await addTokens(completedMissions.length * TOKENS_PER_MISSION);
      const { newlyUnlocked } = await evaluateAchievements();
      const navParams = {
        plant: { ...entity, photoUri: photo.uri },
        photoBase64: photo.base64,
        fromIdentify: true,
      };
      // Plant.id is the only Kindwise API that returns cultural-significance/
      // common-uses text (confirmed live, see project memory) - insect.id and
      // mushroom.id have no equivalent field. Trees hit the exact same Plant.id
      // model (see the `tree` entry in api/identify.js), so they carry the same
      // fields.
      const fact = category === 'plant' || category === 'tree' ? entity.culturalSignificance || entity.commonUses : null;
      const hasAchievements = newlyUnlocked.length > 0;
      newlyUnlocked.forEach((id) => trackAchievementUnlocked({ achievementId: id }));
      if (fact || hasAchievements) {
        setPendingNav(navParams);
        if (fact) setRevealFact(fact);
        if (hasAchievements) setUnlockedIds(newlyUnlocked);
      } else {
        navigation.navigate(meta.detailRoute, navParams);
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err.paymentRequired) {
        // The paywall firing is the business model working, not a failure -
        // tracked as its own funnel step so conversion has a denominator.
        trackScanFailed({ category, reason: 'payment_required' });
        trackPaywallShown({ trigger: 'free_limit', category });
        setPaywallVisible(true);
        return;
      }
      // Offline is not a failure of the app - say so plainly instead of
      // showing a generic "something went wrong", which reads as broken.
      if (err.offline) {
        trackScanFailed({ category, reason: 'offline' });
        showAlert(t('identify.offlineTitle'), t('identify.offlineBody'));
        return;
      }
      trackScanFailed({ category, reason: 'api_error' });
      showAlert(t('identify.identificationFailedTitle'), err.message || t('identify.identificationFailedDefault'));
    } finally {
      setScanning(false);
      // Always clear, success or failure: keeping stale angles would silently
      // attach them to the NEXT, unrelated specimen the user photographs.
      setExtraPhotos([]);
    }
  };

  // Adds one more angle to the queue without running an identification.
  const handleAddAngle = async () => {
    if (extraPhotos.length >= MAX_PHOTOS - 1) return;
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert(
            t('identify.cameraPermissionTitle'),
            t('identify.cameraPermissionMessage', { category: t(`categories.${category}.label`).toLowerCase() })
          );
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
      if (result.canceled || !result.assets?.[0]) return;
      const prepared = await prepareForUpload(result.assets[0]);
      Haptics.selectionAsync();
      setExtraPhotos((prev) => [...prev, { uri: prepared.uri, base64: prepared.base64 }]);
    } catch (err) {
      showAlert(t('identify.identificationFailedTitle'), t('identify.photoProcessingFailed'));
    }
  };

  const removeAngle = (index) => {
    Haptics.selectionAsync();
    setExtraPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRevealContinue = () => {
    setRevealFact(null);
    if (!unlockedIds || unlockedIds.length === 0) {
      const navParams = pendingNav;
      setPendingNav(null);
      if (navParams) navigation.navigate(meta.detailRoute, navParams);
    }
    // else: dismissing the fact card reveals the achievement modal
    // (rendered whenever revealFact is empty and unlockedIds is set) -
    // navigation happens once that's dismissed too, see handleAchievementDone.
  };

  const handleAchievementDone = () => {
    setUnlockedIds(null);
    const navParams = pendingNav;
    setPendingNav(null);
    if (navParams) navigation.navigate(meta.detailRoute, navParams);
  };

  const handleSubscribe = async (plan) => {
    setSubscribing(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setSubscribing(false);
      showAlert(t('identify.identificationFailedTitle'), e.message);
    }
  };

  const handleScan = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert(
            t('identify.cameraPermissionTitle'),
            t('identify.cameraPermissionMessage', { category: t(`categories.${category}.label`).toLowerCase() })
          );
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const prepared = await prepareForUpload(result.assets[0]);
      runIdentification(prepared);
    } catch (err) {
      showAlert(t('identify.identificationFailedTitle'), t('identify.photoProcessingFailed'));
    }
  };

  const handleUpload = async () => {
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
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const prepared = await prepareForUpload(result.assets[0]);
      // prepareForUpload returns a fresh object, so the source flag is
      // attached here - camera scans and library uploads can have very
      // different funnel success rates and are tracked apart.
      runIdentification({ ...prepared, fromLibrary: true });
    } catch (err) {
      showAlert(t('identify.identificationFailedTitle'), t('identify.photoProcessingFailed'));
    }
  };

  const handleSwitchCategory = () => {
    const others = CATEGORY_LIST.filter((c) => c.key !== category);
    showAlert(
      t('identify.switchCategoryTitle'),
      t('identify.switchCategoryMessage'),
      [
        ...others.map((c) => ({
          text: c.tabLabel,
          onPress: () => navigation.getParent()?.navigate(c.tabLabel),
        })),
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hello} accessibilityRole="header">
              {t('identify.identifierTitle', { category: t(`categories.${category}.label`) })}
            </Text>
            <Text style={styles.subtitle}>
              {t('identify.subtitle', { category: t(`categories.${category}.label`).toLowerCase() })}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.logoBadge, { backgroundColor: meta.accentDark }]}
            activeOpacity={0.8}
            onPress={handleSwitchCategory}
            accessibilityRole="button"
            accessibilityLabel={t('identify.switchCategoryLabel')}
          >
            <CategoryIcon name={meta.tabIcon} size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* The big gradient hero used to sit here, and it said the same thing
            the header above already says: "Plant Identifier / Identify plants
            instantly with AI" followed by "Identify Plants and Trees Instantly /
            Point the camera at any plant...". Two headlines, one message, about
            180px of the screen - which is exactly what was pushing the shutter
            button below the fold on a 390x844 phone. Removing it costs no
            information and buys back the primary action. The category subtitle
            it carried now sits under the viewfinder, where it reads as an
            instruction rather than a second banner. */}

        <TouchableOpacity
          style={styles.viewfinder}
          activeOpacity={0.85}
          onPress={handleScan}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel={
            scanning
              ? t('identify.identifying')
              : t('identify.takePhotoLabel', { category: t(`categories.${category}.label`).toLowerCase() })
          }
        >
          <LinearGradient
            colors={['#2c3a30', '#1b241e']}
            style={styles.viewfinderInner}
          >
            {scanning ? (
              <>
                <Animated.View
                  style={[
                    styles.scanLine,
                    { backgroundColor: meta.accent, shadowColor: meta.accent },
                    { transform: [{ translateY: scanTranslate }] },
                  ]}
                />
                <View style={styles.scanCenter}>
                  <ActivityIndicator size="large" color={meta.accent} />
                  <Text style={[styles.scanText, { color: meta.accent }]}>
                    {t('identify.analyzing', { category: t(`categories.${category}.label`).toLowerCase() })}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.scanCenter}>
                <CategoryIcon name={meta.icon} size={56} color={meta.accent} />
                <Text style={styles.viewfinderText}>{t('identify.readyToScan')}</Text>
                {/* The instruction the removed hero card used to carry. Here it
                    is where someone is actually looking before they tap. */}
                <Text style={styles.viewfinderHint}>{t(`categories.${category}.subtitle`)}</Text>
              </View>
            )}
            {[styles.cTL, styles.cTR, styles.cBL, styles.cBR].map((c, i) => (
              <View key={i} style={[styles.corner, c, { borderColor: meta.accent }]} />
            ))}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.shutterWrap}
          onPress={handleScan}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel={
            scanning
              ? t('identify.identifying')
              : t('identify.takePhotoLabel', { category: t(`categories.${category}.label`).toLowerCase() })
          }
        >
          <View style={[styles.shutterOuter, { borderColor: meta.accent }, scanning && { opacity: 0.5 }]}>
            <View style={[styles.shutterInner, { backgroundColor: meta.accent }]}>
              <Ionicons name="camera" size={30} color={colors.white} />
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.shutterLabel}>
          {scanning ? t('identify.identifying') : t('identify.tapToIdentify')}
        </Text>

        {/* Multi-angle queue. Only offered where it actually helps: fish and
            bird vendors take a single image, so promising extra angles there
            would be a feature that quietly does nothing. */}
        {category !== 'fish' && category !== 'bird' && (
          <View style={styles.anglesBlock}>
            {extraPhotos.length > 0 && (
              <View style={styles.anglesRow}>
                {extraPhotos.map((p, i) => (
                  <TouchableOpacity
                    key={p.uri + i}
                    style={styles.angleThumbWrap}
                    onPress={() => removeAngle(i)}
                    disabled={scanning}
                    accessibilityRole="button"
                    accessibilityLabel={t('identify.removeAngleLabel', { index: i + 1 })}
                  >
                    <Image source={{ uri: p.uri }} style={styles.angleThumb} />
                    <View style={styles.angleRemove}>
                      <Ionicons name="close" size={12} color={colors.white} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {extraPhotos.length < MAX_PHOTOS - 1 && !scanning && (
              <TouchableOpacity
                style={styles.addAngleBtn}
                activeOpacity={0.8}
                onPress={handleAddAngle}
                accessibilityRole="button"
                accessibilityLabel={t('identify.addAngle')}
              >
                <Ionicons name="add-circle-outline" size={17} color={meta.accent} />
                <Text style={[styles.addAngleText, { color: meta.accent }]}>
                  {extraPhotos.length === 0 ? t('identify.addAngle') : t('identify.addAnotherAngle')}
                </Text>
              </TouchableOpacity>
            )}

            {extraPhotos.length > 0 && (
              <Text style={styles.anglesHint}>
                {t('identify.anglesHint', { count: extraPhotos.length + 1 })}
              </Text>
            )}
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.8}
            onPress={handleUpload}
            disabled={scanning}
            accessibilityRole="button"
            accessibilityLabel={t('identify.uploadPhotoLabel')}
          >
            <Ionicons
              name="images-outline"
              size={20}
              color={colors.info}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.actionText}>{t('identify.uploadPhoto')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.8}
            onPress={() => navigation.getParent()?.navigate('Collection')}
            accessibilityRole="button"
            accessibilityLabel={t('identify.goToCollectionLabel')}
          >
            <Ionicons
              name="file-tray-full-outline"
              size={20}
              color={colors.warning}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.actionText}>{t('identify.myCollection')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tipCard}>
          <Ionicons
            name="bulb"
            size={18}
            color={colors.warning}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.tipText}>{t(`categories.${category}.scanHint`)}</Text>
        </View>
      </ScrollView>
      <PaywallModal
        visible={paywallVisible}
        categoryLabel={t(`categories.${category}.label`).toLowerCase()}
        accent={meta.accent}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onCancel={() => {
          trackPaywallDismissed({ trigger: 'free_limit' });
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

      <RevealFactModal
        visible={!!revealFact}
        fact={revealFact}
        onContinue={handleRevealContinue}
      />

      <AchievementUnlockedModal
        ids={!revealFact ? unlockedIds : null}
        onDone={handleAchievementDone}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  hello: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  logoBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: { alignItems: 'center', marginBottom: 8, marginTop: 18 },
  viewfinderInner: {
    width: '100%',
    height: 300,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanCenter: { alignItems: 'center', paddingHorizontal: 28 },
  viewfinderText: { color: colors.text, marginTop: 12, fontWeight: '700', fontSize: 15.5 },
  viewfinderHint: {
    color: colors.textMuted,
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  scanText: { marginTop: 12, fontWeight: '600' },
  scanLine: {
    position: 'absolute',
    top: 20,
    width: '86%',
    height: 2,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
  },
  cTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  shutterWrap: { alignItems: 'center', marginTop: 20 },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterLabel: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 10,
    fontWeight: '600',
  },
  anglesBlock: { alignItems: 'center', marginTop: 14, gap: 10 },
  anglesRow: { flexDirection: 'row', gap: 8 },
  angleThumbWrap: { position: 'relative' },
  angleThumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  angleRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAngleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addAngleText: { fontSize: 12.5, fontWeight: '700' },
  anglesHint: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { color: colors.text, fontWeight: '600', marginTop: 8, fontSize: 13 },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 13, marginLeft: 10, lineHeight: 18 },
});
