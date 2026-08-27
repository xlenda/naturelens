import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '../components/CategoryIcon';
import { colors, shadow } from '../components/theme';
import DailyMissionsCard from '../components/DailyMissionsCard';
import FindThumb from '../components/FindThumb';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { BOOKS } from '../components/books';
import { getOwnedRewards } from '../components/rewardOwnership';
import MainScreenHeader from '../components/MainScreenHeader';
import SectionHeading from '../components/SectionHeading';
import { TopBarIcon } from '../components/TopBar';
import MascotWelcomeCard from '../components/MascotWelcomeCard';

// This list is what actually renders - a collection that exists only in the
// locale files but not here is invisible. (Learned the hard way: the fish and
// bird collections shipped translated into 17 languages and this hardcoded
// list silently never showed them.)
const TOPICS = [
  { id: '4', topicKey: 'medicinalHerbs', icon: 'medkit-outline', color: colors.error },
  { id: '6', topicKey: 'oceanAndRiverFish', icon: 'fish-outline', color: '#3D9E9E' },
  { id: '7', topicKey: 'birdsOfTheWorld', icon: 'bird', color: '#E0785A' },
  // Added 2026-07-30 so that every scan category has somewhere to read, not just
  // somewhere to point a camera. Colours match each category's tab accent, so a
  // collection is recognisably "the mushroom one" before its title is read.
  { id: '8', topicKey: 'gardenInsects', icon: 'bug-outline', color: colors.warning },
  { id: '9', topicKey: 'fungiOfTheWorld', icon: 'mushroom-outline', color: colors.purple },
  { id: '10', topicKey: 'fromFieldToPlate', icon: 'nutrition-outline', color: colors.info },
  // The sound collection exists to give the new record-a-call feature something
  // to send people to: ten species you find by ear, which is the whole point.
  { id: '11', topicKey: 'heardNotSeen', icon: 'mic-outline', color: '#9A7FC7' },
  { id: '1', topicKey: 'airPurifying', icon: 'sparkles-outline', color: colors.accent },
  { id: '2', topicKey: 'beginnerSucculents', icon: 'sunny-outline', color: colors.warning },
  { id: '3', topicKey: 'petSafe', icon: 'paw-outline', color: colors.info },
  { id: '5', topicKey: 'floweringPerennials', icon: 'flower-outline', color: colors.purple },
];

const SPECIES_META = [
  { speciesKey: 'fiddleLeafFig', color: colors.accent },
  { speciesKey: 'bostonFern', color: colors.info },
  { speciesKey: 'jadePlant', color: colors.warning },
  { speciesKey: 'calathea', color: colors.purple },
];

// "Trending" species rotate WEEKLY, drawn from the fish and bird collections on
// top of the four fixed plants. Before this the same four plants sat there
// forever, which made the section read as decoration rather than content - and
// gave a returning user nothing new to look at.
//
// Deterministic by ISO week, not random: everyone sees the same picks in the
// same week (so it is supportable and shareable), and reopening the app cannot
// reshuffle the row under the user's thumb.
const ROTATING_POOL = [
  { id: 'clownfish', topicKey: 'oceanAndRiverFish', icon: 'fish-outline', color: '#3D9E9E' },
  { id: 'peregrineFalcon', topicKey: 'birdsOfTheWorld', icon: 'bird', color: '#E0785A' },
  { id: 'atlanticSalmon', topicKey: 'oceanAndRiverFish', icon: 'fish-outline', color: '#3D9E9E' },
  { id: 'commonKingfisher', topicKey: 'birdsOfTheWorld', icon: 'bird', color: '#E0785A' },
  { id: 'redLionfish', topicKey: 'oceanAndRiverFish', icon: 'fish-outline', color: '#3D9E9E' },
  { id: 'scarletMacaw', topicKey: 'birdsOfTheWorld', icon: 'bird', color: '#E0785A' },
  { id: 'northernPike', topicKey: 'oceanAndRiverFish', icon: 'fish-outline', color: '#3D9E9E' },
  { id: 'emperorPenguin', topicKey: 'birdsOfTheWorld', icon: 'bird', color: '#E0785A' },
];

