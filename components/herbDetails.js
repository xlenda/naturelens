import { API_BASE } from './apiBase';


const cache = new Map();

// Full herb detail content (overview/preparation/benefits) is much heavier than
// the rest of a language's UI strings, so it lives in its own file and is only
// fetched when the person actually opens the Medicinal Herbs section - not on
// every app launch like the main locale bundle.
export async function getHerbDetails(languageCode) {
  if (cache.has(languageCode)) return cache.get(languageCode);

  const fetchOne = async (code) => {
    const response = await fetch(`${API_BASE}/locales/${code}-herbs.json`);
    if (!response.ok) throw new Error(`Could not load herb details for "${code}"`);
    return response.json();
  };

  const promise = fetchOne(languageCode).catch(() => fetchOne('en'));
  cache.set(languageCode, promise);
  return promise;
}
