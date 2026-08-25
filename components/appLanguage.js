const SUPPORTED_APP_LANGUAGES = new Set([
  'en',
  'pt',
  'es',
  'de',
  'fr',
  'it',
  'nl',
  'pl',
  'sv',
  'da',
  'cs',
  'tr',
  'ko',
  'zh',
  'zh-hant',
  'hi',
  'ar',
]);

/**
 * Canonical code used by locale filenames and identification providers.
 *
 * i18next intentionally exposes Traditional Chinese as `zh-Hant`, while the
 * published files and API contract use `zh-hant`. Device/browser locales can
 * also arrive as `pt-BR`, `en-US`, `zh-TW` or with underscores. Keeping this
 * normalization in one dependency-free module prevents a screen from silently
 * loading English just because its lazy content uses a different casing.
 */
export function normaliseAppLanguage(value) {
  const raw = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (!raw) return 'en';

  if (
    raw === 'zh-hant'
    || raw.startsWith('zh-hant-')
    || raw === 'zh-tw'
    || raw.startsWith('zh-tw-')
    || raw === 'zh-hk'
    || raw.startsWith('zh-hk-')
    || raw === 'zh-mo'
    || raw.startsWith('zh-mo-')
  ) {
    return 'zh-hant';
  }

  if (SUPPORTED_APP_LANGUAGES.has(raw)) return raw;
  const base = raw.split('-')[0];
  return SUPPORTED_APP_LANGUAGES.has(base) ? base : 'en';
}
