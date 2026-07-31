import { API_BASE } from './apiBase';


const cache = new Map();

// Full field-guide content for the Discover collections (fish and birds):
// overview, habitat and a curiosity per species. Same two-tier split already
// proven for the 98 herbs - the light list (name/sci/note) rides in the main
// locale bundle every boot, while this heavier prose is fetched only when
// someone actually opens a species.
//
// Falls back to English rather than failing: a Turkish user who opens a fish
// should read an English description, not an error.
export async function getSpeciesDetails(languageCode) {
  if (cache.has(languageCode)) return cache.get(languageCode);

  const fetchOne = async (code) => {
    const response = await fetch(`${API_BASE}/locales/${code}-species.json`);
    if (!response.ok) throw new Error(`Could not load species details for "${code}"`);
    return response.json();
  };

  const promise = fetchOne(languageCode).catch(() => fetchOne('en'));
  cache.set(languageCode, promise);
  return promise;
}

// Looks a species up across EVERY group in the file, rather than a hardcoded
// list of two.
//
// The old version read `fishDetails || birdDetails` by name. That is a trap: a
// new collection's prose could ship, fully translated into all 17 languages, and
// every species in it would open to a blank page until someone remembered to add
// its group here. Iterating the file means adding a collection is a content
// change only - which is the whole point of keeping the content in JSON.
//
// The id is the stable camelCase key shared by every language (display names
// differ per locale, so they cannot be the join key), and ids are unique across
// groups, so the first match is the right one.
export async function getSpeciesDetail(languageCode, id) {
  try {
    const data = await getSpeciesDetails(languageCode);
    if (!data || typeof data !== 'object') return null;
    for (const group of Object.values(data)) {
      if (group && typeof group === 'object' && group[id]) return group[id];
    }
    return null;
  } catch (e) {
    return null;
  }
}
