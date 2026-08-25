import { API_BASE } from './apiBase';
import { normaliseAppLanguage } from './appLanguage';


const cache = new Map();

// Full herb detail content (overview/preparation/benefits) is much heavier than
// the rest of a language's UI strings, so it lives in its own file and is only
// fetched when the person actually opens the Medicinal Herbs section - not on
// every app launch like the main locale bundle.
export async function getHerbDetails(languageCode) {
  const code = normaliseAppLanguage(languageCode);
  if (cache.has(code)) return cache.get(code);

  const fetchOne = async (code) => {
    const response = await fetch(`${API_BASE}/locales/${code}-herbs.json`);
    if (!response.ok) throw new Error(`Could not load herb details for "${code}"`);
    return response.json();
  };

  // Never replace a failed reader-language file with English prose. The list
  // remains usable and the unavailable detail block simply stays absent.
  const promise = fetchOne(code).catch(() => {
    // Do not pin a transient CDN/offline failure for the whole app session.
    cache.delete(code);
    return null;
  });
  cache.set(code, promise);
  return promise;
}
