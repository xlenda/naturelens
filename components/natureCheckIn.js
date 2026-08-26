export const CHECK_IN_VERSION = 1;

export const HABITATS = Object.freeze(['home', 'garden', 'trail', 'farm', 'water', 'urban', 'other']);

function cleanText(value, limit) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, limit);
  return clean || null;
}

export function createNatureCheckIn(value) {
  const city = cleanText(value?.city, 80);
  const country = cleanText(value?.country, 80);
  const habitat = HABITATS.includes(value?.habitat) ? value.habitat : null;
  if (!city || !country || !habitat) return null;
  const observedAt = typeof value?.observedAt === 'string' && Number.isFinite(Date.parse(value.observedAt))
    ? new Date(value.observedAt).toISOString()
    : new Date().toISOString();
  return {
    schemaVersion: CHECK_IN_VERSION,
    city,
    country,
    countryCode: cleanText(value?.countryCode, 2)?.toUpperCase() || null,
    region: cleanText(value?.region, 80),
    habitat,
    note: cleanText(value?.note, 240),
    observedAt,
    precision: 'city',
  };
}

export function sanitiseNatureCheckIn(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== CHECK_IN_VERSION) return null;
  return createNatureCheckIn(value);
}

export function publicCheckIn(value) {
  const checkIn = sanitiseNatureCheckIn(value);
  if (!checkIn) return null;
  return {
    city: checkIn.city,
    country: checkIn.country,
    countryCode: checkIn.countryCode,
    habitat: checkIn.habitat,
    observedAt: checkIn.observedAt,
    precision: 'city',
  };
}