// Weeks since the epoch - changes exactly once every seven days.
function currentWeek() {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

export default function DiscoverScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const facts = t('discover.facts', { returnObjects: true });
  // Start on a different fact each day instead of always the first one - with
  // 40 facts, always opening on the same one wastes 39 of them on anyone who
  // does not tap.
  const [factIndex, setFactIndex] = useState(() => {
    const list = t('discover.facts', { returnObjects: true });
    const len = Array.isArray(list) ? list.length : 1;
    const dayOfYear = Math.floor(Date.now() / 86400000);
    return len > 0 ? dayOfYear % len : 0;
  });

  // Two weekly picks, deterministic so everyone sees the same pair this week.
  const rotating = (() => {
    const week = currentWeek();
    const a = ROTATING_POOL[week % ROTATING_POOL.length];
    const b = ROTATING_POOL[(week * 3 + 1) % ROTATING_POOL.length];
    return b.id === a.id ? [a] : [a, b];
  })();

  const nextFact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFactIndex((i) => (i + 1) % facts.length);
  };

  // Opening this tab IS the "explore Discover" mission - recorded on focus,
  // paid at most once per day (recordMissionEvent is idempotent per mission).
  // The bump afterwards makes the missions card below re-read, so the mission
  // this very visit completed shows as done immediately.
  const [missionsTick, setMissionsTick] = useState(0);
  // Book ownership re-read on every focus, so a book redeemed on BookScreen
  // comes back to a shelf that already shows it unlocked.
  const [ownedBooks, setOwnedBooks] = useState({});
  useFocusEffect(
    useCallback(() => {
      recordMissionEvent('discover').then((done) => {
        if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
        setMissionsTick((n) => n + 1);
      });
      getOwnedRewards().then(setOwnedBooks);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: the scene is the FIRST child of the root and paints
          over the container colour - it never replaces it, and it never takes a
          touch. Everything below scrolls across it. */}
      <NatureScene />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <MainScreenHeader
          title={t('discover.title')}
          subtitle={t('discover.subtitle')}
          right={
          <>
          {/* Settings pinned to every main screen's header (competitor's
              ever-present gear); nested navigate bubbles to the tab navigator. */}
          <TopBarIcon
            onPress={() => navigation.navigate('Profile', { screen: 'Settings' })}
            label={t('settings.title')}
          >
            <CategoryIcon name="settings-outline" size={20} color={colors.text} />
          </TopBarIcon>
          </>
          }
        />

        <MascotWelcomeCard />

        <DailyMissionsCard refreshKey={missionsTick} />

        {/* Press-scale wrapper: the Touchable inside stays byte for byte, so the
            a11y label and the fact rotation are untouched by the animation. */}
        <PressScale>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={nextFact}
            accessibilityRole="button"
            accessibilityLabel={t('discover.showNextFactLabel')}
          >
            <LinearGradient
              colors={[colors.accentDark, '#2c4a37']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.factCard}
            >
              <View style={styles.factHeader}>
                <CategoryIcon
                  name="bulb"
                  size={18}
                  color={colors.warning}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={styles.factLabel}>{t('discover.dailyFact')}</Text>
              </View>
              <Text style={styles.factText}>{facts[factIndex]}</Text>
              <View style={styles.factFooter}>
                <CategoryIcon
                  name="refresh"
                  size={14}
                  color="rgba(255,255,255,0.8)"
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={styles.factFooterText}>{t('discover.tapForAnotherFact')}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </PressScale>

        {/* Estante dos Livros da Natureza: four photo covers, horizontal, right
            after the daily fact. Covers ride on the scene (not a ZoneBand - the
            two-band rhythm below stays intact). Each cover is the real photo of
            the book's cover species via FindThumb, icon fallback when it fails.
            Locked books wear a lock+cost badge; the free one wears a gift badge
            until claimed, so the "one is free" present is visible from here. */}
        <SectionHeading>{t('books.shelfTitle')}</SectionHeading>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20 }}
        >
          {BOOKS.map((b) => {
            const owned = !!ownedBooks[b.id];
            const bookTitle = t(`discover.topics.${b.topicKey}.title`);
            return (
              <PressScale key={b.id}>
                <TouchableOpacity
                  style={styles.bookCover}
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.selectionAsync();
                    navigation.navigate('Book', { bookId: b.id });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('discover.openCollectionLabel', { title: bookTitle })}
                >
                  <FindThumb
                    scientific={b.coverSci}
                    icon={b.icon}
                    accent={b.color}
                    iconSize={28}
                    style={[StyleSheet.absoluteFill, styles.bookThumb]}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(14,21,18,0.9)']}
                    style={styles.bookScrim}
                  />
                  <Text style={styles.bookTitle} numberOfLines={2}>{bookTitle}</Text>
                  {!owned &&
                    (b.cost === 0 ? (
                      <View style={[styles.bookBadge, { backgroundColor: b.color }]}>
                        <CategoryIcon name="gift" size={11} color={colors.white} />
                        <Text style={styles.bookBadgeText}>{t('books.free')}</Text>
                      </View>
                    ) : (
                      <View style={[styles.bookBadge, styles.bookLockBadge]}>
                        <CategoryIcon name="lock-closed" size={11} color={colors.white} />
                        <Text style={styles.bookBadgeText}>{b.cost}</Text>
                      </View>
                    ))}
                </TouchableOpacity>
              </PressScale>
            );
          })}
        </ScrollView>

        {/* Zona de cor: the whole collections section lives inside one full-bleed
            band. Only two bands on this screen - the gap between them is the
            scene showing through, and banding every section flattens the
            dark→lighter→dark rhythm back into a single background. */}
        <ZoneBand gutter={20}>
          <SectionHeading>{t('discover.exploreCollections')}</SectionHeading>
          {TOPICS.map((topic) => {
            const speciesList = t(`discover.topics.${topic.topicKey}.species`, { returnObjects: true });
            const speciesCount = Array.isArray(speciesList) ? speciesList.length : 0;
            // Capa da coleção = foto REAL da primeira espécie da própria lista
            // que tem nome científico (chave universal do speciesPhoto). Nunca
            // ilustração inventada: se a espécie não tiver foto na Wikipedia
            // (ou offline), o FindThumb degrada para o ícone da categoria e o
            // card renderiza como antes - "feature nova nunca nasce quebrada"
            // (doutrina, Cards 70% arte). São ~11 coleções fixas nesta
            // ScrollView, então ~11 fetches cacheados no mount - aceitável e
            // absorvido pelo cache do speciesPhoto em toda visita seguinte.
            const cover = Array.isArray(speciesList) ? speciesList.find((x) => x && x.sci) : null;
            return (
              <PressScale key={topic.id}>
                <TouchableOpacity
                  key={topic.id}
                  style={styles.topicCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate('TopicDetail', { topicKey: topic.topicKey, icon: topic.icon, color: topic.color });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('discover.openCollectionLabel', { title: t(`discover.topics.${topic.topicKey}.title`) })}
                >
                  {/* Card 70% arte, agora com foto de verdade (doutrina: foto
                      como TILE borda a borda, nome como legenda sobreposta,
                      nunca selo pequeno num card de texto). A foto é da espécie
                      representativa da coleção; sem foto, o FindThumb rende o
                      ícone da categoria na cor de sempre - fallback obrigatório
                      da doutrina. O scrim escuro na base garante o título
                      legível sobre qualquer foto. */}
                  <View style={styles.topicBanner}>
                    <FindThumb
                      scientific={cover?.sci}
                      icon={topic.icon}
                      accent={topic.color}
                      iconSize={30}
                      style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(14,21,18,0.88)']}
                      style={styles.topicScrim}
                    />
                    <Text style={styles.topicBannerTitle} numberOfLines={1}>
                      {t(`discover.topics.${topic.topicKey}.title`)}
                    </Text>
                  </View>
                  <View style={styles.topicStrip}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topicDesc}>{t(`discover.topics.${topic.topicKey}.desc`)}</Text>
                    </View>
                    <View style={styles.topicCount}>
                      <Text style={[styles.topicCountText, { color: topic.color }]}>{speciesCount}</Text>
                      <CategoryIcon
                        name="chevron-forward"
                        size={16}
                        color={colors.textMuted}
                        accessibilityElementsHidden={true}
                        importantForAccessibility="no-hide-descendants"
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </PressScale>
            );
          })}
        </ZoneBand>

        <ZoneBand gutter={20}>
          <SectionHeading>{t('discover.trendingSpecies')}</SectionHeading>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
            {SPECIES_META.map((s) => {
              const name = t(`discover.species.${s.speciesKey}.name`);
              const sci = t(`discover.species.${s.speciesKey}.sci`);
              return (
                <PressScale key={s.speciesKey}>
                  <TouchableOpacity
                    key={s.speciesKey}
                    style={styles.speciesCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.selectionAsync();
                      navigation.navigate('SpeciesDetail', { speciesKey: s.speciesKey, color: s.color });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('discover.viewSpeciesLabel', { name })}
                  >
                    {/* A real photo of the species, not a coloured leaf icon -
                        "trending" only reads as content when you can SEE the
                        species. Scientific name is the language-independent key.
                        TILE borda a borda (doutrina): a foto encosta nas
                        bordas do card e o nome vira legenda embaixo, em vez de
                        selo emoldurado pelo padding. */}
                    <FindThumb
                      scientific={sci}
                      icon="leaf"
                      accent={s.color}
                      iconSize={30}
                      style={styles.speciesThumb}
                    />
                    <View style={styles.speciesCaption}>
                      <Text style={styles.speciesName}>{name}</Text>
                      <Text style={styles.speciesSci}>{sci}</Text>
                    </View>
                  </TouchableOpacity>
                </PressScale>
              );
            })}

            {/* Two rotating picks from the fish/bird collections, changing weekly.
                Names come from the collection lists themselves, so they are
                already translated - no second copy of the same species name. */}
            {rotating.map((r) => {
              const list = t(`discover.topics.${r.topicKey}.species`, { returnObjects: true });
              const entry = Array.isArray(list) ? list.find((x) => x.id === r.id) : null;
              if (!entry) return null;
              return (
                <PressScale key={r.id}>
                  <TouchableOpacity
                    key={r.id}
                    style={styles.speciesCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.selectionAsync();
                      navigation.navigate('FieldGuide', {
                        speciesId: r.id,
                        name: entry.name,
                        sci: entry.sci,
                        color: r.color,
                        icon: r.icon,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('discover.viewSpeciesLabel', { name: entry.name })}
                  >
                    <FindThumb
                      scientific={entry.sci}
                      icon={r.icon}
                      accent={r.color}
                      iconSize={30}
                      style={styles.speciesThumb}
                    />
                    <View style={styles.speciesCaption}>
                      <Text style={styles.speciesName}>{entry.name}</Text>
                      <Text style={styles.speciesSci}>{entry.sci}</Text>
                    </View>
                  </TouchableOpacity>
                </PressScale>
              );
            })}
          </ScrollView>
        </ZoneBand>
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Floating subscribe pill - see CollectionScreen for why it is the last
          child and why it can refuse to render. */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Bottom padding clears the floating subscribe pill (see CollectionScreen).
  scroll: { padding: 20, paddingBottom: 84 },
  factCard: { borderRadius: 20, padding: 20, ...shadow },
  factHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  factLabel: { color: colors.white, fontWeight: '700', fontSize: 14, marginLeft: 8 },
  factText: { color: 'rgba(255,255,255,0.95)', fontSize: 15.5, lineHeight: 23, fontWeight: '500' },
  factFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  factFooterText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 6, fontWeight: '600' },
  // Composição centrada, com critério: a SECTION title centres and carries
  // weight; card titles and body text below stay left-aligned, because centred
  // reading text is the illegible half of this device.
  // Auditoria de diagramacao 20/08 (correcao 10): era uma COPIA literal do
  // 22/800/center/34 - o token type.sectionTitle existia e ninguem consumia,
  // entao corrigir o theme sozinho nao mudaria um pixel desta tela. Passa a
  // consumir o token; o marginBottom local sai junto (o token ja traz 10).
  // Capa de livro: photo tile 110x150 with the title as an overlaid caption
  // and the status badge stamped on top. justifyContent pushes the caption to
  // the base; overflow clips the photo to the cover's corners.
  bookCover: {
    width: 110,
    height: 150,
    borderRadius: 14,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: 'flex-end',
    ...shadow,
  },
  // Centres the fallback icon when there is no photo.
  bookThumb: { alignItems: 'center', justifyContent: 'center' },
  bookScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 },
  bookTitle: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bookBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bookLockBadge: { backgroundColor: 'rgba(0,0,0,0.55)' },
  bookBadgeText: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
  topicCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    // The banner has to be cut by the card's own corners.
    overflow: 'hidden',
    ...shadow,
  },
  topicBanner: {
    // Taller than the old 84px gradient: a photo needs room to read as a
    // capa, not a listra. The card's overflow:hidden clips the corners.
    height: 108,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  // Scrim só na metade de baixo: escurece onde o título senta e deixa o
  // topo da foto limpo (tile primeiro, legibilidade garantida).
  topicScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  topicBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topicStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  topicDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  topicCount: { alignItems: 'center', flexDirection: 'row' },
  topicCountText: { fontWeight: '800', fontSize: 15, marginRight: 2 },
  speciesCard: {
    width: 140,
    backgroundColor: colors.card,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
    // The photo has to be cut by the card's own corners (tile, not selo).
    overflow: 'hidden',
    ...shadow,
  },
  // Borda a borda: sem raio nem margem próprios, o card recorta os cantos.
  // align/justify continuam para centralizar o ícone no fallback sem foto.
  speciesThumb: {
    width: '100%',
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesCaption: { paddingHorizontal: 12, paddingVertical: 10 },
  speciesName: { fontSize: 14, fontWeight: '700', color: colors.text },
  speciesSci: { fontSize: 11.5, fontStyle: 'italic', color: colors.textSecondary, marginTop: 1 },
});
