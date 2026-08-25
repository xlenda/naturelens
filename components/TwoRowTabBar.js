import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import CategoryIcon from './CategoryIcon';
import CategoryPickerModal from './CategoryPickerModal';
import { CATEGORIES } from './categories';
import { colors, control } from './theme';

// Dock por papel: um seletor abre todas as categorias de identificacao, e a
// fileira fixa leva ao que vem depois. A antiga faixa lateral escondia peixe,
// passaro e som fora da tela sem nenhum sinal de que era possivel arrastar.

// Route names that belong on the bottom row. Everything else is a scan
// category and goes above. Kept as an explicit list because these are fixed app
// sections, unlike categories which come from CATEGORIES.
const BOTTOM_ROW = new Set(['Collection', 'Profile', 'Discover', 'Botanist']);

const CATEGORY_BY_ROUTE = Object.values(CATEGORIES).reduce((byRoute, category) => {
  byRoute[category.tabLabel] = category;
  return byRoute;
}, {});

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
// Conferido rota a rota antes de esconder: todas tem chevron de voltar no topo,
// via TopBar com onBack ou TouchableOpacity + BackChevron proprio. Ninguem fica
// preso. Nenhuma tela do app le useBottomTabBarHeight e todas ja carregam o
// proprio paddingBottom no scroll, entao sumir com o dock nao corta conteudo nem
// deixa buraco.
const HIDE_DOCK_ON = new Set([
  'Specimen', 'PlantDetail', 'TreeDetail', 'InsectDetail', 'MushroomDetail', 'CropDetail',
  'FishDetail', 'BirdDetail', 'SoundDetail', 'CareTopics', 'AgronomyWorkspace',
  'ObservationWorkspace', 'HerbDetail',
  'SpeciesDetail', 'TopicDetail', 'FieldGuide', 'Book', 'Settings', 'Language', 'About',
  'Privacy', 'Terms', 'Help', 'Subscription', 'RestoreAccess', 'Store',
  'Achievements', 'Community', 'MonthlyRecap',
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

// O NavigationContainer entrega a arvore completa; a tabBar recebe apenas seu
// recorte e, em alguns renders do Stack, a rota do tab vem sem `route.state`.
// Esta funcao aceita os dois formatos para que App.js possa passar a folha real
// e a barra ainda tenha um fallback seguro enquanto o container inicializa.
export function focusedLeafNameFromState(state) {
  if (!state?.routes?.length) return undefined;
  const route = state.routes[state.index ?? state.routes.length - 1];
  return focusedLeafName(route);
}

function TabButton({ route, descriptor, navigation, isFocused, onBeforePress }) {
  const { options } = descriptor;
  const label = options.tabBarLabel ?? route.name;
  const color = isFocused ? colors.accent : colors.textMuted;

  const onPress = () => {
    onBeforePress?.();
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

  const iconSize = 24;
  const icon = options.tabBarIcon
    ? options.tabBarIcon({ color, size: iconSize, focused: isFocused })
    : <CategoryIcon name="ellipse" size={iconSize - 2} color={color} />;

  return (
    <TouchableOpacity
      style={styles.tab}
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
        style={[styles.label, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function TwoRowTabBar({ state, descriptors, navigation, focusedLeafRouteName }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [pickerVisible, setPickerVisible] = React.useState(false);

  const scan = [];
  const bottom = [];
  state.routes.forEach((route, index) => {
    (BOTTOM_ROW.has(route.name) ? bottom : scan).push({ route, index });
  });

  // App.js loads the saved category before mounting the navigator and shares
  // the value/updater through custom screen options. A second storage listener
  // in the dock would create two competing sources of truth for the same tap.
  const dockOptions = descriptors[scan[0]?.route.key]?.options || {};
  const initialCategoryRouteName = CATEGORIES[dockOptions.natureLensInitialCategory]?.tabLabel;
  const initiallyActiveCategory = scan.find(({ index }) => state.index === index);
  const initialPreferredRouteName = initiallyActiveCategory?.route.name
    || (scan.some(({ route }) => route.name === initialCategoryRouteName)
      ? initialCategoryRouteName
      : scan[0]?.route.name);
  const [preferredRouteName, setPreferredRouteName] = React.useState(initialPreferredRouteName);

  // DEPOIS dos hooks de proposito: sair antes de useState quebraria a
  // ordem dos hooks entre um render com dock e outro sem (auditoria de
  // diagramacao 20/08).
  // Barra de ALTURA ZERO, nunca `null`. Medido com toque real (CDP, 390x844)
  // em producao: tirar a barra do fluxo - devolvendo null OU deixando ela
  // absoluta - faz a cena crescer ate a altura do conteudo dentro de uma caixa
  // de 844 com overflow:hidden. O ScrollView nunca vira area rolavel e o dedo
  // nao rola nada. Como irmao flex de altura 0 ela nao ocupa espaco e a cena
  // volta a ter altura definida. Foi assim nas 3 rotas medidas.
  const leafRouteName = focusedLeafRouteName || focusedLeafNameFromState(state);
  if (HIDE_DOCK_ON.has(leafRouteName)) {
    return <View style={styles.hiddenDock} />;
  }

  const hasActiveScan = scan.some(({ index }) => state.index === index);
  const resolvedPreferredRouteName = scan.some(({ route }) => route.name === preferredRouteName)
    ? preferredRouteName
    : initialPreferredRouteName;
  const pickerOptions = scan.map(({ route, index }) => {
    const descriptor = descriptors[route.key];
    const { options } = descriptor;
    const active = state.index === index;
    const selected = active || (!hasActiveScan && route.name === resolvedPreferredRouteName);
    const label = options.tabBarLabel ?? route.name;
    const category = CATEGORY_BY_ROUTE[route.name];
    const accent = category?.accent || colors.accent;
    const icon = options.tabBarIcon
      ? options.tabBarIcon({ color: accent, size: 20, focused: selected })
      : <CategoryIcon name="ellipse" size={18} color={accent} />;
    return {
      key: route.key,
      route,
      index,
      label: String(label),
      accessibilityLabel: options.tabBarAccessibilityLabel ?? String(label),
      accent,
      icon,
      category,
      active,
      selected,
      onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
    };
  });

  const activeCategory = pickerOptions.find((option) => option.active);
  const rememberedCategory = pickerOptions.find(
    (option) => option.route.name === resolvedPreferredRouteName
  );
  const currentCategory = activeCategory || rememberedCategory || pickerOptions[0];

  const rememberCategory = (option) => {
    if (!option?.route?.name) return;
    setPreferredRouteName(option.route.name);
    dockOptions.natureLensRememberCategory?.(option.category?.key);
  };

  const rememberActiveCategory = () => {
    if (activeCategory) rememberCategory(activeCategory);
  };

  const selectCategory = (option) => {
    setPickerVisible(false);
    rememberCategory(option);
    const event = navigation.emit({
      type: 'tabPress',
      target: option.route.key,
      canPreventDefault: true,
    });
    if (!option.active && !event.defaultPrevented) navigation.navigate(option.route.name);
  };

  const openCurrentCapture = () => {
    if (!currentCategory?.category) return;
    rememberCategory(currentCategory);
    const event = navigation.emit({
      type: 'tabPress',
      target: currentCategory.route.key,
      canPreventDefault: true,
    });
    if (event.defaultPrevented) return;

    const categoryKey = currentCategory.category.key;
    if (categoryKey === 'sound') {
      navigation.navigate(currentCategory.route.name, { screen: 'SoundHome' });
      return;
    }
    navigation.navigate(currentCategory.route.name, {
      screen: 'ScanHome',
      params: {
        category: categoryKey,
        captureRequestId: `${Date.now()}`,
      },
    });
  };

  const render = (entries) =>
    entries.map(({ route, index }) => (
      <TabButton
        key={route.key}
        route={route}
        descriptor={descriptors[route.key]}
        navigation={navigation}
        isFocused={state.index === index}
        onBeforePress={rememberActiveCategory}
      />
    ));

  // Dock pilula: margens, nunca position absolute; fundo proprio no wrapper.
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.categoryTrigger}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('identify.switchCategoryLabel')}
          accessibilityState={{ expanded: pickerVisible }}
        >
          <View
            style={[
              styles.categoryTriggerIcon,
              { backgroundColor: (currentCategory?.accent || colors.accent) + '22' },
            ]}
          >
            {currentCategory?.icon || (
              <CategoryIcon name="scan-outline" size={20} color={colors.accent} />
            )}
          </View>
          <Text style={styles.categoryTriggerLabel} numberOfLines={1}>
            {currentCategory?.label || t('identify.switchCategoryTitle')}
          </Text>
          <CategoryIcon name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {bottom.length > 0 && (
          <View style={[styles.row, styles.rowBottom]}>
            {render(bottom.slice(0, 2))}
            <View style={styles.captureSlot}>
              <TouchableOpacity
                style={styles.captureButton}
                activeOpacity={0.82}
                onPress={openCurrentCapture}
                accessibilityRole="button"
                accessibilityLabel={t('identify.centralCapture')}
                accessibilityHint={currentCategory?.category
                  ? t(`categories.${currentCategory.category.key}.scanHint`)
                  : undefined}
              >
                <View
                  style={[
                    styles.captureCircle,
                    { backgroundColor: currentCategory?.accent || colors.accent },
                  ]}
                >
                  <CategoryIcon
                    name={currentCategory?.category?.key === 'sound' ? 'mic' : 'camera'}
                    size={27}
                    color={colors.white}
                  />
                </View>
                <Text style={styles.captureLabel} numberOfLines={1} adjustsFontSizeToFit>
                  {t('identify.centralCapture')}
                </Text>
              </TouchableOpacity>
            </View>
            {render(bottom.slice(2))}
          </View>
        )}
      </View>
      <CategoryPickerModal
        visible={pickerVisible}
        options={pickerOptions}
        onSelect={selectCategory}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  categoryTrigger: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTriggerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTriggerLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  // No FLUXO de proposito. A versao absoluta desta barra foi medida em
  // producao (toque real, CDP 390x844) e travou o scroll em TODAS as rotas,
  // inclusive nas que rolavam antes: sem um irmao flex ocupando espaco, a
  // cena cresce ate a altura do conteudo e o ScrollView nunca fica menor que
  // ele. A barra reserva a propria altura, e e assim que a cena ganha altura
  // definida. Nas rotas sem dock existe o hiddenDock (altura 0) no lugar.
  dock: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  hiddenDock: { height: 0 },
  bar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 26,
    paddingTop: 4,
    paddingBottom: 3,
    overflow: 'visible',
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
    marginTop: 2,
    minHeight: 64,
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
  iconSlot: { alignItems: 'center', justifyContent: 'center' },
  iconSlotActive: {
    backgroundColor: colors.accent + '22',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  label: { fontSize: 10.5, fontWeight: '600', marginTop: 3 },
  // The circle rises above its neighbours, but its 76px slot remains a normal
  // flex child. Do not make this absolute: the dock's measured height is what
  // keeps every nested ScrollView touch-scrollable on mobile.
  captureSlot: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
  },
  captureButton: {
    width: '100%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'flex-start',
    transform: [{ translateY: -5 }],
  },
  captureCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.34,
    shadowRadius: 8,
    elevation: 10,
  },
  captureLabel: {
    color: colors.text,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 2,
    maxWidth: '100%',
  },
});
