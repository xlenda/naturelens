import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import BackChevron from '../components/BackChevron';
import CategoryIcon from '../components/CategoryIcon';
import { colors, shadow } from '../components/theme';
import { CATEGORIES } from '../components/categories';
import { getMonthlyRecap } from '../components/monthlyRecap';
import { shareRecap } from '../components/share';

// "Your month in nature" - the shareable summary.
//
// Deliberately shows the CURRENT month rather than only a completed one: a
// recap you can only see on the 1st is a recap almost nobody sees. Watching
// the numbers grow during the month is itself the retention mechanic.

export default function MonthlyRecapScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const [recap, setRecap] = useState(undefined); // undefined = loading, null = empty
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getMonthlyRecap(0).then((r) => {
        if (alive) setRecap(r);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  // Month name in the user's own language, from Intl rather than a 12-entry
  // translation table per locale - one less thing to keep in sync across 17
  // languages, and it already handles capitalisation conventions.
  const monthName = recap
    ? new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
        new Date(recap.year, recap.month, 1)
      )
    : '';

  const handleShare = async () => {
    if (sharing || !recap) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await shareRecap(recap, {
        monthName,
        title: t('recap.shareTitle', { month: monthName }),
      });
    } finally {
      setSharing(false);
    }
  };

  const header = (
    <View style={styles.topBar}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel={t('common.goBack')}
      >
        <BackChevron size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.topTitle} accessibilityRole="header">
        {t('recap.title')}
      </Text>
      <View style={styles.iconBtn} />
    </View>
  );

  if (recap === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
      </SafeAreaView>
    );
  }

  if (recap === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('recap.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('recap.emptyBody')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = [
    { key: 'total', value: recap.total, icon: 'albums-outline' },
    { key: 'species', value: recap.uniqueSpecies, icon: 'leaf-outline' },
    { key: 'categories', value: recap.categoriesUsed, icon: 'grid-outline' },
    { key: 'days', value: recap.activeDays, icon: 'today-outline' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[recap.topCategoryAccent || colors.accent, colors.accentDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroMonth}>{monthName}</Text>
          <Text style={styles.heroHeadline}>
            {t('recap.headline', { count: recap.uniqueSpecies })}
          </Text>
        </LinearGradient>

        <View style={styles.statGrid}>
          {stats.map((s) => (
            <View key={s.key} style={styles.statCard}>
              <Ionicons name={s.icon} size={20} color={colors.accentLight} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{t(`recap.stats.${s.key}`)}</Text>
            </View>
          ))}
        </View>

        {recap.currentStreak > 0 && (
          <View style={styles.streakBar}>
            <Ionicons name="flame" size={17} color={colors.warning} />
            <Text style={styles.streakText}>
              {t('recap.streakLine', { current: recap.currentStreak, longest: recap.longestStreak })}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('recap.byCategory')}</Text>
        {Object.entries(recap.byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => {
            const meta = CATEGORIES[key];
            if (!meta) return null;
            const pct = Math.round((count / recap.total) * 100);
            return (
              <View key={key} style={styles.catRow}>
                <View style={[styles.catIcon, { backgroundColor: meta.accent + '26' }]}>
                  <CategoryIcon name={meta.tabIcon} size={16} color={meta.accent} />
                </View>
                <Text style={styles.catName}>{t(`categories.${key}.label`)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: meta.accent }]} />
                </View>
                <Text style={styles.catCount}>{count}</Text>
              </View>
            );
          })}

        {!!recap.highlight && (
          <>
            <Text style={styles.sectionTitle}>{t('recap.highlight')}</Text>
            <View style={styles.highlightCard}>
              {!!recap.highlight.photoUri && (
                <Image source={{ uri: recap.highlight.photoUri }} style={styles.highlightPhoto} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.highlightName}>{recap.highlight.name}</Text>
                {!!recap.highlight.scientific && (
                  <Text style={styles.highlightSci}>{recap.highlight.scientific}</Text>
                )}
                {recap.highlight.confidence != null && (
                  <Text style={styles.highlightConf}>
                    {recap.highlight.confidence}% · {t('common.confidence')}
                  </Text>
                )}
              </View>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.shareBtn, sharing && { opacity: 0.6 }]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('recap.share')}
        >
          <Ionicons name="share-social" size={19} color={colors.white} />
          <Text style={styles.shareBtnText}>{t('recap.share')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  scroll: { padding: 20, paddingBottom: 40 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  hero: { borderRadius: 20, padding: 24, marginBottom: 18, ...shadow },
  heroMonth: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroHeadline: { color: colors.white, fontSize: 26, fontWeight: '800', marginTop: 6, lineHeight: 33 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 4 },
  statLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
  streakBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warning + '17',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  streakText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
  },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  catIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catName: { color: colors.textSecondary, fontSize: 13, width: 84 },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.surfaceElevated },
  barFill: { height: 7, borderRadius: 4 },
  catCount: { color: colors.text, fontSize: 13, fontWeight: '700', width: 26, textAlign: 'right' },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  highlightPhoto: { width: 62, height: 62, borderRadius: 10, backgroundColor: colors.surfaceElevated },
  highlightName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  highlightSci: { color: colors.textMuted, fontSize: 12.5, fontStyle: 'italic', marginTop: 2 },
  highlightConf: { color: colors.accentLight, fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.accent,
    borderRadius: 15,
    paddingVertical: 16,
    marginTop: 26,
  },
  shareBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
