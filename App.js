import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import CategoryIcon from './components/CategoryIcon';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { initI18n } from './i18n';

import IdentifyScreen from './screens/IdentifyScreen';
import PlantDetailScreen from './screens/PlantDetailScreen';
import InsectDetailScreen from './screens/InsectDetailScreen';
import MushroomDetailScreen from './screens/MushroomDetailScreen';
import CropDetailScreen from './screens/CropDetailScreen';
import AgronomyWorkspaceScreen from './screens/AgronomyWorkspaceScreen';
import ObservationWorkspaceScreen from './screens/ObservationWorkspaceScreen';
import TreeDetailScreen from './screens/TreeDetailScreen';
import FishDetailScreen from './screens/FishDetailScreen';
import BirdDetailScreen from './screens/BirdDetailScreen';
import SoundScreen from './screens/SoundScreen';
import SoundDetailScreen from './screens/SoundDetailScreen';
import CollectionScreen from './screens/CollectionScreen';
import SpecimenScreen from './screens/SpecimenScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import TopicDetailScreen from './screens/TopicDetailScreen';
import SpeciesDetailScreen from './screens/SpeciesDetailScreen';
import HerbDetailScreen from './screens/HerbDetailScreen';
import FieldGuideScreen from './screens/FieldGuideScreen';
import BookScreen from './screens/BookScreen';
import BotanistScreen from './screens/BotanistScreen';
import ProfileScreen from './screens/ProfileScreen';
import AchievementsScreen from './screens/AchievementsScreen';
import CommunityScreen from './screens/CommunityScreen';
import StoreScreen from './screens/StoreScreen';
import MonthlyRecapScreen from './screens/MonthlyRecapScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';
import PrivacyScreen from './screens/PrivacyScreen';
import TermsScreen from './screens/TermsScreen';
import HelpScreen from './screens/HelpScreen';
import RestoreAccessScreen from './screens/RestoreAccessScreen';
import SettingsScreen from './screens/SettingsScreen';
import NaturePassportScreen from './screens/NaturePassportScreen';
import LanguageScreen from './screens/LanguageScreen';
import CareTopicsScreen from './screens/CareTopicsScreen';
import AboutScreen from './screens/AboutScreen';
import { colors } from './components/theme';
import { CATEGORIES } from './components/categories';
import { completeGoogleSignIn } from './components/restore';
import AlertModal from './components/AlertModal';
import ErrorBoundary from './components/ErrorBoundary';
import TwoRowTabBar, { focusedLeafNameFromState } from './components/TwoRowTabBar';
import OnboardingScreen from './screens/OnboardingScreen';
import { hasSeenOnboarding, subscribeOnboardingReplay } from './components/onboarding';
import {
  getDiscoveryPreferences,
  updateDiscoveryPreferences,
} from './components/discoveryPreferences';
import { trackAppOpen } from './components/tracking';
import { getCollectionEntry } from './components/storage';
import {
  getInitialReminderResponse,
  reconcileLocalReminders,
  subscribeReminderResponses,
} from './components/localReminders';
import { cleanupAbandonedNativeAudio } from './components/audioRecorder';

const Tab = createBottomTabNavigator();
const ScanStack = createStackNavigator();
const CollectionStack = createStackNavigator();
const DiscoverStack = createStackNavigator();
const ProfileStack = createStackNavigator();

// Shared options for every stack. Three deliberate pieces, each one a defect
// that shows up only on web:
//
//  - `animationEnabled: true` EXPLICITLY: react-navigation defaults it to false
//    on web, so the preset alone gives no transition at all.
//  - `cardStyle` with the app background: without it the area behind the
//    sliding card is the navigator's DefaultTheme grey, and every push flashes
//    a pale rectangle across a dark app.
//  - `gestureEnabled: false` stays: the preset does not turn gestures on, and
//    swipe-back on web hijacks horizontal scrolling inside the screen.
const STACK_OPTIONS = {
  headerShown: false,
  animationEnabled: true,
  gestureEnabled: false,
  // flex: 1 e OBRIGATORIO aqui. Sem ele o card do stack cresce com o
  // conteudo em vez de ficar do tamanho da tela: o ScrollView de dentro
  // nunca fica menor que o conteudo, entao nunca vira area rolavel e o
  // TOQUE nao rola (scrollTop programatico ainda funciona, e foi por isso
  // que a medicao automatica dizia "ok" enquanto o celular do dono ficava
  // travado). Mesmo bug ja pago no Cosmic Guide em 09/08.
  cardStyle: { flex: 1, backgroundColor: colors.background },
  ...TransitionPresets.SlideFromRightIOS,
};

