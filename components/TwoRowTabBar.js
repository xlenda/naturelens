import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CategoryIcon from './CategoryIcon';
import { colors } from './theme';

// Multi-row bottom tab bar.
//
// Why this exists: the app grew past 10 tabs (scan categories + Collection,
// Profile, Discover, Botanist). React Navigation's default bar lays every tab
// out in a single row with flex: 1, so on a normal phone each tab got ~36px and
// the labels physically overlapped each other - reported by Lenda as "uma
// palavra em cima da outra".
//
// The split is by ROLE, not by count: the top row(s) are what you can scan, the
// last row is where you go afterwards. That keeps the grouping meaningful as
// categories are added, and means the bottom row stays roomy no matter how many
// categories exist.
//
// Labels are given the space to survive: scan rows use a smaller font and
// `numberOfLines={1}` with `adjustsFontSizeToFit`, so a long label ("Cogumelos",
// "Pássaros") shrinks to fit its own cell instead of spilling into the next one.

// Route names that belong on the bottom row. Everything else is a scan
// category and goes above. Kept as an explicit list because these are fixed app
// sections, unlike categories which come from CATEGORIES.
const BOTTOM_ROW = new Set(['Collection', 'Profile', 'Discover', 'Botanist']);

// Auditoria de diagramacao 20/08: nestas rotas o dock some INTEIRO - as duas
// fileiras, nao so os chips de categoria. Sao ~120px de dock + o respiro do
// wrapper devolvidos a leitura em toda tela de detalhe e no manual.
//
// Por que null e nao "so a fileira de navegacao": dentro do perfil de uma
// especie o seletor de categoria de scan nao significa nada, e a fileira de
// navegacao ali e pior que inutil - trocar de aba a partir de um detalhe deixa
// a pilha da aba antiga empilhada, entao voltar nela reabre o detalhe que a
// pessoa achou que tinha fechado. O padrao nativo (hidesBottomBarWhenPushed)
// faz exatamente isto.
//
// Conferido rota a rota antes de esconder: TODAS as 24 tem chevron de voltar no
// topo - as 9 de detalhe + CareTopics/Settings/Language/About via TopBar com
// onBack, as outras 10 com TouchableOpacity + BackChevron proprio. Ninguem fica
// preso. Nenhuma tela do app le useBottomTabBarHeight e todas ja carregam o
// proprio paddingBottom no scroll (40-120px), entao sumir com o dock nao corta
// conteudo nem deixa buraco.
const HIDE_DOCK_ON = new Set([
  'PlantDetail', 'TreeDetail', 'InsectDetail', 'MushroomDetail', 'CropDetail',
  'FishDetail', 'BirdDetail', 'SoundDetail', 'CareTopics', 'HerbDetail',
  'SpeciesDetail', 'FieldGuide', 'Book', 'Settings', 'Language', 'About',
  'Privacy', 'Terms', 'Help', 'Subscription', 'RestoreAccess', 'Store',
  'Achievements', 'MonthlyRecap',
]);

// state.routes[state.index] e o TAB, nao a tela: a tela real vive na pilha
// daquela aba. Desce ate a folha em vez de olhar so um nivel, porque a arvore
// pode ganhar profundidade (Discover -> TopicDetail -> ... ) sem ninguem
// lembrar de mexer aqui.
//
// No primeiro render o state aninhado ainda nao existe (a pilha so se registra
// depois de montar): ai a folha e o proprio tab, o nome nao esta na lista e o
// dock aparece - default seguro, porque o erro barato e mostrar o dock demais,
// nunca esconder num lugar sem saida. O fallback `routes.length - 1` e o mesmo
// do getFocusedRouteNameFromRoute do react-navigation: numa pilha o topo e o
// que esta em foco quando index vem undefined.
function focusedLeafName(route) {
  let current = route;
  while (current?.state?.routes?.length) {
    const nested = current.state;
    const next = nested.routes[nested.index ?? nested.routes.length - 1];
    if (!next) break;
    current = next;
  }
  return current?.name;
}

// Above this many scan tabs, one row stops being readable and gets split in
// two. 6 is the measured limit: on a 360px screen that is 60px per cell, which
// fits the longest translated label at the compact font size. A 7th cell drops
// every cell to ~51px, and `adjustsFontSizeToFit` is a no-op on react-native-web
// (this ships as a PWA), so the label would truncate instead of shrinking.
const MAX_PER_SCAN_ROW = 6;

// Split into balanced rows rather than filling the first to MAX and leaving a
// remainder - 4+3 looks intentional, 6+1 looks broken.
function chunkBalanced(items, maxPerRow) {
  if (items.length <= maxPerRow) return [items];
  const rows = Math.ceil(items.length / maxPerRow);
  const perRow = Math.ceil(items.length / rows);
  const out = [];
  for (let i = 0; i < items.length; i += perRow) out.push(items.slice(i, i + perRow));
  return out;
}

