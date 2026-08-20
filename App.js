import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import CategoryIcon from './components/CategoryIcon';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { initI18n } from './i18n';

import IdentifyScreen from './screens/IdentifyScreen';
import PlantDetailScreen from './screens/PlantDetailScreen';
import InsectDetailScreen from './screens/InsectDetailScreen';
import MushroomDetailScreen from './screens/MushroomDetailScreen';
import CropDetailScreen from './screens/CropDetailScreen';
import TreeDetailScreen from './screens/TreeDetailScreen';
import FishDetailScreen from './screens/FishDetailScreen';
import BirdDetailScreen from './screens/BirdDetailScreen';
import SoundScreen from './screens/SoundScreen';
import SoundDetailScreen from './screens/SoundDetailScreen';
import CollectionScreen from './screens/CollectionScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import TopicDetailScreen from './screens/TopicDetailScreen';
import SpeciesDetailScreen from './screens/SpeciesDetailScreen';
import HerbDetailScreen from './screens/HerbDetailScreen';
import FieldGuideScreen from './screens/FieldGuideScreen';
import BookScreen from './screens/BookScreen';
import BotanistScreen from './screens/BotanistScreen';
import ProfileScreen from './screens/ProfileScreen';
import AchievementsScreen from './screens/AchievementsScreen';
import StoreScreen from './screens/StoreScreen';
import MonthlyRecapScreen from './screens/MonthlyRecapScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';
import PrivacyScreen from './screens/PrivacyScreen';
import TermsScreen from './screens/TermsScreen';
import HelpScreen from './screens/HelpScreen';
import RestoreAccessScreen from './screens/RestoreAccessScreen';
import SettingsScreen from './screens/SettingsScreen';
import LanguageScreen from './screens/LanguageScreen';
import AboutScreen from './screens/AboutScreen';
import { colors } from './components/theme';
import { CATEGORIES } from './components/categories';
import { pollSubscriptionStatus, PLAN_PRICES } from './components/subscription';
import { completeGoogleSignIn } from './components/restore';
import AlertModal from './components/AlertModal';
import ErrorBoundary from './components/ErrorBoundary';
import TwoRowTabBar from './components/TwoRowTabBar';
import OnboardingScreen from './screens/OnboardingScreen';
import { hasSeenOnboarding } from './components/onboarding';
import { trackAppOpen } from './components/tracking';

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
  cardStyle: { backgroundColor: colors.background },
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
    </ScanStack.Navigator>
  );
}

function CollectionStackNav() {
  return (
    <CollectionStack.Navigator screenOptions={STACK_OPTIONS}>
      <CollectionStack.Screen name="CollectionHome" component={CollectionScreen} />
      <CollectionStack.Screen name="PlantDetail" component={PlantDetailScreen} />
      <CollectionStack.Screen name="InsectDetail" component={InsectDetailScreen} />
      <CollectionStack.Screen name="MushroomDetail" component={MushroomDetailScreen} />
      <CollectionStack.Screen name="CropDetail" component={CropDetailScreen} />
      <CollectionStack.Screen name="TreeDetail" component={TreeDetailScreen} />
      {/* Every category that can be SAVED needs its detail route registered
          here too, not just inside its own scan stack - otherwise tapping that
          item in the Collection navigates to a route this stack doesn't know
          and simply does nothing. */}
      <CollectionStack.Screen name="FishDetail" component={FishDetailScreen} />
      <CollectionStack.Screen name="BirdDetail" component={BirdDetailScreen} />
      <CollectionStack.Screen name="SoundDetail" component={SoundDetailScreen} />
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
      <ProfileStack.Screen name="Store" component={StoreScreen} />
      <ProfileStack.Screen name="MonthlyRecap" component={MonthlyRecapScreen} />
      <ProfileStack.Screen name="Subscription" component={SubscriptionScreen} />
      <ProfileStack.Screen name="Privacy" component={PrivacyScreen} />
      <ProfileStack.Screen name="Terms" component={TermsScreen} />
      <ProfileStack.Screen name="Help" component={HelpScreen} />
      <ProfileStack.Screen name="RestoreAccess" component={RestoreAccessScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
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

  useEffect(() => {
    hasSeenOnboarding().then((seen) => setShowOnboarding(!seen));
  }, []);

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

  if (!i18nReady || showOnboarding === null) {
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
        <OnboardingScreen onDone={() => setShowOnboarding(false)} />
      </SafeAreaProvider>
    );
  }

  return <AppNavigator />;
}

function AppNavigator() {
  const { t } = useTranslation();
  // 'confirmed' | 'pending' | null - drives the post-checkout AlertModal.
  // Entitlement depends on Stripe's webhook landing before the user's next
  // request, which can lose that race - so instead of trusting a single
  // immediate check (or showing nothing at all), poll briefly and give the
  // user an explicit confirmation either way, so a real payment never *looks*
  // like it silently did nothing.
  const [checkoutResult, setCheckoutResult] = useState(null);
  // 'active' | 'other' | 'error' | null - drives the post-Google-sign-in
  // AlertModal, mirroring the checkout flow above. PKCE returns a one-time
  // `code` in the query string (never a raw token) - completeGoogleSignIn
  // exchanges it server-side using the code_verifier stashed earlier in
  // sessionStorage (see components/restore.js).
  const [googleSignInResult, setGoogleSignInResult] = useState(null);

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

  // Return-from-checkout handling.
  //
  // With Hotmart the buyer pays on Hotmart's own page and comes back manually,
  // so there is no session id to look up and no guarantee the return URL
  // carries anything. This still runs when Hotmart is configured to redirect
  // back with ?checkout=success, and degrades to doing nothing when it is not.
  //
  // The conversion event fires from the plan the user chose (kept in session
  // storage when checkout started) rather than from a server lookup, because
  // Hotmart gives the client nothing to look the purchase up with.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;

    try {
      const plan = window.sessionStorage?.getItem('naturelens_checkout_plan');
      if (plan && window.dataLayer) {
        window.dataLayer.push({
          event: 'subscription_completed',
          plan,
          currency: 'USD',
          value: PLAN_PRICES[plan],
        });
      }
      window.sessionStorage?.removeItem('naturelens_checkout_plan');
    } catch (e) {
      // sessionStorage can throw in private-mode browsers; tracking is never
      // allowed to break the return flow.
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('checkout');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);

    // 'pending' is the expected outcome far more often than with Stripe: the
    // webhook grants access against the buyer's EMAIL, and this device is only
    // linked once they confirm that email through Restore Access. The pending
    // dialog is what points them there.
    pollSubscriptionStatus().then((status) => {
      setCheckoutResult(status === 'active' ? 'confirmed' : 'pending');
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer>
          <Tab.Navigator
            // Custom two-row bar: with 8-10 tabs the default single-row layout
            // squeezed each label into ~36px and they visibly overlapped.
            // See components/TwoRowTabBar.js.
            tabBar={(props) => <TwoRowTabBar {...props} />}
            screenOptions={({ route }) => ({
              headerShown: false,
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
          visible={checkoutResult === 'confirmed'}
          title={t('paywall.subscriptionConfirmedTitle')}
          message={t('paywall.subscriptionConfirmedBody')}
          onRequestClose={() => setCheckoutResult(null)}
        />
        <AlertModal
          visible={checkoutResult === 'pending'}
          title={t('paywall.subscriptionPendingTitle')}
          message={t('paywall.subscriptionPendingBody')}
          onRequestClose={() => setCheckoutResult(null)}
        />

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