const DETAIL_SCREENS = {
  plant: PlantDetailScreen,
  insect: InsectDetailScreen,
  mushroom: MushroomDetailScreen,
  crop: CropDetailScreen,
  tree: TreeDetailScreen,
  fish: FishDetailScreen,
  bird: BirdDetailScreen,
  sound: SoundDetailScreen,
};

function makeScanStackNav(categoryKey) {
  const meta = CATEGORIES[categoryKey];
  const DetailScreen = DETAIL_SCREENS[categoryKey];
  return function ScanStackNav() {
    return (
      <ScanStack.Navigator screenOptions={STACK_OPTIONS}>
        <ScanStack.Screen name="ScanHome" component={IdentifyScreen} initialParams={{ category: categoryKey }} />
        <ScanStack.Screen name={meta.detailRoute} component={DetailScreen} />
        <ScanStack.Screen name="CareTopics" component={CareTopicsScreen} />
        {categoryKey === 'crop' ? (
          <ScanStack.Screen name="AgronomyWorkspace" component={AgronomyWorkspaceScreen} />
        ) : null}
        {categoryKey !== 'crop' ? (
          <ScanStack.Screen name="ObservationWorkspace" component={ObservationWorkspaceScreen} />
        ) : null}
      </ScanStack.Navigator>
    );
  };
}

const PlantStack = makeScanStackNav('plant');
const InsectStack = makeScanStackNav('insect');
const MushroomStack = makeScanStackNav('mushroom');
const CropStack = makeScanStackNav('crop');
const TreeStack = makeScanStackNav('tree');
const FishStack = makeScanStackNav('fish');
// Built regardless of whether birds are switched on - creating the component is
// free, and gating only the <Tab.Screen> below keeps the on/off decision in one
// obvious place instead of two.
const BirdStack = makeScanStackNav('bird');

// Sound has its own stack rather than makeScanStackNav: that helper wires
// IdentifyScreen (a camera screen) as the root, and this category has no camera.
function SoundStackNav() {
  return (
    <ScanStack.Navigator screenOptions={STACK_OPTIONS}>
      <ScanStack.Screen name="SoundHome" component={SoundScreen} />
      <ScanStack.Screen name="SoundDetail" component={SoundDetailScreen} />
      <ScanStack.Screen name="CareTopics" component={CareTopicsScreen} />
      <ScanStack.Screen name="ObservationWorkspace" component={ObservationWorkspaceScreen} />
    </ScanStack.Navigator>
  );
}

function CollectionStackNav() {
  return (
    <CollectionStack.Navigator screenOptions={STACK_OPTIONS}>
      <CollectionStack.Screen name="CollectionHome" component={CollectionScreen} />
      <CollectionStack.Screen name="Specimen" component={SpecimenScreen} />
      <CollectionStack.Screen name="PlantDetail" component={PlantDetailScreen} />
      <CollectionStack.Screen name="InsectDetail" component={InsectDetailScreen} />
      <CollectionStack.Screen name="MushroomDetail" component={MushroomDetailScreen} />
      <CollectionStack.Screen name="CropDetail" component={CropDetailScreen} />
      <CollectionStack.Screen name="AgronomyWorkspace" component={AgronomyWorkspaceScreen} />
      <CollectionStack.Screen name="ObservationWorkspace" component={ObservationWorkspaceScreen} />
      <CollectionStack.Screen name="TreeDetail" component={TreeDetailScreen} />
      {/* Every category that can be SAVED needs its detail route registered
          here too, not just inside its own scan stack - otherwise tapping that
          item in the Collection navigates to a route this stack doesn't know
          and simply does nothing. */}
      <CollectionStack.Screen name="FishDetail" component={FishDetailScreen} />
      <CollectionStack.Screen name="BirdDetail" component={BirdDetailScreen} />
      <CollectionStack.Screen name="SoundDetail" component={SoundDetailScreen} />
      <CollectionStack.Screen name="CareTopics" component={CareTopicsScreen} />
    </CollectionStack.Navigator>
  );
}

