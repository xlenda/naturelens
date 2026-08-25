import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Share, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '../components/CategoryIcon';
import DailyMissionsCard from '../components/DailyMissionsCard';
import FindThumb from '../components/FindThumb';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import { recordShare, addTokens, getStreakInfo, evaluateAchievements } from '../components/achievements';
import { CATEGORIES, CATEGORY_LIST } from '../components/categories';
import { getTodaysMissions, recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { getCollection } from '../components/storage';
import { recordPositiveReviewSignal } from '../components/storeReview';
import { colors, control, radius, shadow, space, type } from '../components/theme';
import { trackResultShared } from '../components/tracking';

const APP_URL = 'https://naturelensapp.cloud';

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseSavedTime(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function leagueIndex(score) {
  if (score >= 5000) return 3;
  if (score >= 2000) return 2;
  if (score >= 700) return 1;
  return 0;
}

export default function CommunityScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [model, setModel] = useState(null);
  const [missionsTick, setMissionsTick] = useState(0);
  const [reviewAnswered, setReviewAnswered] = useState(false);

  const load = useCallback(async () => {
    const [collection, streak, achievements, missions] = await Promise.all([
      getCollection(),
      getStreakInfo(),
      evaluateAchievements(),
      getTodaysMissions(),
    ]);

    const now = new Date();
    const weekStart = startOfLocalDay(now) - 6 * 86400000;
    const thisWeek = collection.filter((item) => parseSavedTime(item.savedAt) >= weekStart);
    const categoriesSeen = new Set(collection.map((item) => item.category).filter(Boolean));
    const completedMissions = missions.filter((mission) => mission.completed).length;
    const unlockedCount = Object.keys(achievements.unlocked || {}).length;
    const recentPhotos = collection
      .filter((item) => item.photoUri || item.referencePhoto || item.similarImages?.length)
      .sort((a, b) => parseSavedTime(b.savedAt) - parseSavedTime(a.savedAt))
      .slice(0, 5);

    const score = Math.round(
      collection.length * 40
      + categoriesSeen.size * 140
      + streak.currentStreak * 90
      + unlockedCount * 110
      + Math.floor((streak.tokens || 0) / 2)
    );
    const weeklyScore = Math.round(
      thisWeek.length * 120
      + completedMissions * 90
      + streak.currentStreak * 35
      + categoriesSeen.size * 20
    );

    setModel({
      total: collection.length,
      thisWeek: thisWeek.length,
      categoriesSeen: categoriesSeen.size,
      categoryTotal: CATEGORY_LIST.length,
      currentStreak: streak.currentStreak,
      tokens: streak.tokens || 0,
      score,
      weeklyScore,
      rank: clamp(500 - Math.floor(score / 18), 1, 500),
      league: leagueIndex(score),
      completedMissions,
      missionsTotal: missions.length,
      recentPhotos,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      load().catch(() => {
        if (alive) setModel(null);
      });
      return () => {
        alive = false;
      };
    }, [load])
  );

  const progress = useMemo(() => {
    if (!model) return 0;
    const nextScore = [700, 2000, 5000, 9000][model.league] || 9000;
    const previousScore = [0, 700, 2000, 5000][model.league] || 0;
    return clamp((model.score - previousScore) / Math.max(1, nextScore - previousScore), 0.08, 1);
  }, [model]);

  const onInvite = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    recordShare();
    recordMissionEvent('share').then((done) => {
      if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
      setMissionsTick((value) => value + 1);
      load();
    });
    const message = t('community.inviteMessage', { url: APP_URL });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'NatureLens', text: message });
        trackResultShared({ category: 'community', method: 'community_web_share' });
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        trackResultShared({ category: 'community', method: 'community_whatsapp_link' });
        return;
      }
      await Share.share({ message });
      trackResultShared({ category: 'community', method: 'community_native_sheet' });
    } catch (e) {}
  };

  const openScan = () => {
    navigation.getParent()?.navigate(CATEGORIES.plant.tabLabel, { screen: 'ScanHome' });
  };

  const answerReviewWarmup = (positive) => {
    if (reviewAnswered) return;
    Haptics.selectionAsync();
    setReviewAnswered(true);
    if (positive) recordPositiveReviewSignal().catch(() => undefined);
  };

  const safeModel = model || {
    total: 0,
    thisWeek: 0,
    categoriesSeen: 0,
    categoryTotal: CATEGORY_LIST.length,
    currentStreak: 0,
    tokens: 0,
    score: 0,
    weeklyScore: 0,
    rank: 500,
    league: 0,
    completedMissions: 0,
    missionsTotal: 3,
    recentPhotos: [],
  };

  const leagueKeys = ['seed', 'sprout', 'guardian', 'master'];
  const leagueKey = leagueKeys[safeModel.league] || 'seed';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NatureScene />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">{t('community.screenTitle')}</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              <Ionicons name="trophy" size={24} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroKicker}>{t('community.localBadge')}</Text>
              <Text style={styles.heroTitle}>{t('community.heroTitle')}</Text>
            </View>
          </View>

          <View style={styles.rankRow}>
            <View>
              <Text style={styles.rankNumber}>#{safeModel.rank}</Text>
              <Text style={styles.rankLabel}>{t('community.rankPosition')}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreNumber}>{safeModel.score}</Text>
              <Text style={styles.scoreLabel}>{t('community.scoreLabel')}</Text>
            </View>
          </View>

          <View style={styles.progressTrack} accessible accessibilityRole="progressbar">
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.leagueText}>{t(`community.leagues.${leagueKey}`)}</Text>
          <View style={styles.heroActions}>
            <PressScale style={styles.actionWrap}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.accent }]}
                onPress={onInvite}
                accessibilityRole="button"
                accessibilityLabel={t('community.inviteAction')}
              >
                <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                <Text style={styles.actionText}>{t('community.inviteAction')}</Text>
              </TouchableOpacity>
            </PressScale>
            <PressScale style={styles.actionWrap}>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryAction]}
                onPress={openScan}
                accessibilityRole="button"
                accessibilityLabel={t('community.scanAction')}
              >
                <Ionicons name="camera-outline" size={16} color={colors.accentLight} />
                <Text style={[styles.actionText, { color: colors.accentLight }]}>{t('community.scanAction')}</Text>
              </TouchableOpacity>
            </PressScale>
          </View>
        </View>

        <View style={styles.photoRail}>
          {safeModel.recentPhotos.length ? safeModel.recentPhotos.map((item, index) => (
            <FindThumb
              key={item.savedId || index}
              photoUri={item.photoUri}
              referencePhoto={item.referencePhoto}
              similarImages={item.similarImages}
              style={[styles.photo, index > 0 && styles.photoOverlap]}
            />
          )) : (
            CATEGORY_LIST.slice(0, 5).map((category, index) => (
              <View key={category.key} style={[styles.photoPlaceholder, index > 0 && styles.photoOverlap]}>
                <CategoryIcon name={category.tabIcon} size={22} color={category.accent} />
              </View>
            ))
          )}
          <Text style={styles.photoRailText}>{t('community.photoRail')}</Text>
        </View>

        <View style={styles.careExchangeCard}>
          <View style={styles.careExchangeHeader}>
            <View style={styles.careExchangeIcon}>
              <Ionicons name="leaf" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.careExchangeTitle}>{t('community.careExchangeTitle')}</Text>
              <Text style={styles.careExchangeBody}>{t('community.careExchangeBody')}</Text>
            </View>
          </View>
          <View style={styles.careTopicGrid}>
            {[
              ['water-outline', 'watering', colors.info],
              ['bug-outline', 'pests', colors.warning],
              ['images-outline', 'recovery', colors.accentLight],
              ['chatbubbles-outline', 'questions', colors.purple],
            ].map(([icon, key, color]) => (
              <View key={key} style={styles.careTopicChip}>
                <Ionicons name={icon} size={16} color={color} />
                <Text style={styles.careTopicText}>{t(`community.careTopics.${key}`)}</Text>
              </View>
            ))}
          </View>
          <PressScale>
            <TouchableOpacity
              style={styles.careShareButton}
              onPress={onInvite}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={t('community.careShareAction')}
            >
              <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
              <Text style={styles.careShareText}>{t('community.careShareAction')}</Text>
            </TouchableOpacity>
          </PressScale>
        </View>

        <View style={styles.statsGrid}>
          {[
            ['leaf-outline', safeModel.total, t('community.discoveriesLabel')],
            ['calendar-outline', safeModel.thisWeek, t('community.weeklyLabel')],
            ['compass-outline', `${safeModel.categoriesSeen}/${safeModel.categoryTotal}`, t('community.categoriesLabel')],
            ['flame-outline', safeModel.currentStreak, t('community.streakLabel')],
          ].map(([icon, value, label]) => (
            <View key={label} style={styles.statCard}>
              <Ionicons name={icon} size={17} color={colors.accentLight} />
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="podium-outline" size={18} color={colors.accentLight} />
            <Text style={styles.sectionTitle}>{t('community.rankingTitle')}</Text>
          </View>
          <Text style={styles.sectionBody}>{t('community.rankingBody')}</Text>
          {['you', 'next', 'elite'].map((key, index) => {
            const active = key === 'you';
            return (
              <View key={key} style={[styles.leaderRow, active && styles.leaderRowActive]}>
                <Text style={[styles.leaderPosition, active && styles.leaderPositionActive]}>
                  {key === 'you' ? `#${safeModel.rank}` : index === 1 ? `#${Math.max(1, safeModel.rank - 8)}` : '#1'}
                </Text>
                <View style={[styles.leaderAvatar, active && { backgroundColor: colors.accent + '28' }]}>
                  <Ionicons
                    name={key === 'you' ? 'person' : index === 1 ? 'trail-sign-outline' : 'ribbon'}
                    size={16}
                    color={active ? colors.accentLight : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderName}>{t(`community.leaderboard.${key}.name`)}</Text>
                  <Text style={styles.leaderMeta}>{t(`community.leaderboard.${key}.meta`)}</Text>
                </View>
                <Text style={styles.leaderScore}>
                  {key === 'you'
                    ? safeModel.weeklyScore
                    : key === 'next'
                      ? safeModel.weeklyScore + 260
                      : Math.max(1200, safeModel.weeklyScore + 900)}
                </Text>
              </View>
            );
          })}
        </View>

        <DailyMissionsCard refreshKey={missionsTick} />

        {safeModel.total > 0 ? (
          <View style={styles.reviewCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="heart-circle-outline" size={19} color={colors.accentLight} />
              <Text style={styles.sectionTitle}>{t('community.reviewTitle')}</Text>
            </View>
            <Text style={styles.sectionBody}>
              {reviewAnswered ? t('community.reviewThanks') : t('community.reviewBody')}
            </Text>
            {!reviewAnswered ? (
              <View style={styles.reviewActions}>
                <PressScale style={styles.actionWrap}>
                  <TouchableOpacity
                    style={[styles.reviewButton, { backgroundColor: colors.accent }]}
                    onPress={() => answerReviewWarmup(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('community.reviewAction')}
                  >
                    <Ionicons name="star" size={15} color={colors.white} />
                    <Text style={styles.reviewButtonText}>{t('community.reviewAction')}</Text>
                  </TouchableOpacity>
                </PressScale>
                <PressScale style={styles.actionWrap}>
                  <TouchableOpacity
                    style={[styles.reviewButton, styles.reviewSecondary]}
                    onPress={() => answerReviewWarmup(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('community.reviewLater')}
                  >
                    <Text style={[styles.reviewButtonText, { color: colors.textSecondary }]}>
                      {t('community.reviewLater')}
                    </Text>
                  </TouchableOpacity>
                </PressScale>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles-outline" size={18} color={colors.warning} />
            <Text style={styles.sectionTitle}>{t('community.milestonesTitle')}</Text>
          </View>
          {['first', 'week', 'allCategories'].map((key) => (
            <View key={key} style={styles.milestoneRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.milestoneText}>{t(`community.milestones.${key}`)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.inviteCard}>
          <View style={styles.inviteIcon}>
            <Ionicons name="people" size={25} color={colors.white} />
          </View>
          <Text style={styles.inviteTitle}>{t('community.inviteTitle')}</Text>
          <Text style={styles.inviteBody}>{t('community.inviteBody')}</Text>
          <View style={styles.actionRow}>
            <PressScale style={styles.actionWrap}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.accent }]}
                onPress={onInvite}
                accessibilityRole="button"
                accessibilityLabel={t('community.inviteAction')}
              >
                <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
                <Text style={styles.actionText}>{t('community.inviteAction')}</Text>
              </TouchableOpacity>
            </PressScale>
            <PressScale style={styles.actionWrap}>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryAction]}
                onPress={openScan}
                accessibilityRole="button"
                accessibilityLabel={t('community.scanAction')}
              >
                <Ionicons name="camera-outline" size={16} color={colors.accentLight} />
                <Text style={[styles.actionText, { color: colors.accentLight }]}>{t('community.scanAction')}</Text>
              </TouchableOpacity>
            </PressScale>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  headerButton: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.topTitle, textAlign: 'center' },
  scroll: { padding: space.md, paddingTop: space.xs, paddingBottom: space.xxl },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.warning + '24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKicker: { color: colors.warning, fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: '900', marginTop: 2 },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: space.lg },
  rankNumber: { color: colors.text, fontSize: 42, lineHeight: 47, fontWeight: '900' },
  rankLabel: { ...type.caption, marginTop: 2 },
  scoreBox: { alignItems: 'flex-end' },
  scoreNumber: { color: colors.accentLight, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  scoreLabel: { ...type.caption },
  progressTrack: {
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    marginTop: space.lg,
  },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  leagueText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: space.sm },
  heroActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  photoRail: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 74,
    marginTop: space.md,
    paddingHorizontal: space.sm,
  },
  photo: { width: 58, height: 58, borderRadius: radius.md, borderWidth: 2, borderColor: colors.background },
  photoPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverlap: { marginLeft: -16 },
  photoRailText: { flex: 1, ...type.caption, marginLeft: space.sm, fontWeight: '700' },
  careExchangeCard: {
    backgroundColor: colors.accent + '12',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accent + '45',
    padding: space.md,
    marginTop: space.sm,
  },
  careExchangeHeader: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  careExchangeIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  careExchangeTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  careExchangeBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  careTopicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md },
  careTopicChip: {
    minHeight: 40,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.background + '8A',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
  },
  careTopicText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  careShareButton: {
    minHeight: control.primaryHeight,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  careShareText: { color: colors.white, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  statCard: {
    width: '47.8%',
    minHeight: 92,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  statValue: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900', marginTop: space.xs },
  statLabel: { ...type.caption, fontWeight: '700' },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginTop: space.md,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  sectionBody: { ...type.body, marginBottom: space.sm },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: space.xs,
  },
  leaderRowActive: { backgroundColor: colors.accent + '14' },
  leaderPosition: { width: 42, color: colors.textMuted, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  leaderPositionActive: { color: colors.accentLight },
  leaderAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderName: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  leaderMeta: { color: colors.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: '700' },
  leaderScore: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: 7 },
  milestoneText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  reviewCard: {
    backgroundColor: colors.accent + '12',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '4D',
    padding: space.md,
    marginTop: space.md,
  },
  reviewActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  reviewButton: {
    minHeight: control.primaryHeight,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  reviewSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  reviewButtonText: { color: colors.white, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  inviteCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginTop: space.md,
  },
  inviteIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  inviteTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  inviteBody: { ...type.body, textAlign: 'center', marginTop: space.xs },
  actionRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  actionWrap: { flex: 1 },
  actionButton: {
    minHeight: control.primaryHeight,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  secondaryAction: { backgroundColor: colors.accent + '18', borderWidth: 1, borderColor: colors.accent + '40' },
  actionText: { color: colors.white, fontSize: 13, lineHeight: 18, fontWeight: '900' },
});
