import { getCollection } from './storage';
import { getStreakInfo } from './achievements';
import { CATEGORIES } from './categories';

// Monthly recap - "your month in nature".
//
// Built entirely from data the app already stores (the collection's savedAt
// timestamps and the achievements state); no new tracking, no new storage key.
// That matters: a recap that needed its own logging would show nothing for
// everyone who used the app before it shipped, which is the worst possible
// first impression for a feature whose whole job is to feel earned.

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  return { start, end };
}

// savedAt is stored as an ISO string (UTC). Comparing it against local month
// boundaries is the correct behaviour here - the user's "July" is their local
// July, and an item saved at 22:00 on the 31st belongs to that month even
// though its UTC timestamp already reads as the 1st.
function inRange(iso, start, end) {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d >= start && d < end;
}

/**
 * Builds the recap for a month. offset 0 = current month, 1 = last month.
 * Returns null when there is nothing worth showing - a recap of zero finds is
 * not a celebration, it is a reminder that you did not use the app.
 */
export async function getMonthlyRecap(offset = 0) {
  const [collection, streak] = await Promise.all([getCollection(), getStreakInfo()]);
  const { start, end } = monthBounds(offset);

  const items = collection.filter((i) => inRange(i.savedAt, start, end));
  if (items.length === 0) return null;

  const byCategory = {};
  for (const item of items) {
    if (!item.category) continue;
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }

  // Species diversity, not just save count: two photos of the same plant are
  // one species. `id` is the vendor's stable species id where available.
  const uniqueSpecies = new Set(items.map((i) => i.id || i.scientific || i.name)).size;

  const topCategoryKey = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a])[0] || null;

  // Days with at least one save, as a simple activity measure that does not
  // depend on the streak (which is global, not per-month).
  const activeDays = new Set(
    items.map((i) => {
      const d = new Date(i.savedAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  ).size;

  // The most confident identification of the month - a concrete highlight
  // beats another number, and gives the share card something to show.
  const best = items
    .filter((i) => typeof i.confidence === 'number')
    .sort((a, b) => b.confidence - a.confidence)[0] || items[0];

  return {
    month: start.getMonth(),
    year: start.getFullYear(),
    total: items.length,
    uniqueSpecies,
    categoriesUsed: Object.keys(byCategory).length,
    byCategory,
    topCategoryKey,
    topCategoryAccent: topCategoryKey ? CATEGORIES[topCategoryKey]?.accent : null,
    activeDays,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    highlight: best
      ? {
          name: best.name,
          scientific: best.scientific || null,
          confidence: best.confidence ?? null,
          photoUri: best.photoUri || null,
          category: best.category || null,
        }
      : null,
  };
}