// Profile is its own tab (next to Collection) rather than a button buried in
// the Collection header, so everything account-related - stats, achievements,
// the rewards store, subscription, legal, help - lives one tap from anywhere.
// Its sub-screens moved here with it; nothing outside ProfileScreen ever
// navigated to them (verified by grep before the move), so the split is clean.
function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={STACK_OPTIONS}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="Achievements" component={AchievementsScreen} />
      <ProfileStack.Screen name="Community" component={CommunityScreen} />
      <ProfileStack.Screen name="Store" component={StoreScreen} />
      <ProfileStack.Screen name="MonthlyRecap" component={MonthlyRecapScreen} />
      <ProfileStack.Screen name="Subscription" component={SubscriptionScreen} />
      <ProfileStack.Screen name="Privacy" component={PrivacyScreen} />
      <ProfileStack.Screen name="Terms" component={TermsScreen} />
      <ProfileStack.Screen name="Help" component={HelpScreen} />
      <ProfileStack.Screen name="RestoreAccess" component={RestoreAccessScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="NaturePassport" component={NaturePassportScreen} />
      <ProfileStack.Screen name="Language" component={LanguageScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
    </ProfileStack.Navigator>
  );
}

function DiscoverStackNav() {
  return (
    <DiscoverStack.Navigator screenOptions={STACK_OPTIONS}>
      <DiscoverStack.Screen name="DiscoverHome" component={DiscoverScreen} />
      <DiscoverStack.Screen name="TopicDetail" component={TopicDetailScreen} />
      <DiscoverStack.Screen name="SpeciesDetail" component={SpeciesDetailScreen} />
      <DiscoverStack.Screen name="HerbDetail" component={HerbDetailScreen} />
      <DiscoverStack.Screen name="FieldGuide" component={FieldGuideScreen} />
      <DiscoverStack.Screen name="CropDetail" component={CropDetailScreen} />
      <DiscoverStack.Screen name="AgronomyWorkspace" component={AgronomyWorkspaceScreen} />
      <DiscoverStack.Screen name="ObservationWorkspace" component={ObservationWorkspaceScreen} />
      <DiscoverStack.Screen name="CareTopics" component={CareTopicsScreen} />
      <DiscoverStack.Screen name="Book" component={BookScreen} />
    </DiscoverStack.Navigator>
  );
}

const TAB_ICONS = {
  [CATEGORIES.plant.tabLabel]: CATEGORIES.plant.tabIcon,
  [CATEGORIES.insect.tabLabel]: CATEGORIES.insect.tabIcon,
  [CATEGORIES.mushroom.tabLabel]: CATEGORIES.mushroom.tabIcon,
  [CATEGORIES.crop.tabLabel]: CATEGORIES.crop.tabIcon,
  [CATEGORIES.tree.tabLabel]: CATEGORIES.tree.tabIcon,
  [CATEGORIES.fish.tabLabel]: CATEGORIES.fish.tabIcon,
  [CATEGORIES.bird.tabLabel]: CATEGORIES.bird.tabIcon,
  [CATEGORIES.sound.tabLabel]: CATEGORIES.sound.tabIcon,
};

