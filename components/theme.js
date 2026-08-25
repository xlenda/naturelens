export const colors = {
  // CORRECAO 11, auditoria de diagramacao 20/08: "o card quase some no fundo".
  // Era literalmente verdade - #1A241F sobre #0E1512 dava contraste WCAG 1.16
  // e uma diferenca de luminancia perceptual de so 7 pontos de L* (o minimo
  // confortavel num tema escuro fica na casa dos 10-14).
  //
  // Foi o FUNDO que escureceu (#0E1512 -> #070B09), nao o card que clareou, e
  // por tres motivos:
  //  1. e UM valor: a base da escada e que estava comprimida, entao surface,
  //     card, surfaceElevated, border, sky, skyMid e zone ganham separacao
  //     todos de uma vez, sem cascata de tokens;
  //  2. clarear o card e bloqueado por cima: ele ja fica a menos de 1 ponto de
  //     L* de surfaceElevated (#1F2A25), entao qualquer clareada que se veja
  //     colide com o token de cima e obriga a remexer em mais tres;
  //  3. contraste de TEXTO: escurecer o fundo melhora todo mundo. O papel
  //     muted ganhou cor propria abaixo para tambem passar AA dentro dos cards.
  //
  // Resultado: card vs fundo vai de 1.16 para 1.24 em WCAG e de 7.0 para 10.4
  // em delta L* (+47%), com text 18.0:1 e textSecondary 10.7:1 sobre o fundo.
  background: '#070B09',
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
  textMuted: '#84968D',
  white: '#FFFFFF',
  success: '#4E9F6B',
  warning: '#E0A951',
  error: '#D96A5A',
  info: '#5AA9C9',
  purple: '#9A7FC7',
};

// Escalas pequenas e semanticas: telas escolhem o papel, nao um numero novo.
// Isso segura o ritmo entre jornadas e deixa a area de toque independente da
// altura visual de chips compactos.
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 22,
  pill: 999,
};

export const control = {
  minTouch: 44,
  primaryHeight: 48,
};

export const lineHeight = {
  screen: 32,
  result: 29,
  section: 24,
  card: 20,
  body: 21,
  caption: 17,
  top: 22,
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
  screenTitle: { fontSize: 26, lineHeight: lineHeight.screen, fontWeight: '800', color: colors.text },
  resultTitle: { fontSize: 24, lineHeight: lineHeight.result, fontWeight: '800', color: colors.text },
  // CORRECAO 10, auditoria de diagramacao 20/08: era 22/800/center/34. O
  // diretor de arte pegou o problema no centralizado - num feed de rolagem o
  // titulo centrado quebra a margem de leitura, porque cada secao recomeca o
  // olho num ponto horizontal diferente do corpo, que e todo alinhado a
  // esquerda. Vira 17/700/left/18: cabeca de secao, nao capa.
  // marginBottom cai de 14 para 10 junto: com 18 em cima, manter 14 embaixo
  // deixaria o titulo quase equidistante dos dois lados - um titulo tem que
  // abracar o conteudo dele, e nao flutuar entre as duas secoes.
  sectionTitle: {
    fontSize: 17,
    lineHeight: lineHeight.section,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'left',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  cardTitle: { fontSize: 15, lineHeight: lineHeight.card, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: lineHeight.body, color: colors.textSecondary },
  caption: { fontSize: 12.5, lineHeight: lineHeight.caption, color: colors.textMuted },
  topTitle: { fontSize: 16, lineHeight: lineHeight.top, fontWeight: '700', color: colors.text },
};

export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 3,
};
