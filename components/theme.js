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

export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 3,
};
