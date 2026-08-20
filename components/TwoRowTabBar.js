import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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

  const scan = [];
  const bottom = [];
  state.routes.forEach((route, index) => {
    (BOTTOM_ROW.has(route.name) ? bottom : scan).push({ route, index });
  });

  const scanRows = chunkBalanced(scan, MAX_PER_SCAN_ROW);
  const tight = scanRows.length > 1;

  const render = (entries, compact) =>
    entries.map(({ route, index }) => (
      <TabButton
        key={route.key}
        route={route}
        descriptor={descriptors[route.key]}
        navigation={navigation}
        isFocused={state.index === index}
        compact={compact}
        tight={compact && tight}
      />
    ));

  // Dock pílula: the bar floats free of the screen edges instead of being
  // welded to them. Two rules from the Cosmic doctrine are load-bearing here:
  //
  //  - position by MARGINS, never `position: absolute`. An absolute bar covers
  //    the bottom of every screen behind it, which is the viewport bug class
  //    that has already cost real conversions in another app.
  //  - the outer View needs its own backgroundColor: on web the gap around the
  //    pill renders white without it.
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {scanRows.map((entries, i) => (
          // Index as key is safe here: rows are positional slots, not identities -
          // the tabs inside carry their own stable route.key.
          <View key={`scan-${i}`} style={styles.row}>
            {render(entries, true)}
          </View>
        ))}
        {bottom.length > 0 && (
          <View style={[styles.row, styles.rowBottom]}>{render(bottom, false)}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
