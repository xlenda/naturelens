import { Platform } from 'react-native';
import { colors } from './theme';

// tabLabel doubles as the React Navigation route name (App.js) - keep it a stable
// English identifier; translated tab text is set separately via t() in App.js.
export const CATEGORIES = {
  plant: {
    key: 'plant',
    tabLabel: 'Plants',
    icon: 'leaf-outline',
    tabIcon: 'leaf',
    accent: colors.accent,
    accentDark: colors.accentDark,
    detailRoute: 'PlantDetail',
  },
  insect: {
    key: 'insect',
    tabLabel: 'Insects',
    icon: 'bug-outline',
    tabIcon: 'bug',
    accent: colors.warning,
    accentDark: '#8A6A2C',
    detailRoute: 'InsectDetail',
  },
  mushroom: {
    key: 'mushroom',
    tabLabel: 'Mushrooms',
    icon: 'mushroom-outline',
    tabIcon: 'mushroom',
    accent: colors.purple,
    accentDark: '#6B5499',
    detailRoute: 'MushroomDetail',
  },
  crop: {
    key: 'crop',
    tabLabel: 'Crops',
    icon: 'medkit-outline',
    tabIcon: 'medkit',
    accent: colors.info,
    accentDark: '#2F6F85',
    detailRoute: 'CropDetail',
  },
  tree: {
    key: 'tree',
    tabLabel: 'Trees',
    icon: 'tree-outline',
    tabIcon: 'tree',
    accent: '#A67C52',
    accentDark: '#7A5C3E',
    detailRoute: 'TreeDetail',
    // Merged into the Plants tab (Lenda, 2026-07-28: "na parte de árvore é a
    // mesma coisa de plantas, pode tirar"). He is right - identify.js routes
    // `tree` to the exact same Plant.id host, key and DETAILS as `plant`, so
    // the two tabs were asking the same model the same question and only the
    // label differed. Freeing the slot made room for Birds.
    //
    // The entry deliberately STAYS here rather than being deleted: trees
    // already saved to someone's collection carry `category: 'tree'`, and
    // removing this would make CATEGORIES.tree undefined - breaking their
    // colour, icon and TreeDetail route on open. `enabled: false` only removes
    // it from CATEGORY_LIST (so no tab, and the "one of every category"
    // achievement no longer demands it); the backend still accepts the
    // category, and TreeDetailScreen stays registered for old items.
    enabled: false,
  },
  fish: {
    key: 'fish',
    tabLabel: 'Fish',
    icon: 'fish-outline',
    tabIcon: 'fish',
    // Deep teal - reads as water and stays clearly distinct from crop's
    // lighter cyan (#5AA9C9), which is the nearest existing category colour.
    accent: '#3D9E9E',
    accentDark: '#2C7373',
    detailRoute: 'FishDetail',
  },
  bird: {
    key: 'bird',
    tabLabel: 'Birds',
    // MaterialCommunityIcons ships no "bird-outline" - same glyph both states.
    icon: 'bird',
    tabIcon: 'bird',
    accent: '#E0785A',
    accentDark: '#B85C42',
    detailRoute: 'BirdDetail',
    // Birds run on Nyckel, not Kindwise, and need a cloned classifier function
    // whose id lives in NYCKEL_BIRD_FUNCTION_ID server-side. Until that exists
    // the backend rejects the category outright, so the tab must not appear
    // either. Flip by setting EXPO_PUBLIC_BIRD_ENABLED=1 at build time (both
    // sides have to be configured - the server env var alone won't show the tab
    // and this flag alone won't make the API work).
    // Live since 2026-07-28: the Nyckel "Bird Identifier" function was cloned
    // (function_9coz8spa4itrqmil) and the invoke payload shape was verified with
    // a real call before this was switched on.
    enabled: true,
  },
  sound: {
    key: 'sound',
    tabLabel: 'Sounds',
    // Ionicons has both; no MaterialCommunityIcons detour needed.
    icon: 'mic-outline',
    tabIcon: 'mic',
    // Warm violet - the only category with no camera, so it reads as its own
    // kind of thing rather than a sibling of the photo tabs.
    accent: '#9A7FC7',
    accentDark: '#6B5499',
    detailRoute: 'SoundDetail',
    // Needs a Perch inference host (PERCH_ENDPOINT server-side) because the
    // 390 MB model cannot live in a Vercel function.
    //
    // Live since 2026-07-30: the host runs at https://perch.naturelensapp.cloud
    // (systemd unit `perch` on the VPS, uvicorn on 127.0.0.1:8200 behind nginx +
    // Let's Encrypt, MemoryMax=2G so it can never OOM the dashboard sharing the
    // box). Verified end to end against real Commons recordings before switching
    // on: 4/5 species correct, white noise and silence both refused.
    //
    // A literal expression rather than an EXPO_PUBLIC_* flag, matching bird:
    // the build runs locally, so a env-gated tab would silently vanish for
    // everyone the first time someone deployed without the .env file present.
    //
    // Android and iOS use the native PCM adapter; web negotiates the browser's
    // codec. Every path becomes the same mono 32 kHz contract before Perch.
    enabled: Platform.OS === 'web' || Platform.OS === 'android' || Platform.OS === 'ios',
  },
};

// Only categories that can actually complete a scan today.
//
// IMPORTANT: this is what the "save one of every category" achievement counts
// against (see components/achievements.js). If a disabled category leaked into
// this list, that achievement would become permanently impossible - you can
// never save an entry for a category whose backend refuses every request.
// Keep the filter, and keep CATEGORIES itself complete so that lookups for
// already-saved collection items never come back undefined.
export const CATEGORY_LIST = Object.values(CATEGORIES).filter((c) => c.enabled !== false);
