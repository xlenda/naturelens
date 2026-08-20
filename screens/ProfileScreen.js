import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, shadow } from '../components/theme';
import { getCollection, getProfilePhoto, saveProfilePhoto } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { startCheckout, getSubscriptionStatus, getLinkedEmail } from '../components/subscription';
import { createPassword } from '../components/restore';
import { getStreakInfo, evaluateAchievements } from '../components/achievements';
import { hasReward } from '../components/rewardOwnership';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import PasswordInput from '../components/PasswordInput';
import { useAppAlert } from '../components/useAppAlert';
import { usePageShowReset } from '../components/usePageShowReset';
import CategoryIcon from '../components/CategoryIcon';
import FindThumb from '../components/FindThumb';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';

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
  // Achado mais recente por categoria + as fotos próprias mais recentes.
  // Derivados da MESMA lista que load() já busca - zero fetch novo.
  const [latestByCategory, setLatestByCategory] = useState({});
  const [recentPhotos, setRecentPhotos] = useState([]);
  const [subStatus, setSubStatus] = useState(null);
  const [accountEmail, setAccountEmail] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [creatingPassword, setCreatingPassword] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [hasNaturalistBadge, setHasNaturalistBadge] = useState(false);



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

    // Uma passada só sobre a lista já carregada: a entrada mais recente de
    // cada categoria (por savedAt - a ordem do array não é garantida depois
    // do cloud sync) vira a foto da linha "Por Categoria", e os 3 achados
    // mais recentes COM foto do usuário viram a pilha do card de total
    // (doutrina "banda de status com arte"). Nenhum fetch aqui.
    const latest = {};
    list.forEach((item) => {
      const cur = latest[item.category];
      if (!cur || (item.savedAt || '') > (cur.savedAt || '')) latest[item.category] = item;
    });
    setLatestByCategory(latest);
    setRecentPhotos(
      list
        .filter((item) => item.photoUri)
        .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
        .slice(0, 3)
    );

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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );





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
      {/* Cenário em camadas: the scene is the FIRST child of the root and fills
          it absolutely with pointerEvents="none", so decoration can never steal
          a touch. The container keeps its own backgroundColor underneath - the
          scene paints over it, it does not replace it. */}
      <NatureScene />

      {/* No back chevron: Profile is a bottom tab now, so it is the root of its
          own stack and goBack() has nowhere to go. The left spacer mirrors the
          gear on the right so the title stays optically centred. The gear is
          the single entry into Settings - preferences, backup, legal and
          account actions moved there so this screen could go back to being an
          identity hub instead of a 900-line drawer. */}
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.title} accessibilityRole="header">{t('profile.title')}</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero-first: the screen opens with the person, not with the settings
            list. The avatar is large and centred with room around it, and the
            counters below it finish the identity block before the first row of
            settings. This is layout only - the picker, the edit badge and the
            accessibility label are exactly as they were. */}
        <PressScale>
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
                <Ionicons name="camera" size={34} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="pencil" size={15} color={colors.white} />
            </View>
          </TouchableOpacity>
        </PressScale>

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
          <PressScale>
            <TouchableOpacity
              style={styles.emptyCard}
              activeOpacity={0.85}
              onPress={() => navigation.getParent()?.navigate(CATEGORIES.plant.tabLabel)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.emptyCta')}
            >
              {/* Illustrated empty state (chrome art): the forest path
                  invites the first identification. */}
              <Image
                source={require('../assets/art/empty-collection.jpg')}
                style={styles.emptyArt}
                resizeMode="cover"
              />
              <Text style={styles.emptyTitle}>{t('profile.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('profile.emptyBody')}</Text>
              <View style={[styles.emptyBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="camera" size={16} color={colors.white} />
                <Text style={styles.emptyBtnText}>{t('profile.emptyCta')}</Text>
              </View>
            </TouchableOpacity>
          </PressScale>
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
            {/* Banda de status com arte (doutrina diagramacao-premium): pilha
                de mini-fotos sobrepostas dos achados mais recentes ao lado do
                número. Só fotos tiradas pelo PRÓPRIO usuário (photoUri) - a
                lista é filtrada no load(), então isto nunca dispara fetch e
                sem nenhuma foto o card fica exatamente como hoje. Decorativo:
                escondido da acessibilidade como o ícone acima. */}
            {recentPhotos.length > 0 && (
              <View
                style={styles.totalStack}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              >
                {recentPhotos.map((item, idx) => (
                  <FindThumb
                    key={item.savedId}
                    photoUri={item.photoUri}
                    style={[styles.totalStackPhoto, idx > 0 && styles.totalStackOverlap]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Two cards, two destinations. The streak opens Achievements; the token
            balance opens the Rewards store - tapping a balance to go spend it is
            the affordance people expect, and until the store existed this card
            led somewhere that could not answer "what are these for?". */}
        {/* Shown as soon as there is ANY progress - not only once something has
            been saved.
            Gating this on `total > 0` was wrong twice over. Tokens and the
            streak come from recordIdentification(), which fires on every scan
            whether or not the find is ever saved, so someone who identified
            daily for a week without tapping Save had a 7-day streak and 35+
            tokens that the app refused to show them. Worse, these two cards hold
            the ONLY navigation into Achievements and the Rewards Store -
            verified: navigate('Achievements') and navigate('Store') each appear
            exactly once in the whole codebase, both inside this block. Hiding it
            made a store the app sells things in unreachable. */}
        {(total > 0 || currentStreak > 0 || tokens > 0) && (
        <View style={styles.streakRow}>
          {/* Press-scale by outer wrapper. The `flex: 1` has to move onto the
              wrapper as well: the Animated.View is now the flex child of this
              row, so without it both cards would collapse to their content. */}
          <PressScale style={styles.streakCardWrap}>
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
          </PressScale>
          <PressScale style={styles.streakCardWrap}>
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
          </PressScale>
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
        <PressScale>
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
        </PressScale>

        {/* Sign out moved to Settings > Account, next to Delete account -
            leaving/erasing are maintenance actions, not identity. */}

        <PressScale>
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
        </PressScale>

        <PressScale>
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
        </PressScale>

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

        {/* Zona de cor #1: the whole per-category block lives in a full-bleed
            band one shade lighter than the page, so it reads as ONE section and
            the gap above and below it is the scene showing through. The gutter
            matches styles.scroll's padding, and ZoneBand is a pure wrapper - the
            title and the categories keep their order and their content. */}
        <ZoneBand gutter={20} style={styles.zoneGap}>
          <Text style={styles.sectionLabel}>{t('profile.byCategory')}</Text>

          {Object.values(CATEGORIES).map((meta) => {
            const latest = latestByCategory[meta.key];
            return (
              <View key={meta.key} style={styles.categoryCard}>
                {latest ? (
                  /* Foto real no lugar do selo de ícone (doutrina
                     diagramacao-premium: a foto é a arte da linha, ícone é o
                     ÚLTIMO recurso). FindThumb já implementa a cadeia inteira:
                     foto do próprio usuário → foto da Wikipedia pelo nome
                     científico (cacheada) → o mesmo ícone de hoje, então
                     offline/espécie sem foto renderiza exatamente como antes.
                     Performance: são só as categorias (todas visíveis, meia
                     dúzia de linhas), não a coleção inteira - no pior caso um
                     fetch por categoria sem foto própria, absorvido pelo cache
                     do speciesPhoto. */
                  <FindThumb
                    photoUri={latest.photoUri}
                    scientific={latest.scientific}
                    icon={meta.tabIcon}
                    accent={meta.accent}
                    iconSize={22}
                    style={styles.categoryThumb}
                  />
                ) : (
                  <View style={[styles.categoryIcon, { backgroundColor: meta.accent + '33' }]}>
                    <CategoryIcon
                      name={meta.tabIcon}
                      size={22}
                      color={meta.accent}
                      accessibilityElementsHidden={true}
                      importantForAccessibility="no-hide-descendants"
                    />
                  </View>
                )}
                <Text style={styles.categoryLabel}>{t(`categories.${meta.key}.tabLabel`)}</Text>
                <Text style={styles.categoryCount}>{counts[meta.key] || 0}</Text>
              </View>
            );
          })}
        </ZoneBand>

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
  // Hero-first: the avatar is the screen's identity, so it is large (124) and
  // given room above and below rather than sitting as a small chip over a list.
  avatarWrap: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
    width: 124,
    height: 124,
  },
  avatarImage: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 2,
    borderColor: colors.border,
  },
  avatarPlaceholder: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
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
  emptyArt: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 14,
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
  // The flex the PressScale wrapper needs so the two cards still share the row
  // evenly once the Animated.View sits between them and streakRow.
  streakCardWrap: { flex: 1 },
  // The gap between two zones IS the device - it is the scene showing through
  // between them. ZoneBand's own 8px left the stats band and the settings band
  // reading as one continuous slab, which is the opposite of the rhythm.
  zoneGap: { marginTop: 26 },
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
  // Composição centrada, with the criterion: SECTION titles centre and carry
  // weight (22/800). Row labels, card titles and reading text below stay left
  // aligned - centring a long line is what makes a layout unreadable.
  sectionLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: 34,
    marginBottom: 16,
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
  // Mesma pegada do categoryIcon (44 + marginRight 14) para a linha não pular
  // quando a foto entra no lugar do selo; o borderRadius vale tanto para a
  // Image quanto para a caixa de ícone do fallback do FindThumb.
  categoryThumb: { width: 44, height: 44, borderRadius: 22, marginRight: 14 },
  // Pilha sobreposta: anel na cor do card separa uma foto da outra.
  totalStack: { flexDirection: 'row', marginLeft: 8 },
  totalStackPhoto: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.card,
  },
  totalStackOverlap: { marginLeft: -10 },
  categoryLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  categoryCount: { fontSize: 16, fontWeight: '800', color: colors.accentLight },
  // Tighter than before (24 → 12): inside the settings zone the band itself
  // provides the separation, so 24px between every row made one section read as
  // seven unrelated ones.
  // Matches privacyText's indent so the explanation lines up under its label
  // rather than under the icon.
  // Deliberately quieter than the rows above it: signing out is a rare,
  // reversible action, not something to invite.
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
});
