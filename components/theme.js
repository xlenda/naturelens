export const colors = {
  background: '#0E1512',
  surface: '#161F1B',
  surfaceElevated: '#1F2A25',
  card: '#1A241F',
  border: '#26332C',
  // Scene + zone tones. Both are NEIGHBOURS of `background` (one step up), not
  // new hues: the premium look comes from a dark→lighter→dark rhythm across
  // full-bleed bands, and a band in a loud colour reads as a banner instead of
  // as depth. See NatureScene.js / ZoneBand.js.
  sky: '#132019',
  skyMid: '#101A15',
  zone: '#141E19',
  accent: '#4E9F6B',
  accentDark: '#3B7A52',
  accentLight: '#7FC79A',
  text: '#F2F5F3',
  textSecondary: '#B4C2BA',
  textMuted: '#6E7F76',
  white: '#FFFFFF',
  success: '#4E9F6B',
  warning: '#E0A951',
  error: '#D96A5A',
  info: '#5AA9C9',
  purple: '#9A7FC7',
};

export const categoryColors = {
  Overview: '#4E9F6B',
  'Plant ID': '#5AA9C9',
  Care: '#E0A951',
  Toxicity: '#D96A5A',
  Origin: '#9A7FC7',
  Light: '#E0A951',
  Water: '#5AA9C9',
};

// Type scale - the single source of truth for text roles. Before this
// existed each screen improvised: sectionTitle was 22/800-centred in
// Discover/Subscription but 15/700-left in MonthlyRecap, and the doctrine
// ("section titles centre; card titles and running text stay left") lived
// only in memory. Spread these into StyleSheet entries; screens may still
// override spacing, never size/weight/alignment.
export const type = {
  screenTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: 34,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  caption: { fontSize: 12.5, color: colors.textMuted },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
};

export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 3,
};
