import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from '../components/theme';
import { getCollection, removeFromCollection, updateCollectionEntry } from '../components/storage';
import { syncCollection } from '../components/collectionSync';
import { CATEGORIES } from '../components/categories';
import { getWateringStatus } from '../components/watering';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import CategoryIcon from '../components/CategoryIcon';

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

export default function CollectionScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  // Search + per-category filter. Past roughly thirty saved items, scrolling a
  // flat list to find "that fern from last month" stops working; matching is on
  // the common name and the scientific name, since either is what people
  // remember. Chips only render when the collection actually spans more than
  // one category - a single-category collection gets no useless chrome.
  const normalizedQuery = query.trim().toLowerCase();
  const savedCategories = [...new Set(collection.map((i) => i.category))];
  const filtered = collection.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (!normalizedQuery) return true;
    return (
      (item.name || '').toLowerCase().includes(normalizedQuery) ||
      (item.scientific || '').toLowerCase().includes(normalizedQuery)
    );
  });

  const ROOM_LABELS = {
    'Living Room': t('collection.roomLivingRoom'),
    Bedroom: t('collection.roomBedroom'),
    Kitchen: t('collection.roomKitchen'),
    Balcony: t('collection.roomBalcony'),
    Office: t('collection.roomOffice'),
  };

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getCollection();
    setCollection(list);
    setLoading(false);

    // Cloud sync, after the local list is already on screen.
    //
    // Deliberately not awaited before rendering: the local collection is the
    // authoritative copy and must appear instantly, offline or not. Sync is a
    // convenience layered on top - it self-throttles to once a minute, never
    // throws, and only does anything for a signed-in subscriber.
    syncCollection().then((result) => {
      if (result?.added) load();
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Pull-to-refresh is an explicit 'do it now', so it bypasses the throttle.
    await syncCollection({ force: true });
    const list = await getCollection();
    setCollection(list);
    setRefreshing(false);
  }, []);

  const handleRemove = async (savedId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = await removeFromCollection(savedId);
    if (next) {
      setCollection(next);
    } else {
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const toggleViewMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'));
  };

  const applyRoom = async (savedId, room) => {
    const result = await updateCollectionEntry(savedId, { room: room === 'None' ? null : room });
    if (result) {
      setCollection(result);
    } else {
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const handleAssignRoom = (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAlert(
      t('collection.assignRoomTitle'),
      t('collection.assignRoomMessage', { name: item.name }),
      [
        { text: t('collection.roomLivingRoom'), onPress: () => applyRoom(item.savedId, 'Living Room') },
        { text: t('collection.roomBedroom'), onPress: () => applyRoom(item.savedId, 'Bedroom') },
        { text: t('collection.roomKitchen'), onPress: () => applyRoom(item.savedId, 'Kitchen') },
        { text: t('collection.roomBalcony'), onPress: () => applyRoom(item.savedId, 'Balcony') },
        { text: t('collection.roomOffice'), onPress: () => applyRoom(item.savedId, 'Office') },
        { text: t('collection.roomNone'), onPress: () => applyRoom(item.savedId, 'None') },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const renderItem = ({ item }) => {
    const meta = CATEGORIES[item.category] || CATEGORIES.plant;
    const wateringStatus = item.category === 'plant' ? getWateringStatus(item) : null;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate(meta.detailRoute, { plant: item })}
        onLongPress={() => handleAssignRoom(item)}
        accessibilityRole="button"
        accessibilityLabel={t('collection.viewDetailsLabel', { name: item.name })}
      >
        <View style={[styles.thumb, { backgroundColor: meta.accent + '33' }]}>
          <CategoryIcon name={meta.tabIcon} size={28} color={meta.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.name}</Text>
          {!!item.scientific && <Text style={styles.cardSci}>{item.scientific}</Text>}
          <View style={styles.cardMeta}>
            <View style={[styles.tag, { backgroundColor: meta.accent + '22' }]}>
              <Text style={[styles.tagText, { color: meta.accent }]}>{t(`categories.${meta.key}.label`)}</Text>
            </View>
            {!!wateringStatus && (
              <View style={styles.waterBadge}>
                <Ionicons
                  name="water-outline"
                  size={11}
                  color={wateringStatus.overdue ? colors.error : colors.textMuted}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text
                  style={[
                    styles.waterBadgeText,
                    { color: wateringStatus.overdue ? colors.error : colors.textMuted },
                  ]}
                >
                  {wateringStatus.label}
                </Text>
              </View>
            )}
            {!!item.room && (
              <View style={styles.roomBadge}>
                <Ionicons
                  name="home-outline"
                  size={11}
                  color={colors.textSecondary}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={styles.roomBadgeText}>{ROOM_LABELS[item.room]}</Text>
              </View>
            )}
            <Text style={styles.date}>
              <Ionicons
                name="time-outline"
                size={11}
                color={colors.textMuted}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />{' '}
              {formatDate(item.savedAt)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => handleRemove(item.savedId)}
          accessibilityRole="button"
          accessibilityLabel={t('collection.removeLabel', { name: item.name })}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderGridItem = ({ item }) => {
    const meta = CATEGORIES[item.category] || CATEGORIES.plant;
    return (
      <TouchableOpacity
        style={styles.gridCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate(meta.detailRoute, { plant: item })}
        onLongPress={() => handleAssignRoom(item)}
        accessibilityRole="button"
        accessibilityLabel={t('collection.viewDetailsLabel', { name: item.name })}
      >
        <View style={[styles.gridThumb, { backgroundColor: meta.accent + '33' }]}>
          <CategoryIcon name={meta.tabIcon} size={22} color={meta.accent} />
        </View>
        <Text style={styles.gridName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.tag, { backgroundColor: meta.accent + '22', marginRight: 0 }]}>
          <Text style={[styles.tagText, { color: meta.accent }]}>{t(`categories.${meta.key}.label`)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <View>
            <Text style={styles.title} accessibilityRole="header">{t('collection.title')}</Text>
            <Text style={styles.subtitle}>{t('collection.subtitle', { count: collection.length })}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {/* The profile shortcut that used to live here was removed: Profile is
              now its own bottom tab, right beside Collection. Two entry points to
              the same screen from adjacent spots is clutter, not convenience. */}
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.85}
            onPress={toggleViewMode}
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'list' ? t('collection.switchToGridLabel') : t('collection.switchToListLabel')}
          >
            <Ionicons
              name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
              size={20}
              color={colors.accentLight}
            />
          </TouchableOpacity>
          <View style={styles.countBadge}>
            <Ionicons
              name="albums-outline"
              size={18}
              color={colors.accentLight}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.countText}>{collection.length}</Text>
          </View>
        </View>
      </View>

      {!loading && collection.length > 0 && (
        <View style={styles.searchBlock}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={17} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('collection.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t('collection.clearSearchLabel')}
              >
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {savedCategories.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !categoryFilter && styles.chipActive]}
                onPress={() => setCategoryFilter(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: !categoryFilter }}
                accessibilityLabel={t('collection.filterAll')}
              >
                <Text style={[styles.chipText, !categoryFilter && styles.chipTextActive]}>
                  {t('collection.filterAll')}
                </Text>
              </TouchableOpacity>
              {savedCategories.map((key) => {
                const catMeta = CATEGORIES[key];
                if (!catMeta) return null;
                const active = categoryFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, active && { backgroundColor: catMeta.accent + '33', borderColor: catMeta.accent }]}
                    onPress={() => setCategoryFilter(active ? null : key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`categories.${key}.label`)}
                  >
                    <CategoryIcon name={catMeta.tabIcon} size={13} color={active ? catMeta.accent : colors.textMuted} />
                    <Text style={[styles.chipText, active && { color: catMeta.accent }]}>
                      {t(`categories.${key}.label`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {loading ? null : collection.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="file-tray-outline"
              size={48}
              color={colors.accent}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <Text style={styles.emptyTitle}>{t('collection.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('collection.emptyBody')}</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            activeOpacity={0.85}
            onPress={() => navigation.getParent()?.navigate(CATEGORIES.plant.tabLabel)}
            accessibilityRole="button"
            accessibilityLabel={t('collection.startIdentifying')}
          >
            <Ionicons
              name="scan"
              size={18}
              color={colors.white}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.emptyBtnText}>{t('collection.startIdentifying')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={filtered}
          keyExtractor={(item) => item.savedId}
          ListEmptyComponent={
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={30} color={colors.textMuted} />
              <Text style={styles.noResultsText}>{t('collection.noSearchResults')}</Text>
            </View>
          }
          renderItem={viewMode === 'grid' ? renderGridItem : renderItem}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: { color: colors.accentLight, fontWeight: '800', fontSize: 16, marginLeft: 6 },
  list: { padding: 20, paddingTop: 6 },
  searchBlock: { paddingHorizontal: 20, paddingBottom: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  chipRow: { marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.accent + '33', borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  chipTextActive: { color: colors.accent },
  noResults: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  noResultsText: { color: colors.textMuted, fontSize: 13.5, textAlign: 'center' },
  card: {
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
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSci: { fontSize: 12.5, fontStyle: 'italic', color: colors.textSecondary, marginTop: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 10 },
  tagText: { fontSize: 11, fontWeight: '700' },
  waterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 10,
  },
  waterBadgeText: { fontSize: 11, fontWeight: '700', marginLeft: 3 },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 10,
  },
  roomBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginLeft: 3 },
  date: { fontSize: 11, color: colors.textMuted },
  removeBtn: { padding: 8 },
  gridRow: { gap: 12 },
  gridCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  gridThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  emptyBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
  },
  emptyBtnText: { color: colors.white, fontWeight: '700', marginLeft: 8, fontSize: 15 },
});
