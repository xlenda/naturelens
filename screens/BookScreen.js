import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import BackChevron from '../components/BackChevron';
import FindThumb from '../components/FindThumb';
import PressScale from '../components/PressScale';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { colors, shadow } from '../components/theme';
import { getBook } from '../components/books';
import { spendTokens } from '../components/achievements';
import { hasReward, grantReward } from '../components/rewardOwnership';
import { trackRewardRedeemed } from '../components/tracking';

// One "Book of Nature" opened: photo cover, then the summary - the ten
// chapters, which are the species of the collection the book packages.
// Chapters open the existing FieldGuideScreen reader; the prose already ships
// translated in {lang}-species.json, so this screen sells the door, not the
// content. While locked, the summary renders blurred/untappable under a lock,
// with a redeem pill carrying the token cost (or "free" for the first book).
export default function BookScreen({ route }) {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  const book = getBook(route.params?.bookId);

  // null = ownership still being read: render neither state until known, so a
  // paid-for book never flashes locked (nor a locked one open) for a frame.
  const [unlocked, setUnlocked] = useState(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!book) return;
      hasReward(book.id).then(setUnlocked);
    }, [book])
  );

  // After the hooks on purpose - hook order must not depend on a bad param.
  if (!book) return null;

  const title = t(`discover.topics.${book.topicKey}.title`);
  const chaptersRaw = t(`discover.topics.${book.topicKey}.species`, { returnObjects: true });
  const chapters = Array.isArray(chaptersRaw) ? chaptersRaw : [];

  const handleUnlock = async () => {
    // Disable synchronously before the first await, same double-tap guard as
    // the store: two fast taps must never charge twice.
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (book.cost > 0) {
        // spendTokens re-reads the balance before debiting - only grant on true.
        const paid = await spendTokens(book.cost);
        if (!paid) {
          showAlert(t('store.notEnoughTitle'), t('books.notEnoughTokens'));
          return;
        }
      }
      await grantReward(book.id);
      trackRewardRedeemed({ rewardId: book.id, cost: book.cost });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUnlocked(true);
    } finally {
      setBusy(false);
    }
  };

  const openChapter = (s) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // The reader's real signature - exactly what DiscoverScreen and
    // TopicDetailScreen pass it today.
    navigation.navigate('FieldGuide', {
      speciesId: s.id,
      name: s.name,
      sci: s.sci,
      color: book.color,
      icon: book.icon,
    });
  };

  const chapterRows = chapters.map((s, i) => {
    const CardWrapper = unlocked ? TouchableOpacity : View;
    const wrapperProps = unlocked
      ? {
          activeOpacity: 0.85,
          onPress: () => openChapter(s),
          accessibilityRole: 'button',
          accessibilityLabel: t('discover.viewSpeciesLabel', { name: s.name }),
        }
      : {};
    const card = (
      <CardWrapper key={s.id || i} style={styles.chapterCard} {...wrapperProps}>
        {/* Locked chapters keep the icon fallback only - no point fetching ten
            photos for a list that renders blurred. Unlocked, FindThumb runs
            its full chain: real photo by scientific name, icon if it fails. */}
        <FindThumb
          scientific={unlocked ? s.sci : null}
          icon={book.icon}
          accent={book.color}
          iconSize={24}
          style={styles.chapterThumb}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.chapterName}>{s.name}</Text>
          <Text style={styles.chapterSci}>{s.sci}</Text>
        </View>
        <Ionicons
          name={unlocked ? 'chevron-forward' : 'lock-closed'}
          size={16}
          color={colors.textMuted}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
      </CardWrapper>
    );
    return unlocked ? <PressScale key={s.id || i}>{card}</PressScale> : card;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Capa-hero: the cover species' real photo as a full-bleed tile,
            fading into the page background (PlantHero pattern). FindThumb
            degrades to the collection icon when the photo cannot load. */}
        <View style={styles.hero}>
          <FindThumb
            scientific={book.coverSci}
            icon={book.icon}
            accent={book.color}
            iconSize={44}
            style={[StyleSheet.absoluteFill, styles.heroThumb]}
          />
          <LinearGradient colors={['transparent', colors.background]} style={styles.heroFade} />
          <Text style={styles.heroTitle} accessibilityRole="header">{title}</Text>
          <Text style={styles.heroMeta}>{`${chapters.length} · ${t('books.chaptersLabel')}`}</Text>
        </View>

        {unlocked === false && (
          <PressScale>
            <TouchableOpacity
              style={[styles.unlockPill, { backgroundColor: book.color }, busy && styles.pillDisabled]}
              onPress={handleUnlock}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={
                book.cost === 0 ? t('books.free') : t('books.unlockFor', { count: book.cost })
              }
            >
              <Ionicons name={book.cost === 0 ? 'gift' : 'lock-open'} size={16} color={colors.white} />
              <Text style={styles.unlockPillText}>
                {book.cost === 0 ? t('books.free') : t('books.unlockFor', { count: book.cost })}
              </Text>
            </TouchableOpacity>
          </PressScale>
        )}

        <Text style={styles.sectionLabel}>{t('books.chaptersLabel')}</Text>

        {unlocked === true && chapterRows}

        {unlocked === false && (
          <View>
            {/* Blur is a CSS filter, so web only (this app is web-first); the
                opacity drop below covers native, where filter is a no-op risk
                rather than a guarantee. pointerEvents none keeps every blurred
                row untappable. */}
            <View
              pointerEvents="none"
              style={[styles.lockedList, Platform.OS === 'web' && { filter: 'blur(5px)' }]}
            >
              {chapterRows}
            </View>
            <View style={styles.lockOverlay} pointerEvents="none">
              <View style={styles.lockSeal}>
                <Ionicons name="lock-closed" size={26} color={colors.text} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />
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
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center', marginHorizontal: 8 },
  scroll: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  // Full-bleed: negative margins cancel the scroll gutter so the cover photo
  // reaches both edges; the fade melts it into the page background.
  hero: {
    marginHorizontal: -20,
    height: 210,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 4,
  },
  heroThumb: { alignItems: 'center', justifyContent: 'center' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: '800', paddingHorizontal: 20 },
  heroMeta: {
    color: colors.textMuted,
    fontSize: 12.5,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginTop: 2,
  },
  unlockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 16,
    ...shadow,
  },
  pillDisabled: { opacity: 0.5 },
  unlockPillText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  sectionLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: 26,
    marginBottom: 16,
  },
  chapterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  chapterThumb: { width: 52, height: 52, borderRadius: 12, marginRight: 12 },
  chapterName: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  chapterSci: { fontSize: 12.5, fontStyle: 'italic', color: colors.textMuted, marginTop: 1 },
  lockedList: { opacity: 0.55 },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockSeal: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
});
