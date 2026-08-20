import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const LANGUAGE_STORAGE_KEY = '@textmarker_language';

// Locale JSON files live in public/locales/ and are fetched on demand instead
// of bundled into the JS - with 17 languages, bundling them all upfront would
// add ~180KB to every single visitor's first load, even ones who only ever
// use one language. Two native-only exceptions (see loadLanguage/initI18n):
// English ships in the native bundle and fetched languages are cached in
// AsyncStorage, because a store build has no service worker to fall back on.
import { API_BASE } from './components/apiBase';
import bundledEn from './components/bundledEn';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'cs', label: 'Čeština' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-hant', label: '繁體中文' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ar', label: 'العربية' },
];

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);
const RTL_CODES = ['ar'];
const loadedLanguages = new Set();

// react-native-web's I18nManager is a complete no-op (confirmed by reading
// its own source: forceRTL()/allowRTL() do nothing, isRTL always returns
// false hardcoded) - the RN-standard way to flip layout direction simply
// does not work on this web-only app, the same class of RN-web parity gap
// as Alert.alert() being a no-op there (see project memory). RTL is instead
// driven directly through the DOM: setting `dir` on the root <html> element
// makes the browser's own CSS engine auto-mirror every `flexDirection: 'row'`
// layout in the app for free (row is direction-relative per the CSS
// Flexbox spec) - directional icon glyphs (e.g. a back-chevron) still need
// to be swapped by hand, see components/BackChevron.js.
function applyDocumentDirection(code) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.dir = RTL_CODES.includes(code) ? 'rtl' : 'ltr';
  document.documentElement.lang = code;
}

async function loadLanguage(code) {
  if (loadedLanguages.has(code)) return;

  let translation = null;
  try {
    const response = await fetch(`${API_BASE}/locales/${code}.json`);
    if (response.ok) translation = await response.json();
  } catch (e) {
    // offline / DNS failure - the native cache below may still save the day
  }

  // Native fallback: the last successfully fetched copy. Freshness comes from
  // the fetch above always running first; the cache only answers when the
  // network can't.
  const cacheKey = `@naturelens_locale_${code}`;
  if (!translation && Platform.OS !== 'web') {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) translation = JSON.parse(cached);
    } catch (e) {
      // corrupt cache reads as missing
    }
  }
  if (!translation) throw new Error(`Could not load locale "${code}"`);

  i18n.addResourceBundle(code, 'translation', translation, true, true);
  loadedLanguages.add(code);
  if (Platform.OS !== 'web') {
    AsyncStorage.setItem(cacheKey, JSON.stringify(translation)).catch(() => {});
  }
}

function detectDeviceLanguage() {
  const locales = Localization.getLocales?.() || [];
  const code = locales[0]?.languageCode;
  return SUPPORTED_CODES.includes(code) ? code : 'en';
}

export async function initI18n() {
  let saved = null;
  try {
    saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch (e) {
    saved = null;
  }

  const initialLang = saved && SUPPORTED_CODES.includes(saved) ? saved : detectDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources: {},
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

  // Native ships English inside the bundle (components/bundledEn.native.js);
  // on web this is null and the fetch path below stays exactly as it was.
  if (bundledEn) {
    i18n.addResourceBundle('en', 'translation', bundledEn, true, true);
    loadedLanguages.add('en');
  }

  await loadLanguage('en');
  if (initialLang !== 'en') {
    await loadLanguage(initialLang);
  }
  applyDocumentDirection(initialLang);

  return i18n;
}

export async function setAppLanguage(code) {
  if (!SUPPORTED_CODES.includes(code)) return;
  await loadLanguage(code);
  await i18n.changeLanguage(code);
  applyDocumentDirection(code);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch (e) {
    // ignore persistence failure
  }
}

export default i18n;
