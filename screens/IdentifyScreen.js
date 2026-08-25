import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '../components/theme';
import { identify } from '../components/identify';
import {
  trackScanStarted,
  trackScanCompleted,
  trackScanFailed,
  trackPaywallShown,
  trackPaywallDismissed,
} from '../components/tracking';
import { CATEGORIES } from '../components/categories';
import { startCheckout } from '../components/subscription';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import {
  candidateFact,
  candidateIdentityKey,
  createScanOutcomeRequest,
} from '../components/scanOutcome';
import { useAppAlert } from '../components/useAppAlert';
import { usePageShowReset } from '../components/usePageShowReset';
import CategoryIcon from '../components/CategoryIcon';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import FindThumb from '../components/FindThumb';
import MainScreenHeader from '../components/MainScreenHeader';
import { TopBarIcon } from '../components/TopBar';
import { getCollection } from '../components/storage';
import { getGroups } from '../components/groupContent';
import { updateDiscoveryPreferences } from '../components/discoveryPreferences';
import { saveIdentificationAutomatically } from '../components/automaticCollection';
import LensPulseButton from '../components/LensPulseButton';
import { sensoryFeedback } from '../components/sensoryFeedback';
import useReducedMotion from '../components/useReducedMotion';

// A divulgacao precisa nomear o fornecedor real antes de cada envio. A lista
// explicita tambem falha fechada se uma nova categoria fotografica for criada
// sem que suas praticas de dados tenham sido traduzidas e revisadas.
const PHOTO_CONSENT_BODY_KEY = {
  plant: 'photoConsentKindwiseBody',
  tree: 'photoConsentKindwiseBody',
  insect: 'photoConsentKindwiseBody',
  mushroom: 'photoConsentKindwiseBody',
  crop: 'photoConsentKindwiseBody',
  fish: 'photoConsentFishialBody',
  bird: 'photoConsentBirdBody',
};