function TabButton({ route, descriptor, navigation, isFocused, compact, tight }) {
  const { options } = descriptor;
  const label = options.tabBarLabel ?? route.name;
  const color = isFocused ? colors.accent : colors.textMuted;

  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const onLongPress = () => {
    navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  // `tight` shaves a few pixels off every scan row when there are two of them,
  // so a third row does not swallow a fifth of the screen.
  const iconSize = compact ? (tight ? 19 : 21) : 24;
  const icon = options.tabBarIcon
    ? options.tabBarIcon({ color, size: iconSize, focused: isFocused })
    : <CategoryIcon name="ellipse" size={iconSize - 2} color={color} />;

  return (
    <TouchableOpacity
      style={[styles.tab, tight && styles.tabTight]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
    >
      {/* Fixed-height slot for the glyph.
          Icons come from two different fonts - Ionicons for most categories,
          MaterialCommunityIcons for mushroom/tree/bird, because Ionicons has no
          glyph for those. The two fonts have different metrics, so at the same
          `size` their rendered boxes are different heights. Stacked directly
          above the label that pushed "Cogumelos" and "Pássaros" visibly higher
          than their neighbours - the single sloppiest-looking thing in the app,
          and a real misalignment rather than a design opinion. Reserving the
          same height for every icon makes every label start on the same line.

          Leito colorido na aba ativa (diagramacao-premium, "dock pilula"): a
          soft accent bed behind the focused icon. Style-only, on this slot
          View - the TouchableOpacity above stays byte for byte. */}
      <View
        style={[
          styles.iconSlot,
          { height: iconSize + 2 },
          isFocused && styles.iconSlotActive,
        ]}
      >
        {icon}
      </View>
      <Text
        style={[compact ? styles.labelCompact : styles.label, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function TwoRowTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef(null);

  const scan = [];
  const bottom = [];
  state.routes.forEach((route, index) => {
    (BOTTOM_ROW.has(route.name) ? bottom : scan).push({ route, index });
  });

  // Dock compacto (pedido do dono: "ta ocupando muito espaco embaixo").
  // As categorias de scan deixaram de ser 2 fileiras empilhadas e viraram UMA
  // fileira de chips horizontais rolaveis (icone + nome lado a lado), no mesmo
  // padrao das abas do manual - ~50px devolvidos pra tela. O chip ativo entra
  // em cena sozinho: scrollTo aproximado por indice, suficiente para 7 chips.
  const activeScanPos = scan.findIndex(({ index }) => index === state.index);
  React.useEffect(() => {
    if (activeScanPos >= 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ x: Math.max(0, activeScanPos * 92 - 92), animated: true });
    }
  }, [activeScanPos]);

  // DEPOIS dos hooks de proposito: sair antes de useRef/useEffect quebraria a
  // ordem dos hooks entre um render com dock e outro sem (auditoria de
  // diagramacao 20/08).
  if (HIDE_DOCK_ON.has(focusedLeafName(state.routes[state.index]))) return null;

  const renderChip = ({ route, index }) => {
    const descriptor = descriptors[route.key];
    const { options } = descriptor;
    const isFocused = state.index === index;
    const label = options.tabBarLabel ?? route.name;
    const color = isFocused ? colors.accent : colors.textMuted;
    const icon = options.tabBarIcon
      ? options.tabBarIcon({ color, size: 16, focused: isFocused })
      : <CategoryIcon name="ellipse" size={14} color={color} />;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };
    return (
      <TouchableOpacity
        key={route.key}
        style={[styles.chip, isFocused && styles.chipActive]}
        onPress={onPress}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
      >
        {icon}
        <Text style={[styles.chipLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const render = (entries, compact) =>
    entries.map(({ route, index }) => (
      <TabButton
        key={route.key}
        route={route}
        descriptor={descriptors[route.key]}
        navigation={navigation}
        isFocused={state.index === index}
        compact={compact}
        tight={false}
      />
    ));

  // Dock pilula: margens, nunca position absolute; fundo proprio no wrapper.
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {scan.map(renderChip)}
        </ScrollView>
        {bottom.length > 0 && (
          <View style={[styles.row, styles.rowBottom]}>{render(bottom, false)}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
  },
  chipActive: { backgroundColor: colors.accent + '22' },
  chipLabel: { fontSize: 11, fontWeight: '700' },
  dock: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  bar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 26,
    paddingTop: 6,
    paddingBottom: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    marginTop: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    // Horizontal breathing room so adjacent labels never touch even at their
    // widest; combined with adjustsFontSizeToFit this is what actually stops
    // the overlap.
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  tabTight: { paddingVertical: 2 },
  iconSlot: { alignItems: 'center', justifyContent: 'center' },
  iconSlotActive: {
    backgroundColor: colors.accent + '22',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  label: { fontSize: 10.5, fontWeight: '600', marginTop: 3 },
  labelCompact: { fontSize: 9, fontWeight: '600', marginTop: 2 },
});
