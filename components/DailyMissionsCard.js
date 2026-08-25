import React, { useState, useCallback, useRef } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getTodaysMissions, TOKENS_PER_MISSION } from './missions';

// Today's three missions with live progress. Re-reads on every focus so
// progress made anywhere in the app (a scan on another tab, a share from a
// detail screen) is reflected the moment the user comes back - a stale
// "0 of 2" next to a mission they just did reads as broken.
//
// `refreshKey`: bump it to force a re-read outside of a focus change. The
// Discover screen needs this because ITS focus event is what completes the
// "visit Discover" mission - without the bump, the card read its data before
// the mission landed and showed the just-completed mission as pending on the
// very screen that completed it (Fable review finding).
export default function DailyMissionsCard({ refreshKey = 0 }) {
  const { t } = useTranslation();
  const [missions, setMissions] = useState(undefined);
  const previousCompletion = useRef(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getTodaysMissions()
        .then((nextMissions) => {
          if (!alive) return;
          if (previousCompletion.current) {
            const completedNow = nextMissions.filter(
              (mission) => mission.completed && previousCompletion.current.get(mission.id) === false
            );
            if (completedNow.length > 0) {
              const missionNames = completedNow
                .map((mission) => t(`missions.pool.${mission.id}`))
                .join(', ');
              try {
                AccessibilityInfo.announceForAccessibility?.(
                  t('missions.completedAnnouncement', { mission: missionNames })
                );
              } catch (e) {
                // O anuncio e auxiliar; a missao confirmada continua visivel.
              }
            }
          }
          previousCompletion.current = new Map(
            nextMissions.map((mission) => [mission.id, !!mission.completed])
          );
          setMissions(nextMissions);
        })
        .catch(() => {
          if (alive) setMissions([]);
        });
      return () => {
        alive = false;
      };
    }, [refreshKey, t])
  );

  if (missions === undefined) {
    return (
      <View
        style={styles.card}
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy: true }}
      >
        <View style={styles.loadingHeader} accessible={false} />
        {[0, 1, 2].map((key) => (
          <View key={key} style={styles.loadingRow} accessible={false}>
            <View style={styles.loadingDot} />
            <View style={styles.loadingLine} />
          </View>
        ))}
      </View>
    );
  }

  if (!missions.length) return null;

  const allDone = missions.every((m) => m.completed);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="today-outline" size={16} color={colors.accentLight} accessible={false} />
          <Text style={styles.title} accessibilityRole="header">{t('missions.title')}</Text>
        </View>
        <View style={styles.rewardPill}>
          <Ionicons name="disc-outline" size={11} color={colors.accentLight} accessible={false} />
          <Text style={styles.rewardPillText}>
            {t('missions.rewardEach', { tokens: TOKENS_PER_MISSION })}
          </Text>
        </View>
      </View>

      {missions.map((m) => (
        <View
          key={m.id}
          style={styles.row}
          accessible
          accessibilityRole="text"
          accessibilityLabel={m.completed
            ? `${t(`missions.pool.${m.id}`)}. ${t('missions.completedStatus')}`
            : `${t(`missions.pool.${m.id}`)}. ${t('missions.progressStatus', {
                done: m.done,
                target: m.target,
              })}`}
        >
          <Ionicons
            name={m.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={19}
            color={m.completed ? colors.accent : colors.textMuted}
            accessible={false}
          />
          <Text style={[styles.rowText, m.completed && styles.rowTextDone]} numberOfLines={2}>
            {t(`missions.pool.${m.id}`)}
          </Text>
          {m.target > 1 && !m.completed && (
            <Text style={styles.progress}>
              {m.done}/{m.target}
            </Text>
          )}
        </View>
      ))}

      {allDone && (
        <Text style={styles.allDone} accessibilityLiveRegion="polite">
          {t('missions.allDone')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent + '1E',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rewardPillText: { color: colors.accentLight, fontSize: 10.5, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
  },
  rowText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  rowTextDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  progress: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  allDone: {
    color: colors.accent,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  loadingHeader: {
    width: '46%',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    marginBottom: 11,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
  },
  loadingDot: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
  },
  loadingLine: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
});
