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
import { getSpeciesPhoto } from '../components/speciesPhoto';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import FindThumb from '../components/FindThumb';
import { getCollection } from '../components/storage';

// Foto-exemplo do palco (pedido do dono: "cada parte onde ele clica pra tirar
// foto tem que ter alguma foto ali" - no video do concorrente cada ponto de
// captura mostra uma imagem de exemplo). Um exemplar REAL e fotogenico por
// categoria, buscado pela mesma cadeia Wikipedia do FindThumb (cache embutido,
// zero chave nova). Categoria fora desta lista = sem foto = palco atual.
const EXEMPLAR_SCI = {
  plant: 'Plumeria rubra',
  insect: 'Coccinella septempunctata',
  mushroom: 'Amanita muscaria',
  crop: 'Zea mays',
  fish: 'Betta splendens',
  bird: 'Cyanistes caeruleus',
  sound: 'Turdus merula',
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
  const [revealFact, setRevealFact] = useState(null);
  const [pendingNav, setPendingNav] = useState(null);
  const [unlockedIds, setUnlockedIds] = useState(null);
  // Foto no palco: the uri of the photo being analysed RIGHT NOW, staged inside
  // the viewfinder under the scan overlay - "analysing YOUR photo", not a
  // generic animation. Null (no uri available) falls back to the previous
  // gradient-only scanning view, byte for byte.
  const [stagePhotoUri, setStagePhotoUri] = useState(null);
  // Foto-exemplo: fundo do palco PARADO (sem scan em andamento). null = offline
  // ou especie sem foto -> o palco fica byte a byte identico ao atual.
  const [exemplarPhoto, setExemplarPhoto] = useState(null);
  useEffect(() => {
    let alive = true;
    // Trocar de categoria zera na hora: o exemplar da categoria anterior nunca
    // pode aparecer atras do icone da nova enquanto a busca (cacheada) resolve.
    setExemplarPhoto(null);
    // getSpeciesPhoto nunca lanca (contrato do speciesPhoto.js) e resolve null
    // para categorias fora do EXEMPLAR_SCI - o then basta.
    getSpeciesPhoto(EXEMPLAR_SCI[category], i18n.language).then((photo) => {
      if (alive) setExemplarPhoto(photo);
    });
    return () => {
      alive = false;
    };
  }, [category, i18n.language]);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  // Un-freezes the subscribe button when the page is restored from bfcache
  // after coming back from Hotmart's checkout (see usePageShowReset).
  usePageShowReset(useCallback(() => setSubscribing(false), []));

  // Achados recentes DESTA categoria, for the strip above the footer tip.
  // Loaded on focus, not on mount: a scan saved moments ago on the detail
  // screen has to appear the instant the user comes back. Newest first and
  // capped at 8, so this never fans out into "98 fetches on mount":
  // every locally-made find renders its own photoUri (a local file - zero
  // network), and only cloud-restored finds without one fall back to
  // FindThumb's cached Wikipedia chain - at most 8 requests, once, absorbed
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
            .slice(0, 8)
        );
      });
      return () => {
        alive = false;
      };
    }, [category])
  );

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
    setStagePhotoUri(photo.uri || null);
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
      setStagePhotoUri(null);
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
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the root keeps backgroundColor underneath
          (see NatureScene.js / diagramacao-premium doctrine). */}
      <NatureScene accent={meta.accent} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.hello} accessibilityRole="header">
              {t('identify.identifierTitle', { category: t(`categories.${category}.label`) })}
            </Text>
            <Text style={styles.subtitle}>
              {t('identify.subtitle', { category: t(`categories.${category}.label`).toLowerCase() })}
            </Text>
          </View>
          <View style={styles.headerBtns}>
            {/* Settings pinned to every main screen's header, like the
                competitor's ever-present gear. Nested navigate bubbles to the
                tab navigator (same proven pattern as SubscribeFab). */}
            <TouchableOpacity
              style={styles.gearBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Profile', { screen: 'Settings' })}
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
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
        <PressScale>
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
                  <ActivityIndicator size="large" color={meta.accent} />
                  <Text style={[styles.scanText, { color: meta.accent }]}>
                    {t('identify.analyzing', { category: t(`categories.${category}.label`).toLowerCase() })}
                  </Text>
                </View>
              </>
            ) : (
              <>
                {/* Foto-exemplo (pedido do dono): o ponto de captura mostra um
                    exemplar real da categoria, como no video do concorrente.
                    REGRA DURA: o scrim (fundo a ~70%) fica ENTRE a foto e o
                    titulo/subtitulo, entao a foto nunca atrapalha a leitura -
                    e sem foto nada disto renderiza (palco atual intacto). */}
                {exemplarPhoto ? (
                  <>
                    <Image
                      source={{ uri: exemplarPhoto.url }}
                      style={styles.stagePhoto}
                      resizeMode="cover"
                    />
                    <View style={styles.exemplarScrim} />
                  </>
                ) : null}
                <View style={styles.scanCenter}>
                  <CategoryIcon name={meta.icon} size={56} color={meta.accent} />
                  <Text style={styles.viewfinderText}>{t('identify.readyToScan')}</Text>
                  {/* The instruction the removed hero card used to carry. Here it
                      is where someone is actually looking before they tap. */}
                  <Text style={styles.viewfinderHint}>{t(`categories.${category}.subtitle`)}</Text>
                </View>
                {/* Credito minusculo SO quando a foto esta visivel - nunca
                    apresentar foto de terceiro como nossa (doutrina do
                    speciesPhoto.js). Chave existente, nenhuma nova. */}
                {exemplarPhoto ? (
                  <Text style={styles.exemplarCredit} numberOfLines={1}>
                    {t('fieldGuide.photoCredit')}
                  </Text>
                ) : null}
              </>
            )}
            {[styles.cTL, styles.cTR, styles.cBL, styles.cBR].map((c, i) => (
              <View key={i} style={[styles.corner, c, { borderColor: meta.accent }]} />
            ))}
          </LinearGradient>
        </TouchableOpacity>
        </PressScale>

        {/* Press-scale por wrapper EXTERNO (doutrina) - shutter unchanged inside. */}
        <PressScale scaleTo={0.93}>
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
        </PressScale>
        <Text style={styles.shutterLabel}>
          {scanning ? t('identify.identifying') : t('identify.tapToIdentify')}
        </Text>

        {/* Modo 3 fotos GUIADO (o "360" do concorrente, visto no video: tres
            slots de miniatura visiveis na camera com a pose de cada um). O
            obturador grande tira a foto principal (Inteiro); os dois slots
            seguintes abrem a camera para De perto e Outro angulo - so o
            PROXIMO slot vazio fica ativo, entao a sequencia se ensina sozinha.
            Kindwise: as 3 fotos viajam num request so = 1 credito. So onde o
            vendor realmente usa varias fotos (fish/bird ficam de fora). */}
        {category !== 'fish' && category !== 'bird' && (
          <View style={styles.anglesBlock}>
            <View style={styles.poseRow}>
              <View style={styles.poseSlot}>
                <View style={[styles.poseThumb, styles.poseMain, { borderColor: meta.accent + '88' }]}>
                  <Ionicons name="camera" size={18} color={meta.accent} />
                </View>
                <Text style={styles.poseLabel}>{t('identify.poseWhole')}</Text>
              </View>
              {[0, 1].map((i) => {
                const p = extraPhotos[i];
                const label = i === 0 ? t('identify.poseClose') : t('identify.poseOther');
                const isNext = extraPhotos.length === i;
                return (
                  <View key={i} style={styles.poseSlot}>
                    {p ? (
                      <TouchableOpacity
                        style={styles.poseThumbWrap}
                        onPress={() => removeAngle(i)}
                        disabled={scanning}
                        accessibilityRole="button"
                        accessibilityLabel={t('identify.removeAngleLabel', { index: i + 1 })}
                      >
                        <Image source={{ uri: p.uri }} style={styles.poseThumbImg} />
                        <View style={styles.angleRemove}>
                          <Ionicons name="close" size={12} color={colors.white} />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.poseThumb, isNext && { borderColor: meta.accent + '88' }]}
                        onPress={handleAddAngle}
                        disabled={scanning || !isNext}
                        accessibilityRole="button"
                        accessibilityLabel={t('identify.addAngle')}
                      >
                        <Ionicons name="add" size={20} color={isNext ? meta.accent : colors.textMuted} />
                      </TouchableOpacity>
                    )}
                    <Text style={styles.poseLabel}>{label}</Text>
                  </View>
                );
              })}
            </View>

            {extraPhotos.length > 0 && (
              <Text style={styles.anglesHint}>
                {t('identify.anglesHint', { count: extraPhotos.length + 1 })}
              </Text>
            )}
          </View>
        )}

        <View style={styles.actionsRow}>
          {/* Press-scale by outer wrapper. The `flex: 1` has to move onto the
              wrapper as well: the Animated.View is now the flex child of this
              row, so without it both cards would collapse to their content
              (same device as ProfileScreen's streakCardWrap). */}
          <PressScale style={styles.actionBtnWrap}>
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
          </PressScale>
          <PressScale style={styles.actionBtnWrap}>
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
          </PressScale>
        </View>

        {/* Achados recentes: the user's latest finds of THIS category as a
            horizontal strip of photo tiles - foto como tile com o nome como
            legenda embaixo, never a small badge lost in a text card
            (diagramacao-premium doctrine). Renders only when there is at least
            one find, so a new user never sees empty chrome. Reuses FindThumb:
            the same photo-priority chain (own photo -> Wikipedia by scientific
            name -> category icon) as the Collection, with its icon fallback,
            so this strip can never render broken offline. */}
        {recentFinds.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.recentStrip}
            contentContainerStyle={styles.recentStripContent}
          >
            {recentFinds.map((item) => (
              <TouchableOpacity
                key={item.savedId}
                style={styles.recentItem}
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate(meta.detailRoute, { plant: item, fromIdentify: false })
                }
                accessibilityRole="button"
                accessibilityLabel={t('collection.viewDetailsLabel', {
                  name: item.nickname || item.name,
                })}
              >
                <FindThumb
                  photoUri={item.photoUri}
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
          </ScrollView>
        )}

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
  headerTitleWrap: { flex: 1, paddingRight: 10 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Foto no palco: the staged photo fills the viewfinder interior; the scrim is
  // the background tone at ~60% so the scanline/spinner/label stay readable.
  stagePhoto: { ...StyleSheet.absoluteFillObject },
  stageScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + '99' },
  // Foto-exemplo: scrim mais fechado ('B3' ~70%) que o do scan - regra dura do
  // dono: a foto de fundo NAO pode atrapalhar a leitura do titulo/subtitulo.
  exemplarScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'B3' },
  // Credito no canto inferior do palco, dentro das cantoneiras (que estao a
  // 14px com 26px de braco) - por isso o recuo de 46px na direita.
  exemplarCredit: {
    position: 'absolute',
    bottom: 6,
    right: 46,
    fontSize: 9,
    color: colors.textMuted,
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
  poseRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  poseSlot: { alignItems: 'center', gap: 5 },
  poseThumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poseMain: { borderStyle: 'solid' },
  poseThumbWrap: { width: 56, height: 56 },
  poseThumbImg: { width: 56, height: 56, borderRadius: 14 },
  poseLabel: { fontSize: 10.5, color: colors.textMuted, maxWidth: 72, textAlign: 'center' },
  anglesBlock: { alignItems: 'center', marginTop: 14, gap: 10 },
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
  anglesHint: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  // The flex the PressScale wrapper needs so the two cards still share the row
  // evenly once the Animated.View sits between them and actionsRow.
  actionBtnWrap: { flex: 1 },
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
  // Achados recentes: 64px rounded photo tile, one-line 10.5px caption below
  // (diagramacao-premium: a foto E o tile, o nome e a legenda).
  recentStrip: { marginTop: 16 },
  recentStripContent: { gap: 12, paddingRight: 4 },
  recentItem: { width: 64, alignItems: 'center' },
  recentThumb: { width: 64, height: 64, borderRadius: 14 },
  recentName: {
    marginTop: 4,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textSecondary,
    maxWidth: 64,
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
