import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import { colors, shadow } from '../components/theme';
import { ACHIEVEMENT_LIST, evaluateAchievements, getStreakInfo } from '../components/achievements';
import { getSubscriptionStatus } from '../components/subscription';

export default function AchievementsScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0, totalIdentifications: 0, tokens: 0 });
  const [unlocked, setUnlocked] = useState({});
  const [progress, setProgress] = useState({});

  const load = useCallback(async () => {
    const subStatus = await getSubscriptionStatus();
    const [{ unlocked: unlockedMap, progress: progressMap }, streakInfo] = await Promise.all([
      evaluateAchievements({ subStatus }),
      getStreakInfo(),
    ]);
    setUnlocked(unlockedMap);
    setProgress(progressMap || {});
    setStreak(streakInfo);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unlockedCount = ACHIEVEMENT_LIST.filter((a) => unlocked[a.id]).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: the scene is the FIRST child and paints over the
          container's own background, never replaces it. */}
      <NatureScene />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">{t('achievements.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.tokensBanner}>
          <View style={styles.tokensBannerIcon}>
            <Ionicons
              name="disc"
              size={28}
              color={colors.accentLight}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tokensBannerNumber}>{streak.tokens}</Text>
            <Text style={styles.tokensBannerLabel}>{t('achievements.tokensLabel')}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons
              name="flame"
              size={24}
              color={colors.warning}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.statNumber}>{streak.currentStreak}</Text>
            <Text style={styles.statLabel}>{t('achievements.streakLabel')}</Text>
            {/* Escudo visível: shields already come from getStreakInfo - a
                bought shield that only surfaced in the Store was invisible
                exactly where the streak lives. Icon + number, no new copy. */}
            {streak.shields > 0 && (
              <View style={styles.shieldPill}>
                <Ionicons
                  name="shield-checkmark"
                  size={12}
                  color={colors.info}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={styles.shieldPillText}>{streak.shields}</Text>
              </View>
            )}
          </View>
          <View style={styles.statCard}>
            <Ionicons
              name="trophy"
              size={24}
              color={colors.warning}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.statNumber}>{streak.longestStreak}</Text>
            <Text style={styles.statLabel}>{t('achievements.longestStreakLabel')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons
              name="albums"
              size={24}
              color={colors.warning}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.statNumber}>{streak.totalIdentifications}</Text>
            <Text style={styles.statLabel}>{t('achievements.totalLabel')}</Text>
          </View>
        </View>

        {/* Zonas de cor: the badge list is the one block on this screen that
            reads as a section, so it lives in a band while the tokens banner
            and the stats row stay on the scene above it. Its own label heads
            the band - the band is a pure wrapper and keeps this order. */}
        <ZoneBand gutter={20}>
          <Text style={styles.sectionLabel}>
            {t('achievements.progressLabel', { unlocked: unlockedCount, total: ACHIEVEMENT_LIST.length })}
          </Text>

          {ACHIEVEMENT_LIST.map((a) => {
            const isUnlocked = !!unlocked[a.id];
            const p = !isUnlocked && progress[a.id];
            return (
              <View key={a.id} style={[styles.badgeRow, !isUnlocked && styles.badgeRowLocked]}>
                {/* A locked badge shows its REAL icon dimmed with a mini-lock
                    in the corner - ten identical padlocks told the user
                    nothing about what each badge even was. */}
                <View style={[styles.badgeIcon, isUnlocked && styles.badgeIconUnlocked]}>
                  <Ionicons
                    name={a.icon}
                    size={22}
                    color={isUnlocked ? colors.warning : colors.textMuted}
                    style={!isUnlocked ? styles.badgeGlyphLocked : null}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                  {!isUnlocked && (
                    <View style={styles.miniLock}>
                      <Ionicons
                        name="lock-closed"
                        size={10}
                        color={colors.textMuted}
                        accessibilityElementsHidden={true}
                        importantForAccessibility="no-hide-descendants"
                      />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.badgeTitle, !isUnlocked && styles.badgeTitleLocked]}>
                    {t(`achievements.${a.id}.title`)}
                  </Text>
                  <Text style={styles.badgeBody}>{t(`achievements.${a.id}.body`)}</Text>
                  {/* Real progress on countable achievements: current/target
                      come from evaluateAchievements (same numbers the unlock
                      check uses). Pure digits - no new i18n copy. */}
                  {p && p.target > 0 && (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min(100, (p.current / p.target) * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>{`${Math.min(p.current, p.target)}/${p.target}`}</Text>
                    </View>
                  )}
                </View>
                {isUnlocked && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.accent}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                )}
              </View>
            );
          })}
        </ZoneBand>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  scroll: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  tokensBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '18',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent + '44',
  },
  tokensBannerIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent + '2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  tokensBannerNumber: { fontSize: 28, fontWeight: '900', color: colors.text, lineHeight: 32 },
  tokensBannerLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  statNumber: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8 },
  statLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  shieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.info + '22',
  },
  shieldPillText: { fontSize: 11.5, fontWeight: '800', color: colors.info },
  // Composição centrada: this is the section label for the badge list, so it
  // centres. Badge titles and bodies below deliberately do not - centred
  // reading text is what makes the device look cheap instead of composed.
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.warning + '33',
    ...shadow,
  },
  badgeRowLocked: {
    borderColor: colors.border,
    opacity: 0.7,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  badgeIconUnlocked: {
    backgroundColor: colors.warning + '22',
  },
  badgeGlyphLocked: { opacity: 0.35 },
  miniLock: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  badgeTitleLocked: { color: colors.textSecondary },
  badgeBody: { fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
