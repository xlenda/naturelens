import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors, control, shadow } from '../components/theme';
import {
  getCollection,
  markCollectionWatered,
  removeFromCollection,
  updateCollectionEntry,
} from '../components/storage';
import { syncCollection } from '../components/collectionSync';
import { CATEGORIES } from '../components/categories';
import { getCareQueue } from '../components/watering';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import CategoryIcon from '../components/CategoryIcon';
import FindThumb from '../components/FindThumb';
import SubscribeFab from '../components/SubscribeFab';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import MainScreenHeader from '../components/MainScreenHeader';
import { TopBarIcon } from '../components/TopBar';

function formatDate(iso, locale) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

function isSavedEntry(item) {
  return item && typeof item === 'object' && typeof item.savedId === 'string' && item.savedId;
}

export default function CollectionScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [careOnly, setCareOnly] = useState(false);
  const [wateringSavedId, setWateringSavedId] = useState(null);
  const [removingSavedId, setRemovingSavedId] = useState(null);
  const removalInFlightRef = useRef(null);
  // The find being nicknamed, or null. Draft is separate state so typing does
  // not touch the collection until the user confirms.
  const [nicknameTarget, setNicknameTarget] = useState(null);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  // Storage can contain legacy/corrupted rows from old browser sessions. The
  // screen only renders real saved specimens; storage also repairs this.
  const collectionRows = collection.filter(isSavedEntry);
  const safeCollection = collectionRows;
  const normalizedQuery = query.trim().toLowerCase();
  const savedCategories = [...new Set(safeCollection.map((i) => i.category).filter(Boolean))];
  const careQueue = getCareQueue(collection);
  const careStatusById = new Map(careQueue.map(({ entry, status }) => [entry.savedId, status]));
  const careRankById = new Map(careQueue.map(({ entry }, index) => [entry.savedId, index]));
  const careCheckIds = new Set(
    careQueue.filter(({ status }) => status.untracked).map(({ entry }) => entry.savedId)
  );
  const activeCareOnly = careOnly && careCheckIds.size > 0;
  const filtered = safeCollection
    .filter((item) => {
      if (activeCareOnly && !careCheckIds.has(item.savedId)) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      return (
        (item.nickname || '').toLowerCase().includes(normalizedQuery) ||
        (item.name || '').toLowerCase().includes(normalizedQuery) ||
        (item.scientific || '').toLowerCase().includes(normalizedQuery)
      );
    })
    // Fora da agenda, a colecao continua na ordem em que a pessoa a conhece.
    // Dentro dela, a fila preserva a ordem: nao existe prazo deduzido.
    .sort((a, b) =>
      activeCareOnly ? careRankById.get(a.savedId) - careRankById.get(b.savedId) : 0
    );

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

    // Deliberately not awaited before rendering: the local collection is the
    // authoritative copy and must appear instantly, offline or not.
    syncCollection().then(async (result) => {
      if (!result?.changed) return;
      const merged = await getCollection();
      setCollection(merged);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncCollection({ force: true });
    const list = await getCollection();
    setCollection(list);
    setRefreshing(false);
  }, []);

  const removeConfirmed = async (item) => {
    if (!item?.savedId || removalInFlightRef.current) return;
    removalInFlightRef.current = item.savedId;
    setRemovingSavedId(item.savedId);
    try {
      const next = await removeFromCollection(item.savedId);
      if (next) setCollection(next);
      else showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    } finally {
      removalInFlightRef.current = null;
      setRemovingSavedId(null);
    }
  };

  const confirmRemove = (item) => {
    if (!item?.savedId || removalInFlightRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const name = item.nickname || item.displayName || item.name;
    showAlert(
      t('specimen.removeTitle'),
      t('specimen.removeBody', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('specimen.removeAction'),
          style: 'destructive',
          onPress: () => removeConfirmed(item),
        },
      ]
    );
  };

  const applyRoom = async (savedId, room) => {
    const result = await updateCollectionEntry(savedId, { room: room === 'None' ? null : room });
    if (result) {
      setCollection(result);
    } else {
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const handleWater = async (item, event) => {
    event?.stopPropagation?.();
    if (wateringSavedId) return;
    setWateringSavedId(item.savedId);
    let result = null;
    try {
      result = await markCollectionWatered(item.savedId);
    } catch (e) {
      result = null;
    } finally {
      setWateringSavedId(null);
    }
    if (result) {
      setCollection(result.entries);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!getCareQueue(result.entries).some(({ status }) => status.untracked)) {
        setCareOnly(false);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const openNicknameEditor = (item) => {
    setNicknameDraft(item.nickname || '');
    setNicknameTarget(item);
  };

  const saveNickname = async () => {
    const target = nicknameTarget;
    setNicknameTarget(null);
    if (!target) return;
    const trimmed = nicknameDraft.trim().slice(0, 40);
    const result = await updateCollectionEntry(target.savedId, { nickname: trimmed || null });
    if (result) {
      setCollection(result);
    } else {
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const openActions = (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAlert(item.nickname || item.name, null, [
      { text: t('collection.setNickname'), onPress: () => openNicknameEditor(item) },
      { text: t('collection.assignRoomTitle'), onPress: () => handleAssignRoom(item) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
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

  const renderListItem = ({ item }) => {
    if (!isSavedEntry(item)) return null;
    const category = CATEGORIES[item.category] || CATEGORIES.plant;
    const wateringStatus = careStatusById.get(item.savedId) || null;

    return (
      <PressScale>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Specimen', { savedId: item.savedId })}
          onLongPress={() => openActions(item)}
          accessibilityRole="button"
          accessibilityLabel={t('collection.viewDetailsLabel', { name: item.nickname || item.name })}
        >
          <FindThumb
            photoUri={item.photoUri}
            referencePhoto={item.referencePhoto}
            similarImages={item.similarImages}
            scientific={item.scientific}
            icon={category.tabIcon}
            accent={category.accent}
            iconSize={28}
            style={styles.thumb}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{item.nickname || item.name}</Text>
            {!!item.nickname && <Text style={styles.cardRealName}>{item.name}</Text>}
            {!!item.scientific && <Text style={styles.cardSci}>{item.scientific}</Text>}
            <View style={styles.cardMeta}>
              <View style={[styles.tag, { backgroundColor: `${category.accent}22` }]}>
                <Text style={[styles.tagText, { color: category.accent }]}>
                  {t(`categories.${category.key}.label`)}
                </Text>
              </View>
              {!!wateringStatus?.untracked && (
                <View style={styles.waterBadge}>
                  <Ionicons name="water-outline" size={11} color={colors.info} />
                  <Text style={[styles.waterBadgeText, { color: colors.info }]}>
                    {t('detail.waterCheckToday')}
                  </Text>
                </View>
              )}
              {!!item.room && (
                <View style={styles.roomBadge}>
                  <Ionicons name="home-outline" size={11} color={colors.textSecondary} />
                  <Text style={styles.roomBadgeText}>{ROOM_LABELS[item.room]}</Text>
                </View>
              )}
              <Text style={styles.date}>
                <Ionicons name="time-outline" size={11} color={colors.textMuted} />{' '}
                {formatDate(item.savedAt, i18n.language)}
              </Text>
            </View>
            {!!wateringStatus?.untracked && (
              <TouchableOpacity
                style={[styles.waterAction, wateringSavedId === item.savedId && styles.disabled]}
                activeOpacity={0.8}
                onPress={(event) => handleWater(item, event)}
                disabled={wateringSavedId === item.savedId}
                accessibilityRole="button"
                accessibilityState={{
                  busy: wateringSavedId === item.savedId,
                  disabled: wateringSavedId === item.savedId,
                }}
                accessibilityLabel={t('detail.markAsWateredLabel')}
              >
                {wateringSavedId === item.savedId ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="checkmark" size={13} color={colors.white} />
                )}
                <Text style={styles.waterActionText}>{t('detail.markAsWatered')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.removeBtn, removingSavedId === item.savedId && styles.disabled]}
            onPress={(event) => {
              event?.stopPropagation?.();
              confirmRemove(item);
            }}
            disabled={removingSavedId === item.savedId}
            accessibilityRole="button"
            accessibilityState={{ busy: removingSavedId === item.savedId }}
            accessibilityLabel={t('collection.removeLabel', {
              name: item.nickname || item.displayName || item.name,
            })}
          >
            {removingSavedId === item.savedId ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </PressScale>
    );
  };

  const renderGridItem = ({ item }) => {
    if (!isSavedEntry(item)) return null;
    const category = CATEGORIES[item.category] || CATEGORIES.plant;
    const wateringStatus = careStatusById.get(item.savedId) || null;

    return (
      <PressScale style={styles.gridCardWrap}>
        <TouchableOpacity
          style={styles.gridCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Specimen', { savedId: item.savedId })}
          onLongPress={() => openActions(item)}
          accessibilityRole="button"
          accessibilityLabel={t('collection.viewDetailsLabel', { name: item.nickname || item.name })}
        >
          <FindThumb
            photoUri={item.photoUri}
            referencePhoto={item.referencePhoto}
            similarImages={item.similarImages}
            scientific={item.scientific}
            icon={category.tabIcon}
            accent={category.accent}
            iconSize={30}
            style={styles.gridThumb}
          />
          <TouchableOpacity
            style={[styles.gridRemoveBtn, removingSavedId === item.savedId && styles.disabled]}
            onPress={(event) => {
              event?.stopPropagation?.();
              confirmRemove(item);
            }}
            disabled={removingSavedId === item.savedId}
            accessibilityRole="button"
            accessibilityState={{ busy: removingSavedId === item.savedId }}
            accessibilityLabel={t('collection.removeLabel', {
              name: item.nickname || item.displayName || item.name,
            })}
          >
            {removingSavedId === item.savedId ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          <Text style={styles.gridName} numberOfLines={1}>{item.nickname || item.name}</Text>
          <View style={[styles.tag, { backgroundColor: `${category.accent}22`, marginRight: 0 }]}>
            <Text style={[styles.tagText, { color: category.accent }]}>
              {t(`categories.${category.key}.label`)}
            </Text>
          </View>
          {!!wateringStatus?.untracked && (
            <View style={styles.gridCareBadge}>
              <Ionicons name="water-outline" size={11} color={colors.info} />
              <Text style={styles.gridCareText}>{t('detail.waterCheckToday')}</Text>
            </View>
          )}
        </TouchableOpacity>
      </PressScale>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NatureScene />
      <MainScreenHeader
        style={styles.header}
        leading={<Image source={require('../assets/icon.png')} style={styles.logo} />}
        title={t('collection.title')}
        subtitle={t('collection.subtitle', { count: safeCollection.length })}
        right={(
          <>
            <TopBarIcon
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setViewMode((mode) => (mode === 'list' ? 'grid' : 'list'));
              }}
              label={viewMode === 'list' ? t('collection.switchToGridLabel') : t('collection.switchToListLabel')}
            >
              <Ionicons
                name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
                size={20}
                color={colors.accentLight}
              />
            </TopBarIcon>
            <TopBarIcon
              onPress={() => navigation.navigate('Profile', { screen: 'Settings' })}
              label={t('settings.title')}
            >
              <Ionicons name="settings-outline" size={20} color={colors.accentLight} />
            </TopBarIcon>
          </>
        )}
      />

      {!loading && safeCollection.length > 0 && (
        <ZoneBand gutter={0}>
          <View style={styles.searchBlock}>
            {careCheckIds.size > 0 && (
              <TouchableOpacity
                style={[styles.careSummary, activeCareOnly && styles.careSummaryActive]}
                activeOpacity={0.82}
                onPress={() => {
                  setCareOnly(!activeCareOnly);
                  setCategoryFilter(null);
                  setViewMode('list');
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: activeCareOnly }}
                accessibilityLabel={`${t('detail.scheduleSection')}: ${careCheckIds.size} ${t('detail.waterCheckToday')}`}
              >
                <View style={styles.careSummaryIcon}>
                  <Ionicons name="calendar-outline" size={19} color={colors.info} />
                </View>
                <View style={styles.careSummaryText}>
                  <Text style={styles.careSummaryTitle}>{t('detail.scheduleSection')}</Text>
                  <Text style={styles.careSummarySubtitle}>{t('detail.waterCheckToday')}</Text>
                </View>
                <View style={styles.careSummaryCount}>
                  <Text style={styles.careSummaryCountText}>{careCheckIds.size}</Text>
                </View>
                <Ionicons name={activeCareOnly ? 'close' : 'chevron-forward'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}

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
                  style={styles.clearSearchButton}
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
                  style={[styles.chip, !categoryFilter && !activeCareOnly && styles.chipActive]}
                  onPress={() => {
                    setCategoryFilter(null);
                    setCareOnly(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !categoryFilter && !activeCareOnly }}
                  accessibilityLabel={t('collection.filterAll')}
                >
                  <Text style={[styles.chipText, !categoryFilter && !activeCareOnly && styles.chipTextActive]}>
                    {t('collection.filterAll')}
                  </Text>
                </TouchableOpacity>
                {savedCategories.map((key) => {
                  const category = CATEGORIES[key];
                  if (!category) return null;
                  const active = categoryFilter === key && !activeCareOnly;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.chip, active && { backgroundColor: `${category.accent}33`, borderColor: category.accent }]}
                      onPress={() => {
                        setCategoryFilter(active ? null : key);
                        setCareOnly(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t(`categories.${key}.label`)}
                    >
                      <CategoryIcon name={category.tabIcon} size={13} color={active ? category.accent : colors.textMuted} />
                      <Text style={[styles.chipText, active && { color: category.accent }]}>
                        {t(`categories.${key}.label`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </ZoneBand>
      )}

      {loading ? null : safeCollection.length === 0 ? (
        <View style={styles.empty}>
          <Image source={require('../assets/art/empty-collection.jpg')} style={styles.emptyArt} resizeMode="cover" />
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
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.emptyBtnText}>{t('collection.startIdentifying')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          key={viewMode}
          keyExtractor={(item) => item.savedId}
          ListEmptyComponent={(
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={30} color={colors.textMuted} />
              <Text style={styles.noResultsText}>{t('collection.noSearchResults')}</Text>
            </View>
          )}
          renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          )}
        />
      )}

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />

      <Modal
        visible={!!nicknameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameTarget(null)}
      >
        <View style={styles.nicknameBackdrop}>
          <View style={styles.nicknameCard}>
            <Text style={styles.nicknameTitle}>{t('collection.nicknameTitle')}</Text>
            <Text style={styles.nicknameHint}>
              {t('collection.nicknamePrompt', { name: nicknameTarget?.name || '' })}
            </Text>
            <TextInput
              style={styles.nicknameInput}
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder={t('collection.nicknamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveNickname}
            />
            <View style={styles.nicknameButtons}>
              <TouchableOpacity
                style={[styles.nicknameBtn, styles.nicknameBtnCancel]}
                activeOpacity={0.8}
                onPress={() => setNicknameTarget(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.nicknameBtnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nicknameBtn}
                activeOpacity={0.8}
                onPress={saveNickname}
                accessibilityRole="button"
                accessibilityLabel={t('common.ok')}
              >
                <Text style={styles.nicknameBtnText}>{t('common.ok')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SubscribeFab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, marginBottom: 12 },
  logo: { width: 42, height: 42, borderRadius: 12 },
  list: { padding: 20, paddingTop: 6, paddingBottom: 84 },
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
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  clearSearchButton: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  chipRow: { marginTop: 10 },
  chip: {
    minHeight: control.minTouch,
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
  chipActive: { backgroundColor: `${colors.accent}33`, borderColor: colors.accent },
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
  thumb: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardRealName: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  cardSci: { fontSize: 12.5, fontStyle: 'italic', color: colors.textSecondary, marginTop: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 10 },
  tagText: { fontSize: 11, fontWeight: '700' },
  waterBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 10 },
  waterBadgeText: { fontSize: 11, fontWeight: '700', marginLeft: 3 },
  waterAction: {
    minHeight: control.minTouch,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.info,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 9,
  },
  waterActionText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  roomBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 10 },
  roomBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginLeft: 3 },
  date: { fontSize: 11, color: colors.textMuted },
  removeBtn: { minWidth: control.minTouch, minHeight: control.minTouch, alignItems: 'center', justifyContent: 'center' },
  gridRow: { gap: 12 },
  gridCardWrap: { width: '48%' },
  gridCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  gridThumb: { width: '100%', height: 110, borderRadius: 12, marginBottom: 8 },
  gridRemoveBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: control.minTouch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6, textAlign: 'center', alignSelf: 'stretch' },
  gridCareBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: `${colors.error}18` },
  gridCareText: { color: colors.error, fontSize: 10.5, fontWeight: '700' },
  careSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 11,
    marginBottom: 10,
  },
  careSummaryActive: { borderColor: colors.info, backgroundColor: `${colors.info}12` },
  careSummaryIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.info}18`, marginRight: 10 },
  careSummaryText: { flex: 1 },
  careSummaryTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  careSummarySubtitle: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
  careSummaryCount: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.error}20`, marginRight: 6 },
  careSummaryCountText: { color: colors.error, fontSize: 12.5, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyArt: { width: 240, height: 200, borderRadius: 22, marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, marginTop: 24 },
  emptyBtnText: { color: colors.white, fontWeight: '700', marginLeft: 8, fontSize: 15 },
  nicknameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  nicknameCard: { width: '100%', maxWidth: 340, backgroundColor: colors.card, borderRadius: 18, padding: 22, borderWidth: 1, borderColor: colors.border, ...shadow },
  nicknameTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  nicknameHint: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, textAlign: 'center', marginBottom: 14 },
  nicknameInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, color: colors.text, marginBottom: 14 },
  nicknameButtons: { flexDirection: 'row', gap: 8 },
  nicknameBtn: { flex: 1, minHeight: control.minTouch, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accent },
  nicknameBtnCancel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  nicknameBtnText: { color: colors.white, fontWeight: '700', fontSize: 14.5 },
  nicknameBtnCancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14.5 },
});
