import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import CategoryIcon from '../components/CategoryIcon';
import NatureScene from '../components/NatureScene';
import TopBar from '../components/TopBar';
import { CATEGORIES } from '../components/categories';
import { getCollection } from '../components/storage';
import { sanitiseNatureCheckIn } from '../components/natureCheckIn';
import { colors, radius, space, type } from '../components/theme';

export default function NaturePassportScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getCollection().then((collection) => {
      if (!alive) return;
      setEntries(collection
        .map((entry) => ({ entry, checkIn: sanitiseNatureCheckIn(entry.checkIn) }))
        .filter((item) => item.checkIn)
        .sort((a, b) => b.checkIn.observedAt.localeCompare(a.checkIn.observedAt)));
    });
    return () => { alive = false; };
  }, []));

  const cityCount = useMemo(() => new Set(entries.map(({ checkIn }) => `${checkIn.city}|${checkIn.country}`)).size, [entries]);
  const formatter = useMemo(() => {
    try { return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch (e) { return null; }
  }, [i18n.language, i18n.resolvedLanguage]);

  const header = entries.length ? (
    <View style={styles.summary}>
      <View style={styles.summaryStamp}><Ionicons name="earth" size={25} color={colors.accentLight} /></View>
      <View style={styles.grow}><Text style={styles.summaryNumber}>{cityCount}</Text><Text style={styles.summaryLabel}>{t('checkIn.kicker')}</Text></View>
      <Text style={styles.summaryCount}>{entries.length}</Text>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <NatureScene />
      <TopBar title={t('checkIn.kicker')} onBack={() => navigation.goBack()} />
      <FlatList
        data={entries}
        keyExtractor={({ entry }) => entry.savedId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <View style={styles.emptyStamp}><Ionicons name="location-outline" size={28} color={colors.accentLight} /></View>
            <Text style={styles.emptyTitle}>{t('checkIn.title')}</Text>
            <Text style={styles.emptyBody}>{t('checkIn.body')}</Text>
          </View>
        )}
        renderItem={({ item: { entry, checkIn } }) => {
          const meta = CATEGORIES[entry.category] || CATEGORIES.plant;
          return (
            <View style={styles.record}>
              <View style={[styles.spine, { backgroundColor: meta.accent }]} />
              <View style={[styles.category, { backgroundColor: `${meta.accent}1A` }]}><CategoryIcon name={meta.tabIcon} size={18} color={meta.accent} /></View>
              <View style={styles.grow}>
                <Text style={styles.place}>{checkIn.city}, {checkIn.country}</Text>
                <Text style={styles.subject}>{entry.name || entry.scientific}</Text>
                <Text style={styles.meta}>{t(`checkIn.habitats.${checkIn.habitat}`)} · {formatter ? formatter.format(new Date(checkIn.observedAt)) : ''}</Text>
                {checkIn.note ? <Text style={styles.note}>{checkIn.note}</Text> : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, list: { padding: space.md, paddingBottom: space.xxl }, grow: { flex: 1 },
  summary: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: `${colors.accent}55`, padding: space.md, marginBottom: space.sm },
  summaryStamp: { width: 50, height: 50, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accentLight, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  summaryNumber: { color: colors.text, fontSize: 24, lineHeight: 28, fontWeight: '900' }, summaryLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },
  summaryCount: { color: colors.accentLight, fontSize: 19, fontWeight: '900' },
  record: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', padding: space.md, marginTop: space.sm },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 }, category: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  place: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' }, subject: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginTop: 2 }, meta: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 2 }, note: { ...type.body, color: colors.textSecondary, marginTop: space.sm },
  empty: { minHeight: 420, alignItems: 'center', justifyContent: 'center', padding: space.xl }, emptyStamp: { width: 70, height: 70, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentLight, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] },
  emptyTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900', textAlign: 'center', marginTop: space.md }, emptyBody: { ...type.body, textAlign: 'center', marginTop: space.xs },
});