export default function App() {
  // The boundary wraps everything INCLUDING the i18n bootstrap below, on
  // purpose: initI18n() fetches locale JSON over the network at runtime, so it
  // is itself something that can fail. A boundary mounted inside it could not
  // catch that. ErrorBoundary carries its own hardcoded strings for exactly
  // this reason - it never calls t().
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [i18nReady, setI18nReady] = useState(false);
  // null = still checking. Rendering the app before this resolves would flash
  // the camera screen at a first-time user for a frame before the intro.
  const [showOnboarding, setShowOnboarding] = useState(null);
  // The navigator mounts only after this resolves. React Navigation reads
  // initialRouteName once, so mounting early would always flash/open Plants
  // even when the person last identified a bird, fish or mushroom.
  const [initialCategoryKey, setInitialCategoryKey] = useState(null);

  useEffect(() => {
    // A force-close cannot execute the recorder's finally block. Native builds
    // remove only NatureLens-owned cache/legacy WAVs on the next app launch.
    cleanupAbandonedNativeAudio();
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([hasSeenOnboarding(), getDiscoveryPreferences()]).then(([seen, preferences]) => {
      if (!active) return;
      const preferred = CATEGORIES[preferences.preferredCategory];
      setInitialCategoryKey(
        preferred && preferred.enabled !== false ? preferred.key : CATEGORIES.plant.key
      );
      setShowOnboarding(!seen);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => subscribeOnboardingReplay(() => setShowOnboarding(true)),
    []
  );

  useEffect(() => {
    // The .catch is not defensive padding - it closes a real black-screen bug.
    // initI18n() awaits loadLanguage('en'), which throws on any fetch failure or
    // non-OK response for /locales/en.json. With no catch, the promise rejects,
    // setI18nReady(true) never runs, and the app sits on the blank placeholder
    // below forever. An ErrorBoundary cannot save this either: it catches render
    // errors, not rejected promises from an effect.
    //
    // Rendering anyway is strictly better than hanging. i18next itself has
    // already been init()-ed by the time locale loading starts, so t() degrades
    // to returning key names rather than crashing - an ugly screen the user can
    // reload out of, instead of a dead one they can only close.
    trackAppOpen({
      language: typeof navigator !== 'undefined' ? navigator.language : null,
      standalone:
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(display-mode: standalone)')?.matches,
    });
    initI18n()
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[i18n] init failed, rendering anyway:', err);
      })
      .finally(() => setI18nReady(true));
  }, []);

  if (!i18nReady || showOnboarding === null || initialCategoryKey === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  // Onboarding renders in place of the navigator, not on top of it: it needs
  // translated copy (so it must come after i18n) but must not let the user
  // reach the camera behind it.
  //
  // It MUST carry its own SafeAreaProvider. The one inside AppNavigator does
  // not wrap this branch, and OnboardingScreen uses SafeAreaView - which throws
  // "No safe area value available" with no provider above it. That crashed the
  // app for every user on first open (the onboarding flag is new, so everyone
  // hit this branch), caught in production 2026-07-29.
  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OnboardingScreen
          onDone={(preferences) => {
            if (
              preferences?.preferredCategory
              && CATEGORIES[preferences.preferredCategory]?.enabled !== false
            ) {
              setInitialCategoryKey(preferences.preferredCategory);
            }
            setShowOnboarding(false);
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <AppNavigator
      initialCategoryKey={initialCategoryKey}
      onPreferredCategoryChange={setInitialCategoryKey}
    />
  );
}

function AppNavigator({ initialCategoryKey, onPreferredCategoryChange }) {
  const { t } = useTranslation();
  // 'active' | 'other' | 'error' | null - drives the post-Google-sign-in
  // AlertModal. PKCE returns a one-time
  // `code` in the query string (never a raw token) - completeGoogleSignIn
  // exchanges it server-side using the code_verifier stashed earlier in
  // sessionStorage (see components/restore.js).
  const [googleSignInResult, setGoogleSignInResult] = useState(null);
  // A tabBar recebe um estado recortado que pode omitir o Stack filho. A folha
  // vem do estado raiz do container para o dock nunca reaparecer num detalhe.
  const [focusedLeafRouteName, setFocusedLeafRouteName] = useState(null);

  const rememberPreferredCategory = (categoryKey) => {
    const category = CATEGORIES[categoryKey];
    if (!category || category.enabled === false) return;
    onPreferredCategoryChange?.(categoryKey);
    updateDiscoveryPreferences({ preferredCategory: categoryKey }).catch(() => undefined);
  };

  // Botao VOLTAR do Android no PWA.
  //
  // O react-navigation nao liga o historico do navegador sozinho: como o app
  // nunca empurrava nada no history, o voltar do sistema saia do PWA em vez de
  // fechar a tela aberta. No build NATIVO o problema nao existe (o stack ja
  // escuta o botao fisico), por isso tudo aqui e guardado por Platform.
  //
  // Linking do react-navigation resolveria - e passaria a escrever URLs de
  // rota que ninguem pode recarregar: PlantDetail so existe com
  // route.params.plant, entao um F5 nessa URL quebraria a tela. Espelhar o
  // historico na mao e o caminho curto que nao cria essa porta.
  //
  // Uma unica entrada extra enquanto houver tela para fechar: o popstate gasta
  // essa entrada virando goBack, e o proximo onStateChange repoe se ainda
  // sobrar pilha. Voltar pelo chevron da tela deixa a entrada sem uso - custa
  // no maximo UM toque de voltar sem efeito, nunca sair do app sem querer.
  const navigationRef = useNavigationContainerRef();
  const pendingReminderTarget = useRef(null);
  const recentReminderTarget = useRef({ key: '', at: 0 });

  const openReminderTarget = async (target) => {
    if (Platform.OS !== 'android'
      || target?.type !== 'specimen-reminder'
      || typeof target.savedId !== 'string'
      || typeof target.reminderId !== 'string') return;
    if (!navigationRef.isReady()) {
      pendingReminderTarget.current = target;
      return;
    }

    const key = `${target.savedId}:${target.reminderId}`;
    const now = Date.now();
    if (recentReminderTarget.current.key === key
      && now - recentReminderTarget.current.at < 2000) return;
    recentReminderTarget.current = { key, at: now };

    const entry = await getCollectionEntry(target.savedId);
    if (!navigationRef.isReady()) {
      pendingReminderTarget.current = target;
      return;
    }
    navigationRef.navigate('Collection', entry
      ? { screen: 'Specimen', params: { savedId: target.savedId } }
      : { screen: 'CollectionHome' });
  };

  const handleNavigatorReady = () => {
    syncFocusedLeaf();
    const target = pendingReminderTarget.current;
    pendingReminderTarget.current = null;
    if (target) openReminderTarget(target);
  };
  const syncHistory = () => {
    if (Platform.OS !== 'web') return;
    if (navigationRef.canGoBack() && !window.history.state?.nlBack) {
      window.history.pushState({ nlBack: true }, '');
    }
  };

  const syncFocusedLeaf = (state) => {
    const fullState = state || navigationRef.getRootState();
    setFocusedLeafRouteName(focusedLeafNameFromState(fullState));
  };

  const handleNavigationStateChange = (state) => {
    syncHistory();
    syncFocusedLeaf(state);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPop = () => {
      if (navigationRef.canGoBack()) navigationRef.goBack();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    let active = true;
    const subscription = subscribeReminderResponses((target) => {
      if (active) openReminderTarget(target);
    });
    getInitialReminderResponse()
      .then((target) => {
        if (active && target) openReminderTarget(target);
      })
      .finally(() => {
        if (active) reconcileLocalReminders().catch(() => undefined);
      });
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const oauthError = params.get('error');
    if (!code && !oauthError) return;

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('code');
    cleanUrl.searchParams.delete('error');
    cleanUrl.searchParams.delete('error_description');
    cleanUrl.searchParams.delete('error_code');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);

    if (oauthError) {
      setGoogleSignInResult('error');
      return;
    }

    completeGoogleSignIn(code)
      .then((status) => setGoogleSignInResult(status === 'active' ? 'active' : 'other'))
      .catch(() => setGoogleSignInResult('error'));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer
          ref={navigationRef}
          onReady={handleNavigatorReady}
          onStateChange={handleNavigationStateChange}
        >
          <Tab.Navigator
            initialRouteName={CATEGORIES[initialCategoryKey]?.tabLabel || CATEGORIES.plant.tabLabel}
            // Custom two-row bar: with 8-10 tabs the default single-row layout
            // squeezed each label into ~36px and they visibly overlapped.
            // See components/TwoRowTabBar.js.
            tabBar={(props) => (
              <TwoRowTabBar {...props} focusedLeafRouteName={focusedLeafRouteName} />
            )}
            screenOptions={({ route }) => ({
              headerShown: false,
              // Custom dock metadata. Keeping it in screen options lets the
              // tab bar share one preference source without another storage
              // subscription or changing the navigation/scroll contract.
              natureLensInitialCategory: initialCategoryKey,
              natureLensRememberCategory: rememberPreferredCategory,
              tabBarActiveTintColor: colors.accent,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarIcon: ({ color, size, focused }) => {
                let icon = TAB_ICONS[route.name];
                if (!icon) {
                  if (route.name === 'Collection') icon = focused ? 'file-tray-full' : 'file-tray-full-outline';
                  else if (route.name === 'Profile') icon = focused ? 'person-circle' : 'person-circle-outline';
                  else if (route.name === 'Discover') icon = focused ? 'compass' : 'compass-outline';
                  else if (route.name === 'Botanist') icon = focused ? 'sparkles' : 'sparkles-outline';
                  else icon = 'ellipse';
                }
                return <CategoryIcon name={icon} size={size - 2} color={color} />;
              },
            })}
          >
            <Tab.Screen
              name={CATEGORIES.plant.tabLabel}
              component={PlantStack}
              options={{ tabBarLabel: t('categories.plant.tabLabel') }}
            />
            <Tab.Screen
              name={CATEGORIES.insect.tabLabel}
              component={InsectStack}
              options={{ tabBarLabel: t('categories.insect.tabLabel') }}
            />
            <Tab.Screen
              name={CATEGORIES.mushroom.tabLabel}
              component={MushroomStack}
              options={{ tabBarLabel: t('categories.mushroom.tabLabel') }}
            />
            <Tab.Screen
              name={CATEGORIES.crop.tabLabel}
              component={CropStack}
              options={{ tabBarLabel: t('categories.crop.tabLabel') }}
            />
            {/* Trees folded into the Plants tab - same Plant.id model behind
                both. Kept out of the bar via `enabled: false` rather than
                deleted, so already-saved trees still open. */}
            <Tab.Screen
              name={CATEGORIES.fish.tabLabel}
              component={FishStack}
              options={{ tabBarLabel: t('categories.fish.tabLabel') }}
            />
            {CATEGORIES.bird.enabled && (
              <Tab.Screen
                name={CATEGORIES.bird.tabLabel}
                component={BirdStack}
                options={{ tabBarLabel: t('categories.bird.tabLabel') }}
              />
            )}
            {/* Sound needs a Perch inference host; without one the tab would
                only ever produce errors. See docs/perch-host/. */}
            {CATEGORIES.sound.enabled && (
              <Tab.Screen
                name={CATEGORIES.sound.tabLabel}
                component={SoundStackNav}
                options={{ tabBarLabel: t('categories.sound.tabLabel') }}
              />
            )}
            <Tab.Screen
              name="Collection"
              component={CollectionStackNav}
              options={{ tabBarLabel: t('common.tabCollection') }}
            />
            <Tab.Screen
              name="Profile"
              component={ProfileStackNav}
              options={{ tabBarLabel: t('common.tabProfile') }}
            />
            <Tab.Screen
              name="Discover"
              component={DiscoverStackNav}
              options={{ tabBarLabel: t('common.tabDiscover') }}
            />
            <Tab.Screen
              name="Botanist"
              component={BotanistScreen}
              options={{ tabBarLabel: t('common.tabBotanist') }}
            />
          </Tab.Navigator>
        </NavigationContainer>

        <AlertModal
          visible={googleSignInResult === 'active'}
          title={t('restore.doneTitleActive')}
          message={t('restore.doneBodyActive')}
          onRequestClose={() => setGoogleSignInResult(null)}
        />
        <AlertModal
          visible={googleSignInResult === 'other'}
          title={t('restore.doneTitleOther')}
          message={t('restore.doneBodyOther')}
          onRequestClose={() => setGoogleSignInResult(null)}
        />
        <AlertModal
          visible={googleSignInResult === 'error'}
          title={t('restore.googleSignInErrorTitle')}
          message={t('restore.googleSignInErrorBody')}
          onRequestClose={() => setGoogleSignInResult(null)}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
