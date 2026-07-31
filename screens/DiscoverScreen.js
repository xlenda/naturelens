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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from '../components/theme';
import DailyMissionsCard from '../components/DailyMissionsCard';
import CategoryIcon from '../components/CategoryIcon';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';

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
  useFocusEffect(
    useCallback(() => {
      recordMissionEvent('discover').then((done) => {
        if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
        setMissionsTick((n) => n + 1);
      });
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">{t('discover.title')}</Text>
        <Text style={styles.subtitle}>{t('discover.subtitle')}</Text>

        <DailyMissionsCard refreshKey={missionsTick} />

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
              <Ionicons
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
              <Ionicons
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

        <Text style={styles.sectionTitle}>{t('discover.exploreCollections')}</Text>
        {TOPICS.map((topic) => {
          const speciesCount = t(`discover.topics.${topic.topicKey}.species`, { returnObjects: true }).length;
          return (
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
              <View style={[styles.topicIcon, { backgroundColor: topic.color + '22' }]}>
                <CategoryIcon
                  name={topic.icon}
                  size={22}
                  color={topic.color}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicTitle}>{t(`discover.topics.${topic.topicKey}.title`)}</Text>
                <Text style={styles.topicDesc}>{t(`discover.topics.${topic.topicKey}.desc`)}</Text>
              </View>
              <View style={styles.topicCount}>
                <Text style={[styles.topicCountText, { color: topic.color }]}>{speciesCount}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textMuted}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.sectionTitle}>{t('discover.trendingSpecies')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {SPECIES_META.map((s) => {
            const name = t(`discover.species.${s.speciesKey}.name`);
            const sci = t(`discover.species.${s.speciesKey}.sci`);
            return (
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
                <View style={[styles.speciesThumb, { backgroundColor: s.color + '33' }]}>
                  <Ionicons
                    name="leaf"
                    size={30}
                    color={s.color}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                </View>
                <Text style={styles.speciesName}>{name}</Text>
                <Text style={styles.speciesSci}>{sci}</Text>
              </TouchableOpacity>
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
                <View style={[styles.speciesThumb, { backgroundColor: r.color + '33' }]}>
                  <CategoryIcon
                    name={r.icon}
                    size={30}
                    color={r.color}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                </View>
                <Text style={styles.speciesName}>{entry.name}</Text>
                <Text style={styles.speciesSci}>{entry.sci}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 30 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 20 },
  factCard: { borderRadius: 20, padding: 20, ...shadow },
  factHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  factLabel: { color: colors.white, fontWeight: '700', fontSize: 14, marginLeft: 8 },
  factText: { color: 'rgba(255,255,255,0.95)', fontSize: 15.5, lineHeight: 23, fontWeight: '500' },
  factFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  factFooterText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginLeft: 6, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 14 },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  topicIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  topicTitle: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  topicDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  topicCount: { alignItems: 'center', flexDirection: 'row' },
  topicCountText: { fontWeight: '800', fontSize: 15, marginRight: 2 },
  speciesCard: {
    width: 140,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  speciesThumb: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  speciesName: { fontSize: 14, fontWeight: '700', color: colors.text },
  speciesSci: { fontSize: 11.5, fontStyle: 'italic', color: colors.textSecondary, marginTop: 1 },
});