export default function IdentifyScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, i18n } = useTranslation();
  const category = route.params?.category || 'plant';
  const meta = CATEGORIES[category];

  const [scanning, setScanning] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  // Foto no palco: the uri of the photo being analysed RIGHT NOW, staged inside
  // the viewfinder under the scan overlay - "analysing YOUR photo", not a
  // generic animation. Null (no uri available) falls back to the previous
  // gradient-only scanning view, byte for byte.
  const [stagePhotoUri, setStagePhotoUri] = useState(null);
  // O state muda apenas no proximo render. Esta trava sincrona impede que dois
  // toques no mesmo frame disparem dois provedores e criem dois achados.
  const scanInFlightRef = useRef(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const scanLoopRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  // Un-freezes the subscribe button when the page is restored from bfcache
  // after coming back from Hotmart's checkout (see usePageShowReset).
  usePageShowReset(useCallback(() => setSubscribing(false), []));

  // Achados recentes DESTA categoria, for the compact grid above the footer tip.
  // Loaded on focus, not on mount: a scan saved moments ago on the detail
  // screen has to appear the instant the user comes back. Newest first and
  // capped at 4, so this never fans out into "98 fetches on mount":
  // every locally-made find renders its own photoUri (a local file - zero
  // network), and only cloud-restored finds without one fall back to
  // FindThumb's cached Wikipedia chain - at most 4 requests, once, absorbed
  // by the speciesPhoto cache afterwards.
  const [recentFinds, setRecentFinds] = useState([]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getCollection().then((list) => {
        if (!alive) return;
        setRecentFinds(
          list
            .filter((i) => i.category === category)
            // savedAt is an ISO string, which sorts correctly as text - no
            // Date parsing (and no NaN comparator) needed.
            .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
            .slice(0, 4)
        );
      });
      return () => {
        alive = false;
      };
    }, [category])
  );

  const runScanAnimation = () => {
    scanLoopRef.current?.stop();
    scanLoopRef.current = null;
    scanAnim.setValue(reduceMotion ? 0.5 : 0);
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    scanLoopRef.current = loop;
    loop.start();
  };

  useEffect(() => () => {
    scanLoopRef.current?.stop();
    scanLoopRef.current = null;
  }, []);

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

  // Evidence tray. Slots keep their meaning (whole / close / another angle),
  // can be filled from camera OR gallery and are reviewed before anything is
  // sent. This fixes the old inverted flow, which photographed the two extras
  // first and submitted the main image immediately afterwards.
  //
  // Kindwise uses up to three photos of the same specimen in one request.
  // Fishial and Nyckel currently analyse one image, so those categories expose
  // one honest slot instead of decorative controls that the provider ignores.
  const MAX_PHOTOS = 3;
  const supportsMultiplePhotos = category !== 'fish' && category !== 'bird';
  const visiblePhotoSlots = supportsMultiplePhotos ? MAX_PHOTOS : 1;
  const [photoSlots, setPhotoSlots] = useState([null, null, null]);
  const [showExtraAngles, setShowExtraAngles] = useState(false);
  const photoSlotsRef = useRef(photoSlots);
  const handledCaptureRequest = useRef(null);

  const discardPreparedPhoto = (photo) => {
    if (Platform.OS === 'web' || !photo?.uri || !FileSystem.cacheDirectory) return;
    // Only remove the resized copy created in Expo's cache. Never touch the
    // person's original camera/gallery asset, even if a provider changes URI
    // behaviour in a future SDK.
    if (!photo.uri.startsWith(FileSystem.cacheDirectory)) return;
    FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => {});
  };

  useEffect(() => {
    photoSlotsRef.current = photoSlots;
  }, [photoSlots]);

  useEffect(() => {
    // Never carry evidence from one classifier into another when the category
    // changes through the picker or the bottom navigation.
    photoSlotsRef.current.forEach(discardPreparedPhoto);
    setPhotoSlots([null, null, null]);
    setShowExtraAngles(false);
    setStagePhotoUri(null);
    updateDiscoveryPreferences({ preferredCategory: category }).catch(() => undefined);
  }, [category]);

  // O manual tecnico de insetos e um arquivo localizado relativamente grande.
  // Comecar a busca quando a categoria abre esconde esse custo durante a
  // escolha/captura da foto; assim a ficha da abelha nao pisca apenas as tres
  // portas basicas antes de receber o guia de polinizadores.
  useEffect(() => {
    if (category !== 'insect') return;
    getGroups(i18n.language).catch(() => undefined);
  }, [category, i18n.language]);

  const selectedPhotos = photoSlots.slice(0, visiblePhotoSlots).filter(Boolean);
  const primaryPhoto = photoSlots[0];

  const runIdentification = async () => {
    if (!primaryPhoto || scanning || scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    const photos = photoSlots.slice(0, visiblePhotoSlots).filter(Boolean);
    setStagePhotoUri(primaryPhoto.uri || null);
    setScanning(true);
    runScanAnimation();
    trackScanStarted({
      category,
      source: photos.every((photo) => photo.fromLibrary)
        ? 'library'
        : photos.some((photo) => photo.fromLibrary)
          ? 'mixed'
          : 'camera',
      photoCount: photos.length,
    });
    let completed = false;
    try {
      const entity = await identify(category, photos.map((photo) => photo.base64));
      trackScanCompleted({
        category,
        confidence: entity.confidence,
        hasAlternatives: Boolean(entity.alternatives?.length),
      });
      // Uma frase curta pode vir de campos documentados diferentes por
      // categoria. candidateFact escolhe apenas o campo da propria entidade,
      // corta em limite de frase e falha fechado para identidade nao resolvida.
      const fact = candidateFact({ category, entity });
      const outcomeRequest = createScanOutcomeRequest({
        category,
        fact,
        identityKey: candidateIdentityKey(entity),
      });
      const identifiedEntity = { ...entity, photoUri: primaryPhoto.uri };
      const savedEntry = await saveIdentificationAutomatically(identifiedEntity, category);

      // A escrita local termina antes da navegacao. Assim a foto nao depende de
      // a pessoa encontrar um icone de salvar nem se perde ao fechar a ficha.
      // Recompensas continuam assincronas dentro do helper e nao atrasam a tela.
      navigation.navigate(meta.detailRoute, {
        plant: savedEntry || identifiedEntity,
        photoBase64: primaryPhoto.base64,
        fromIdentify: true,
        scanOutcomeRequest: outcomeRequest,
      });
      completed = true;
    } catch (err) {
      sensoryFeedback.error();
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
      scanInFlightRef.current = false;
      scanLoopRef.current?.stop();
      scanLoopRef.current = null;
      setScanning(false);
      setStagePhotoUri(null);
      // A failed request keeps the reviewed tray so an offline user can retry
      // instead of photographing the specimen all over again. A completed
      // result clears it before the next identification.
      if (completed) {
        // The primary photo continues into the result/collection. Extra
        // evidence is no longer needed once the provider has answered.
        photos.slice(1).forEach(discardPreparedPhoto);
        setPhotoSlots([null, null, null]);
        setShowExtraAngles(false);
      }
    }
  };

  const requestPhotoConsent = () => {
    const bodyKey = PHOTO_CONSENT_BODY_KEY[category];
    if (!primaryPhoto || !bodyKey) return;

    // O consentimento vale somente para este envio. Cancelar nao chama a
    // identificacao e confirmar e o unico caminho que entrega a foto a rede.
    showAlert(t('identify.photoConsentTitle'), t(`identify.${bodyKey}`), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('identify.photoConsentSend'),
        onPress: runIdentification,
      },
    ]);
  };

  const storePhotoInSlot = (slot, prepared, fromLibrary) => {
    sensoryFeedback.selection();
    discardPreparedPhoto(photoSlotsRef.current[slot]);
    setPhotoSlots((current) => {
      const next = [...current];
      next[slot] = {
        uri: prepared.uri,
        base64: prepared.base64,
        fromLibrary,
      };
      return next;
    });
  };

  const capturePhotoForSlot = async (slot) => {
    if (slot < 0 || slot >= visiblePhotoSlots) return;
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
      storePhotoInSlot(slot, prepared, false);
    } catch (err) {
      showAlert(t('identify.identificationFailedTitle'), t('identify.photoProcessingFailed'));
    }
  };

  const choosePhotoForSlot = async (slot) => {
    if (slot < 0 || slot >= visiblePhotoSlots) return;
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
      storePhotoInSlot(slot, prepared, true);
    } catch (err) {
      showAlert(t('identify.identificationFailedTitle'), t('identify.photoProcessingFailed'));
    }
  };

  // The raised dock action reaches the same camera path as a direct stage tap.
  // It never starts a network upload: provider consent remains an explicit,
  // per-upload decision after the person reviews the shot.
  useEffect(() => {
    const requestId = route.params?.captureRequestId;
    if (!requestId || handledCaptureRequest.current === requestId || scanning) return undefined;
    const timer = setTimeout(() => {
      if (handledCaptureRequest.current === requestId) return;
      handledCaptureRequest.current = requestId;
      capturePhotoForSlot(0);
      navigation.setParams({ captureRequestId: undefined });
    }, 0);
    return () => clearTimeout(timer);
  }, [route.params?.captureRequestId, category, scanning]);

  const removePhotoFromSlot = (index) => {
    sensoryFeedback.selection();
    if (index === 0) {
      photoSlotsRef.current.forEach(discardPreparedPhoto);
      setPhotoSlots([null, null, null]);
      setShowExtraAngles(false);
      return;
    }
    discardPreparedPhoto(photoSlotsRef.current[index]);
    setPhotoSlots((current) => current.map((photo, i) => (i === index ? null : photo)));
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

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 240],
  });
  // Depois da captura, o palco contem o controle Pulso Vivo e portanto deixa
  // de ser um botao. Isso evita HTML interativo aninhado no web e foco morto
  // no teclado/TalkBack, sem duplicar o conteudo visual do viewfinder.
  const ViewfinderContainer = primaryPhoto ? View : TouchableOpacity;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the root keeps backgroundColor underneath
          (see NatureScene.js / diagramacao-premium doctrine). */}
      <NatureScene accent={meta.accent} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <MainScreenHeader
          title={t('identify.identifierTitle', { category: t(`categories.${category}.label`) })}
          subtitle={t('identify.subtitle', {
            category: t(`categories.${category}.label`).toLowerCase(),
          })}
          right={
            <>
            {/* Settings pinned to every main screen's header, like the
                competitor's ever-present gear. Nested navigate bubbles to the
                tab navigator (same proven pattern as SubscribeFab). */}
            <TopBarIcon
              onPress={() => navigation.navigate('Profile', { screen: 'Settings' })}
              label={t('settings.title')}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TopBarIcon>
            </>
          }
        />

        {/* A maior dor dos concorrentes e surpresa comercial antes do primeiro
            resultado. Esta promessa fica antes da camera porque e verificavel:
            uma identificacao por categoria, sem conta e sem cartao. Nao e CTA
            de compra e permanece igual no Android. */}
        <View style={[styles.freePromise, { borderColor: meta.accent + '55' }]}>
          <Ionicons name="shield-checkmark-outline" size={17} color={meta.accent} />
          <Text style={styles.freePromiseText}>{t('identify.freePromise')}</Text>
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

        {/* Micro-animações da doutrina: press-scale by OUTER wrapper only -
            the Touchable below stays byte for byte (a11y, handlers, styles). */}
        <ViewfinderContainer
          style={styles.viewfinder}
          onPress={primaryPhoto ? undefined : () => capturePhotoForSlot(0)}
          disabled={primaryPhoto ? undefined : scanning}
          activeOpacity={primaryPhoto ? undefined : 0.86}
          accessible={!primaryPhoto || scanning}
          accessibilityRole={scanning ? 'progressbar' : primaryPhoto ? undefined : 'button'}
          accessibilityLiveRegion={scanning ? 'polite' : 'none'}
          accessibilityLabel={
            scanning
              ? t('identify.identifying')
              : primaryPhoto
                ? undefined
              : `${t('identify.poseWhole')}: ${t('identify.takePhotoLabel', {
                category: t(`categories.${category}.label`).toLowerCase(),
              })}`
          }
          accessibilityHint={scanning || primaryPhoto ? undefined : t(`categories.${category}.scanHint`)}
          accessibilityState={primaryPhoto && !scanning ? undefined : { disabled: scanning, busy: scanning }}
        >
          <LinearGradient
            colors={['#2c3a30', '#1b241e']}
            style={styles.viewfinderInner}
          >
            {scanning ? (
              <>
                {/* Foto no palco ("a arte É a tela"): the freshly taken photo
                    fills the viewfinder while it is analysed, with the scanline
                    and the overlay ON TOP - the scrim keeps spinner and label
                    legible over any photo. No uri -> neither renders and the
                    block behaves exactly as before. */}
                {stagePhotoUri ? (
                  <>
                    <Image
                      source={{ uri: stagePhotoUri }}
                      style={styles.stagePhoto}
                      resizeMode="cover"
                    />
                    <View style={styles.stageScrim} />
                  </>
                ) : null}
                <Animated.View
                  style={[
                    styles.scanLine,
                    { backgroundColor: meta.accent, shadowColor: meta.accent },
                    { transform: [{ translateY: scanTranslate }] },
                  ]}
                />
                <View style={styles.scanCenter}>
                  {reduceMotion ? (
                    <Ionicons name="scan-circle-outline" size={38} color={meta.accent} />
                  ) : (
                    <ActivityIndicator size="large" color={meta.accent} />
                  )}
                  <Text style={[styles.scanText, { color: meta.accent }]}>
                    {t('identify.analyzing', { category: t(`categories.${category}.label`).toLowerCase() })}
                  </Text>
                </View>
              </>
            ) : primaryPhoto ? (
              <>
                <Image
                  source={{ uri: primaryPhoto.uri }}
                  style={styles.stagePhoto}
                  resizeMode="cover"
                />
                <View style={styles.previewScrim} />
                <View style={styles.stagePulse}>
                  <LensPulseButton
                    key={primaryPhoto.uri}
                    accent={meta.accent}
                    disabled={scanning}
                    eyebrow={t('identify.lensPulseEyebrow')}
                    label={t('identify.holdToReveal')}
                    holdingLabel={t('identify.keepHolding')}
                    accessibilityHint={t('identify.holdToRevealHint')}
                    onComplete={requestPhotoConsent}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.scanCenter}>
                  <LinearGradient
                    colors={[meta.accent + '33', colors.surfaceElevated]}
                    style={[styles.viewfinderMark, { borderColor: meta.accent + '66' }]}
                  >
                    <View style={[styles.viewfinderMarkGlow, { backgroundColor: meta.accent }]} />
                    <CategoryIcon name={meta.icon} size={44} color={meta.accent} />
                  </LinearGradient>
                  <Text style={styles.viewfinderText}>{t('identify.readyToScan')}</Text>
                  {/* The instruction the removed hero card used to carry. Here it
                      is where someone is actually looking before they tap. */}
                  <Text style={styles.viewfinderHint} numberOfLines={2}>
                    {t(`categories.${category}.subtitle`)}
                  </Text>
                  <View style={[styles.cameraPrompt, { borderColor: meta.accent + '88' }]}>
                    <Ionicons name="camera-outline" size={18} color={meta.accent} />
                    <Text style={[styles.cameraPromptText, { color: meta.accent }]} numberOfLines={2}>
                      {t('identify.takePhotoLabel', {
                        category: t(`categories.${category}.label`).toLowerCase(),
                      })}
                    </Text>
                  </View>
                </View>
              </>
            )}
            {[styles.cTL, styles.cTR, styles.cBL, styles.cBR].map((c, i) => (
              <View key={i} style={[styles.corner, c, { borderColor: meta.accent }]} />
            ))}
          </LinearGradient>
        </ViewfinderContainer>

        {/* Before the first shot, the stage is the single obvious camera CTA.
            Gallery is available as a quiet alternative; the review tray and
            optional evidence do not compete for attention yet. */}
        {!primaryPhoto ? (
          <View style={styles.homeActions}>
            <PressScale style={styles.homeActionWrap}>
              <TouchableOpacity
                style={styles.homeAction}
                activeOpacity={0.82}
                onPress={() => choosePhotoForSlot(0)}
                disabled={scanning}
                accessibilityRole="button"
                accessibilityLabel={t('identify.uploadPhotoLabel')}
              >
                <LinearGradient
                  colors={[colors.info + '38', colors.surfaceElevated]}
                  style={[styles.homeActionIcon, { borderColor: colors.info + '55' }]}
                >
                  <View style={[styles.homeActionShine, { backgroundColor: colors.info }]} />
                  <Ionicons name="images-outline" size={21} color={colors.info} />
                </LinearGradient>
                <Text style={styles.homeActionText}>{t('identify.uploadPhoto')}</Text>
              </TouchableOpacity>
            </PressScale>
            <PressScale style={styles.homeActionWrap}>
              <TouchableOpacity
                style={styles.homeAction}
                activeOpacity={0.82}
                onPress={() => navigation.getParent()?.navigate('Collection')}
                accessibilityRole="button"
                accessibilityLabel={t('identify.goToCollectionLabel')}
              >
                <LinearGradient
                  colors={[colors.warning + '38', colors.surfaceElevated]}
                  style={[styles.homeActionIcon, { borderColor: colors.warning + '55' }]}
                >
                  <View style={[styles.homeActionShine, { backgroundColor: colors.warning }]} />
                  <Ionicons name="file-tray-full-outline" size={21} color={colors.warning} />
                </LinearGradient>
                <Text style={styles.homeActionText}>{t('identify.myCollection')}</Text>
              </TouchableOpacity>
            </PressScale>
            <PressScale style={styles.homeActionWrap}>
              <TouchableOpacity
                style={styles.homeAction}
                activeOpacity={0.82}
                onPress={() => navigation.getParent()?.navigate('Discover')}
                accessibilityRole="button"
                accessibilityLabel={t('common.tabDiscover')}
              >
                <LinearGradient
                  colors={[colors.purple + '38', colors.surfaceElevated]}
                  style={[styles.homeActionIcon, { borderColor: colors.purple + '55' }]}
                >
                  <View style={[styles.homeActionShine, { backgroundColor: colors.purple }]} />
                  <Ionicons name="book-outline" size={21} color={colors.purple} />
                </LinearGradient>
                <Text style={styles.homeActionText}>{t('common.tabDiscover')}</Text>
              </TouchableOpacity>
            </PressScale>
            <PressScale style={styles.homeActionWrap}>
              <TouchableOpacity
                style={styles.homeAction}
                activeOpacity={0.82}
                onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'Community' })}
                accessibilityRole="button"
                accessibilityLabel={t('community.title')}
              >
                <LinearGradient
                  colors={[meta.accent + '38', colors.surfaceElevated]}
                  style={[styles.homeActionIcon, { borderColor: meta.accent + '55' }]}
                >
                  <View style={[styles.homeActionShine, { backgroundColor: meta.accent }]} />
                  <Ionicons name="podium-outline" size={21} color={meta.accent} />
                </LinearGradient>
                <Text style={styles.homeActionText}>{t('community.title')}</Text>
              </TouchableOpacity>
            </PressScale>
          </View>
        ) : (
          /* After a shot, review and consent become the dominant next step.
             Extra angles remain progressive disclosure, never an up-front
             three-row form. */
          <View style={styles.photoPlan}>
            <Text style={styles.photoReadyTitle}>{t('identify.photoReady')}</Text>
            <View style={styles.photoSlotRow}>
              <TouchableOpacity
                style={styles.photoSlotThumbButton}
                onPress={() => removePhotoFromSlot(0)}
                disabled={scanning}
                accessibilityRole="button"
                accessibilityLabel={t('identify.removeAngleLabel', { index: 1 })}
              >
                <Image source={{ uri: primaryPhoto.uri }} style={styles.photoSlotThumb} />
                <View style={styles.photoSlotRemoveBadge}>
                  <Ionicons name="close" size={11} color={colors.white} />
                </View>
              </TouchableOpacity>
              <Text style={styles.photoSlotLabel}>{t('identify.poseWhole')}</Text>
              <TouchableOpacity
                style={styles.slotAction}
                onPress={() => capturePhotoForSlot(0)}
                disabled={scanning}
                accessibilityRole="button"
                accessibilityState={{ disabled: scanning }}
                accessibilityLabel={`${t('identify.poseWhole')}: ${t('identify.takePhotoLabel', {
                  category: t(`categories.${category}.label`).toLowerCase(),
                })}`}
              >
                <Ionicons name="camera-outline" size={20} color={scanning ? colors.textMuted : meta.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.slotAction}
                onPress={() => choosePhotoForSlot(0)}
                disabled={scanning}
                accessibilityRole="button"
                accessibilityState={{ disabled: scanning }}
                accessibilityLabel={`${t('identify.poseWhole')}: ${t('identify.uploadPhotoLabel')}`}
              >
                <Ionicons name="images-outline" size={20} color={scanning ? colors.textMuted : colors.info} />
              </TouchableOpacity>
            </View>

            {supportsMultiplePhotos ? (
              <>
                <TouchableOpacity
                  style={styles.anglesToggle}
                  activeOpacity={0.8}
                  onPress={() => setShowExtraAngles((visible) => !visible)}
                  disabled={scanning}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: scanning, expanded: showExtraAngles }}
                >
                  <Ionicons name="layers-outline" size={19} color={meta.accent} />
                  <Text style={styles.anglesToggleLabel}>
                    {t(showExtraAngles
                      ? 'identify.hideOptionalAngles'
                      : 'identify.addOptionalAngles')}
                  </Text>
                  <Ionicons
                    name={showExtraAngles ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>

                {showExtraAngles
                  ? Array.from({ length: visiblePhotoSlots - 1 }, (_, offset) => offset + 1).map((index) => {
                    const photo = photoSlots[index];
                    const label = index === 1 ? t('identify.poseClose') : t('identify.poseOther');
                    return (
                      <View style={styles.photoSlotRow} key={index}>
                        {photo ? (
                          <TouchableOpacity
                            style={styles.photoSlotThumbButton}
                            onPress={() => removePhotoFromSlot(index)}
                            disabled={scanning}
                            accessibilityRole="button"
                            accessibilityLabel={t('identify.removeAngleLabel', { index: index + 1 })}
                          >
                            <Image source={{ uri: photo.uri }} style={styles.photoSlotThumb} />
                            <View style={styles.photoSlotRemoveBadge}>
                              <Ionicons name="close" size={11} color={colors.white} />
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.photoSlotEmpty, { borderColor: meta.accent + '66' }]}>
                            <Text style={[styles.photoSlotNumber, { color: meta.accent }]}>{index + 1}</Text>
                          </View>
                        )}
                        <Text style={styles.photoSlotLabel}>{label}</Text>
                        <TouchableOpacity
                          style={styles.slotAction}
                          onPress={() => capturePhotoForSlot(index)}
                          disabled={scanning}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: scanning }}
                          accessibilityLabel={`${label}: ${t('identify.takePhotoLabel', {
                            category: t(`categories.${category}.label`).toLowerCase(),
                          })}`}
                        >
                          <Ionicons name="camera-outline" size={20} color={scanning ? colors.textMuted : meta.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.slotAction}
                          onPress={() => choosePhotoForSlot(index)}
                          disabled={scanning}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: scanning }}
                          accessibilityLabel={`${label}: ${t('identify.uploadPhotoLabel')}`}
                        >
                          <Ionicons name="images-outline" size={20} color={scanning ? colors.textMuted : colors.info} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                  : null}
              </>
            ) : null}

            {showExtraAngles && selectedPhotos.length > 1 ? (
              <Text style={styles.anglesHint}>
                {t('identify.anglesHint', { count: selectedPhotos.length })}
              </Text>
            ) : null}
          </View>
        )}

        {!primaryPhoto ? (
          <View style={styles.homeCompactStack}>
            <View style={styles.homeSignal}>
              <View style={[styles.homeSignalIcon, { backgroundColor: meta.accent + '22' }]}>
                <CategoryIcon name={meta.tabIcon} size={18} color={meta.accent} />
              </View>
              <View style={styles.homeSignalCopy}>
                <Text style={styles.homeSignalTitle} numberOfLines={1}>
                  {t(`categories.${category}.label`)}
                </Text>
                <Text style={styles.homeSignalBody} numberOfLines={2}>
                  {t(`categories.${category}.subtitle`)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.homeSignal}
              activeOpacity={0.84}
              onPress={() => navigation.getParent()?.navigate('Profile', { screen: 'Community' })}
              accessibilityRole="button"
              accessibilityLabel={t('community.entryTitle')}
            >
              <View style={[styles.homeSignalIcon, { backgroundColor: colors.info + '22' }]}>
                <Ionicons name="people-outline" size={18} color={colors.info} />
              </View>
              <View style={styles.homeSignalCopy}>
                <Text style={styles.homeSignalTitle} numberOfLines={1}>
                  {t('community.entryTitle')}
                </Text>
                <Text style={styles.homeSignalBody} numberOfLines={2}>
                  {t('community.entrySubtitle')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={17} color={meta.accent} />
            </TouchableOpacity>
            <View style={styles.homeTipInline}>
              <Ionicons
                name="bulb"
                size={17}
                color={colors.warning}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={styles.homeTipInlineText} numberOfLines={3}>
                {t(`categories.${category}.scanHint`)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Achados recentes: the user's latest finds of THIS category as a
            compact two-column grid, never another hidden horizontal rail.
            Renders only when there is at least one find. Reuses FindThumb:
            the same photo-priority chain (own photo -> Wikipedia by scientific
            name -> category icon) as the Collection, with its icon fallback,
            so this strip can never render broken offline. */}
        {recentFinds.length > 0 && (
          <View style={styles.recentSection}>
            <TouchableOpacity
              style={styles.recentHeader}
              onPress={() => navigation.getParent()?.navigate('Collection')}
              accessibilityRole="button"
              accessibilityLabel={t('identify.goToCollectionLabel')}
            >
              <Text style={styles.recentTitle}>{t('identify.myCollection')}</Text>
              <Ionicons name="arrow-forward" size={18} color={meta.accent} />
            </TouchableOpacity>
            <View style={styles.recentGrid}>
            {recentFinds.slice(0, 4).map((item) => (
              <TouchableOpacity
                key={item.savedId}
                style={styles.recentItem}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.getParent()?.navigate('Collection', {
                    screen: 'Specimen',
                    params: { savedId: item.savedId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={t('collection.viewDetailsLabel', {
                  name: item.nickname || item.name,
                })}
              >
                <FindThumb
                  photoUri={item.photoUri}
                  referencePhoto={item.referencePhoto}
                  similarImages={item.similarImages}
                  scientific={item.scientific}
                  icon={meta.tabIcon}
                  accent={meta.accent}
                  iconSize={26}
                  style={styles.recentThumb}
                />
                <Text style={styles.recentName} numberOfLines={1}>
                  {item.nickname || item.name}
                </Text>
              </TouchableOpacity>
            ))}
            </View>
          </View>
        )}

        {primaryPhoto ? (
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
        ) : null}
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  freePromise: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
  },
  freePromiseText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  viewfinder: { alignItems: 'center', marginBottom: 6, marginTop: 6 },
  viewfinderInner: {
    width: '100%',
    height: 188,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanCenter: { alignItems: 'center', paddingHorizontal: 28 },
  viewfinderMark: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  viewfinderMarkGlow: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.9,
  },
  viewfinderText: { color: colors.text, marginTop: 10, fontWeight: '800', fontSize: 15.5 },
  viewfinderHint: {
    color: colors.textMuted,
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  scanText: { marginTop: 12, fontWeight: '600' },
  // Foto no palco: the staged photo fills the viewfinder interior; the scrim is
  // the background tone at ~60% so the scanline/spinner/label stay readable.
  stagePhoto: { ...StyleSheet.absoluteFillObject },
  stageScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + '99' },
  previewScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + '33' },
  stagePulse: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 4,
  },
  cameraPrompt: {
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.background + 'CC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  cameraPromptText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
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
  homeActions: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  homeActionWrap: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  homeAction: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  homeActionShine: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    opacity: 0.9,
  },
  homeActionText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  homeCompactStack: {
    marginTop: 10,
    gap: 8,
  },
  homeSignal: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  homeSignalIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeSignalCopy: { flex: 1 },
  homeSignalTitle: {
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '900',
  },
  homeSignalBody: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
    fontWeight: '600',
  },
  homeTipInline: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  homeTipInlineText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  photoPlan: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
  },
  photoReadyTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    paddingTop: 11,
  },
  photoSlotRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  photoSlotThumbButton: { width: 46, height: 46 },
  photoSlotThumb: { width: 46, height: 46, borderRadius: 12 },
  photoSlotRemoveBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    borderWidth: 1,
    borderColor: colors.card,
  },
  photoSlotEmpty: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  photoSlotNumber: { fontSize: 14, fontWeight: '900' },
  photoSlotLabel: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  slotAction: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  anglesHint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 17, textAlign: 'center', paddingVertical: 8 },
  identifyButtonWrap: { marginBottom: 10 },
  identifyButton: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  identifyButtonDisabled: { opacity: 0.4 },
  identifyButtonText: { color: colors.white, fontSize: 14.5, lineHeight: 20, fontWeight: '800' },
  anglesToggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  anglesToggleLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
  },
  recentSection: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
  },
  recentHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recentItem: {
    width: '48%',
    flexGrow: 1,
    minWidth: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 8,
  },
  recentThumb: { width: 48, height: 48, borderRadius: 12 },
  recentName: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
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
