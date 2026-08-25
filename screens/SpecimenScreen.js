import React, { useCallback, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import {
  getCollectionEntry,
  markCollectionWatered,
  removeFromCollection,
  updateCollectionEntry,
} from '../components/storage';
import { getWateringStatus } from '../components/watering';
import { CATEGORIES } from '../components/categories';
import { colors, control, shadow, type } from '../components/theme';
import NatureScene from '../components/NatureScene';
import FindThumb from '../components/FindThumb';
import SectionCard from '../components/SectionCard';
import TopBar, { TopBarIcon } from '../components/TopBar';
import ZoneBand from '../components/ZoneBand';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import SectionHeading from '../components/SectionHeading';
import ReminderManager from '../components/ReminderManager';
import { agronomySubjectKey } from '../components/agronomyStorage';
import { observationSubjectKey } from '../components/observationStorage';

const NOTE_MAX = 500;
const CARE_CATEGORIES = new Set(['plant', 'tree']);
const ROOM_OPTIONS = [
  ['Living Room', 'collection.roomLivingRoom'],
  ['Bedroom', 'collection.roomBedroom'],
  ['Kitchen', 'collection.roomKitchen'],
  ['Balcony', 'collection.roomBalcony'],
  ['Office', 'collection.roomOffice'],
  [null, 'collection.roomNone'],
];

// Estes valores crus sao o contrato de seguranca do fornecedor. Os rotulos
// traduzidos servem apenas para leitura; usa-los para decidir a cor faria um
// "deadly" traduzido deixar de casar e perder o vermelho.
const HIGH_RISK_INSECT_TAGS = [
  'bites or stings',
  'bites pets',
  'allergenic',
  'disease transmission',
  'mildly venomous',
  'highly venomous',
];

const EDIBILITY_COLORS = {
  choice: colors.accent,
  edible: colors.accent,
  'edible with caution': colors.warning,
  inedible: colors.warning,
  unknown: colors.textMuted,
  poisonous: colors.error,
  toxic: colors.error,
  deadly: colors.error,
};

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(value, locale, withTime = false) {
  const date = validDate(value);
  if (!date) return '';
  try {
    return date.toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
  } catch (e) {
    return '';
  }
}

function cleanStrings(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

function riskFor(entry, t) {
  if (!entry) return null;

  if ((entry.category === 'plant' || entry.category === 'tree') && entry.toxicity) {
    return {
      color: colors.error,
      lines: [String(entry.toxicity)],
      foodSafety: false,
    };
  }

  if (entry.category === 'insect') {
    const raw = cleanStrings(entry.danger);
    const labels = cleanStrings(entry.dangerLabel);
    const visible = raw.length
      ? raw.map((item, index) => labels[index] || item)
      : labels;
    const description = typeof entry.dangerDescription === 'string' && entry.dangerDescription.trim()
      ? entry.dangerDescription
      : null;
    if (!visible.length && !description) return null;
    return {
      color: raw.some((item) => HIGH_RISK_INSECT_TAGS.includes(item))
        ? colors.error
        : colors.warning,
      lines: [...visible, ...(description ? [description] : [])],
      foodSafety: false,
    };
  }

  if (entry.category === 'mushroom') {
    const rawEdibility = typeof entry.edibility === 'string' ? entry.edibility : '';
    const shownEdibility = entry.edibilityLabel || rawEdibility;
    const psychoactive = entry.psychoactive === true;
    const rawColor = EDIBILITY_COLORS[rawEdibility.toLowerCase()] || colors.warning;
    return {
      color: psychoactive && rawColor !== colors.error ? colors.warning : rawColor,
      lines: [
        ...(shownEdibility ? [String(shownEdibility)] : []),
        ...(psychoactive ? [t('detail.psychoactiveWarning')] : []),
      ],
      foodSafety: true,
    };
  }

  return null;
}

function TimelineItem({ icon, color, label, date }) {
  return (
    <View style={styles.timelineItem} accessible accessibilityLabel={`${label}. ${date}`}>
      <View style={[styles.timelineDot, { borderColor: color, backgroundColor: color + '22' }]}>
        <Ionicons
          name={icon}
          size={15}
          color={color}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <View style={styles.timelineCopy}>
        <Text style={styles.timelineLabel}>{label}</Text>
        <Text style={styles.timelineDate}>{date}</Text>
      </View>
    </View>
  );
}

export default function SpecimenScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, i18n } = useTranslation();
  const savedId = route.params?.savedId;
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyCare, setBusyCare] = useState(false);
  const [busyProfile, setBusyProfile] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [busyNote, setBusyNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [roomDraft, setRoomDraft] = useState(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      getCollectionEntry(savedId).then((found) => {
        if (!alive) return;
        setEntry(found);
        setNicknameDraft(found?.nickname || '');
        setRoomDraft(found?.room || null);
        setNoteDraft(found?.specimenNote || '');
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [savedId])
  );

  const meta = entry ? CATEGORIES[entry.category] : null;
  const accent = meta?.accent || colors.accent;
  const risk = useMemo(() => riskFor(entry, t), [entry, t]);
  const wateringStatus = entry && CARE_CATEGORIES.has(entry.category)
    ? getWateringStatus(entry)
    : null;

  const timeline = useMemo(() => {
    if (!entry) return [];
    return [
      {
        key: 'note',
        // Apagar a unica observacao atualiza o relogio de sync, mas nao cria um
        // evento de "observacao atualizada": isso fingiria um historico que o
        // modelo de dado deliberadamente nao guarda.
        at: entry.specimenNote ? entry.specimenNoteUpdatedAt : null,
        label: t('specimen.timelineObservationUpdated'),
        icon: 'create-outline',
        color: colors.purple,
      },
      {
        key: 'water',
        at: entry.lastWateredAt,
        label: t('specimen.timelineWatered'),
        icon: 'water-outline',
        color: colors.info,
      },
      {
        key: 'saved',
        at: entry.savedAt,
        label: t('specimen.timelineAdded'),
        icon: 'bookmark-outline',
        color: accent,
      },
    ]
      .filter((item) => validDate(item.at))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [accent, entry, t]);

  const showSaveError = () => showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));

  const applyProfilePatch = async (patch) => {
    if (!entry || busyProfile) return false;
    setBusyProfile(true);
    let result = null;
    try {
      result = await updateCollectionEntry(entry.savedId, patch);
    } catch (e) {
      result = null;
    } finally {
      setBusyProfile(false);
    }
    if (!result) {
      showSaveError();
      return false;
    }
    const updated = Array.isArray(result)
      ? result.find((item) => item.savedId === entry.savedId)
      : null;
    if (!updated) {
      showSaveError();
      return false;
    }
    setEntry(updated);
    setNicknameDraft(updated.nickname || '');
    setRoomDraft(updated.room || null);
    return true;
  };

  const openProfileModal = () => {
    if (!entry) return;
    setNicknameDraft(entry.nickname || '');
    setRoomDraft(entry.room || null);
    setProfileModalVisible(true);
  };

  const closeProfileModal = () => {
    if (busyProfile) return;
    setNicknameDraft(entry?.nickname || '');
    setRoomDraft(entry?.room || null);
    setProfileModalVisible(false);
  };

  const saveProfile = async () => {
    if (!entry || busyProfile) return;
    const nickname = nicknameDraft.trim() || null;
    const room = roomDraft || null;
    if (nickname === (entry.nickname || null) && room === (entry.room || null)) {
      setProfileModalVisible(false);
      return;
    }
    const saved = await applyProfilePatch({ nickname, room });
    if (saved) setProfileModalVisible(false);
  };

  const markWatered = async () => {
    if (!entry || busyCare) return;
    setBusyCare(true);
    let result = null;
    try {
      result = await markCollectionWatered(entry.savedId);
    } catch (e) {
      result = null;
    } finally {
      setBusyCare(false);
    }
    if (!result) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showSaveError();
      return;
    }
    setEntry(result.entry);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility?.(t('specimen.wateredAnnouncement'));
  };

  const persistNote = async (nextText) => {
    if (!entry || busyNote) return false;
    setBusyNote(true);
    const result = await updateCollectionEntry(entry.savedId, { specimenNote: nextText });
    setBusyNote(false);
    if (!result) {
      showSaveError();
      return false;
    }
    const updated = result.find((item) => item.savedId === entry.savedId);
    if (!updated) {
      showSaveError();
      return false;
    }
    setEntry(updated);
    setNoteDraft(updated.specimenNote || '');
    setEditingNote(false);
    AccessibilityInfo.announceForAccessibility?.(t('specimen.noteSavedAnnouncement'));
    return true;
  };

  const saveNote = () => persistNote(noteDraft);

  const confirmRemoveEntry = () => {
    showAlert(
      t('specimen.removeTitle'),
      t('specimen.removeBody', { name: entry.nickname || entry.displayName || entry.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('specimen.removeAction'),
          style: 'destructive',
          onPress: async () => {
            const result = await removeFromCollection(entry.savedId);
            if (result) navigation.goBack();
            else showSaveError();
          },
        },
      ]
    );
  };

  const openGuide = () => {
    if (!entry || !meta?.detailRoute) return;
    // A capa do exemplar e substituida pela ficha para uma unica volta levar
    // direto a Colecao. Empilhar as duas telas exigia dois retornos.
    navigation.replace(meta.detailRoute, { plant: entry, fromIdentify: false });
  };

  const advancedWorkspace = !entry
    ? null
    : entry?.category === 'crop'
      ? {
          route: 'AgronomyWorkspace',
          key: agronomySubjectKey(entry, entry.savedId),
          title: t('agronomyWorkspace.openTitle'),
          body: t('agronomyWorkspace.openBody'),
          action: t('agronomyWorkspace.openAction'),
          icon: 'analytics-outline',
        }
      : {
          route: 'ObservationWorkspace',
          key: observationSubjectKey(entry, entry.savedId),
          title: t('observationWorkspace.openTitle'),
          body: t('observationWorkspace.openBody'),
          action: t('observationWorkspace.openAction'),
          icon: 'journal-outline',
        };

  const openAdvancedWorkspace = () => {
    if (!advancedWorkspace?.key) return;
    navigation.navigate(advancedWorkspace.route, {
      entity: entry,
      savedId: entry.savedId,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <NatureScene />
        <TopBar title={t('specimen.title')} onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <NatureScene />
        <TopBar title={t('specimen.title')} onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="leaf-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>{t('specimen.notFoundTitle')}</Text>
          <Text style={styles.emptyBody}>{t('specimen.notFoundBody')}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('specimen.returnToCollection')}
          >
            <Text style={styles.primaryButtonText}>{t('specimen.returnToCollection')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const identityName = entry.displayName || entry.name || entry.scientific;
  const displayName = entry.nickname || identityName;
  const secondaryName = entry.nickname
    ? identityName
    : entry.displayName && entry.name !== entry.displayName
      ? entry.name
      : null;
  const savedDate = formatDate(entry.savedAt, i18n.language);
  const noteChanged = noteDraft.trim() !== (entry.specimenNote || '');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <NatureScene accent={accent} />
      <TopBar
        title={t('specimen.title')}
        onBack={() => navigation.goBack()}
        right={
          <TopBarIcon onPress={confirmRemoveEntry} label={t('specimen.removeAction')}>
            <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
          </TopBarIcon>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* O exemplar salvo e capa de diario, nao linha de configuracao. O
            gutter negativo transforma a foto da pessoa em ancora; o gradiente
            protege a leitura sem apagar a imagem inteira. Os dados pessoais
            ficam no modal para preservar identidade -> risco -> hoje -> nota. */}
        <View style={styles.hero}>
          <FindThumb
            photoUri={entry.photoUri}
            referencePhoto={entry.referencePhoto}
            similarImages={entry.similarImages}
            scientific={entry.scientific}
            icon={meta?.tabIcon || 'leaf'}
            accent={accent}
            iconSize={58}
            style={styles.heroPhoto}
          />
          <LinearGradient
            colors={[colors.background + '18', colors.background + '40', colors.background + 'F5']}
            locations={[0, 0.45, 1]}
            style={styles.heroGradient}
            pointerEvents="none"
          />

          <View style={styles.heroTopRow}>
            {!!meta && (
              <View style={[styles.categoryBadge, { borderColor: accent + '88' }]}>
                <Text style={[styles.categoryBadgeText, { color: accent }]}>
                  {t(`categories.${meta.key}.label`)}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.heroPersonalizeButton}
              onPress={openProfileModal}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={t('specimen.personalizeTitle')}
            >
              <Ionicons name="create-outline" size={17} color={colors.white} />
              <Text style={styles.heroPersonalizeText} numberOfLines={1}>
                {t('specimen.personalizeTitle')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroCopy}>
            {!!displayName && <Text style={styles.name} numberOfLines={2}>{displayName}</Text>}
            {!!secondaryName && (
              <Text style={styles.realName} numberOfLines={1}>{secondaryName}</Text>
            )}
            {!!entry.scientific && (
              <Text style={styles.scientific} numberOfLines={1}>{entry.scientific}</Text>
            )}
            {!!savedDate && (
              <Text style={styles.savedDate}>{t('specimen.savedOn', { date: savedDate })}</Text>
            )}
          </View>
        </View>

        {!!risk && (
          <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={risk.color}>
            {risk.lines.map((line, index) => (
              <Text key={`${index}-${line}`} style={[styles.body, index > 0 && styles.bodyGap]}>
                {line}
              </Text>
            ))}
            {risk.foodSafety && (
              <View style={styles.foodSafety}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
                <Text style={styles.foodSafetyText}>{t('terms.accuracyBody')}</Text>
              </View>
            )}
          </SectionCard>
        )}

        {!!wateringStatus && (
          <ZoneBand gutter={20} style={styles.careBand}>
            <SectionHeading>{t('specimen.todayTitle')}</SectionHeading>
            <View style={styles.todayCard}>
              <View style={[styles.todayIcon, { backgroundColor: colors.info + '22' }]}>
                <Ionicons name="water-outline" size={23} color={colors.info} />
              </View>
              <View style={styles.todayCopy}>
                <Text style={styles.todayStatus}>
                  {wateringStatus.untracked
                    ? t('detail.waterCheckToday')
                    : t('specimen.timelineWatered')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.careButton, busyCare && styles.disabled]}
                onPress={markWatered}
                disabled={busyCare}
                accessibilityRole="button"
                accessibilityState={{ busy: busyCare, disabled: busyCare }}
                accessibilityLabel={t('detail.markAsWateredLabel', { name: displayName })}
              >
                {busyCare ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="checkmark" size={17} color={colors.white} />
                )}
                <Text style={styles.careButtonText}>{t('detail.markAsWatered')}</Text>
              </TouchableOpacity>
            </View>
          </ZoneBand>
        )}

        <SectionHeading>{t('specimen.observationTitle')}</SectionHeading>
        <View style={styles.card}>
          {editingNote ? (
            <>
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={noteDraft}
                onChangeText={setNoteDraft}
                maxLength={NOTE_MAX}
                multiline
                autoFocus
                textAlignVertical="top"
                placeholder={t('specimen.observationPlaceholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('specimen.observationTitle')}
              />
              <Text style={styles.characterCount}>
                {t('specimen.characterCount', { count: noteDraft.length, max: NOTE_MAX })}
              </Text>
              <View style={styles.noteActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setNoteDraft(entry.specimenNote || '');
                    setEditingNote(false);
                  }}
                  disabled={busyNote}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primarySmallButton, (!noteChanged || busyNote) && styles.disabled]}
                  onPress={saveNote}
                  disabled={!noteChanged || busyNote}
                  accessibilityRole="button"
                  accessibilityState={{ busy: busyNote, disabled: !noteChanged || busyNote }}
                  accessibilityLabel={t('specimen.saveObservation')}
                >
                  {busyNote && <ActivityIndicator size="small" color={colors.white} />}
                  <Text style={styles.primarySmallButtonText}>{t('specimen.saveObservation')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={entry.specimenNote ? styles.noteText : styles.emptyNote}>
                {entry.specimenNote || t('specimen.observationEmpty')}
              </Text>
              <View style={styles.noteActions}>
                {!!entry.specimenNote && (
                  <TouchableOpacity
                    style={[styles.removeNoteButton, busyNote && styles.disabled]}
                    onPress={() => persistNote('')}
                    disabled={busyNote}
                    accessibilityRole="button"
                    accessibilityState={{ busy: busyNote, disabled: busyNote }}
                    accessibilityLabel={t('specimen.removeObservation')}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={styles.removeNoteText}>{t('specimen.removeObservation')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.editNoteButton, busyNote && styles.disabled]}
                  onPress={() => setEditingNote(true)}
                  disabled={busyNote}
                  accessibilityRole="button"
                  accessibilityState={{ busy: busyNote, disabled: busyNote }}
                  accessibilityLabel={entry.specimenNote ? t('specimen.editObservation') : t('specimen.addObservation')}
                >
                  <Ionicons name="create-outline" size={17} color={colors.white} />
                  <Text style={styles.editNoteText}>
                    {entry.specimenNote ? t('specimen.editObservation') : t('specimen.addObservation')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {timeline.length > 0 && (
          <ZoneBand gutter={20} style={styles.timelineBand}>
            <SectionHeading>{t('specimen.timelineTitle')}</SectionHeading>
            <View style={styles.timelineCard}>
              <View style={styles.timelineLine} pointerEvents="none" />
              {timeline.map((item) => (
                <TimelineItem
                  key={item.key}
                  icon={item.icon}
                  color={item.color}
                  label={item.label}
                  date={formatDate(item.at, i18n.language, true)}
                />
              ))}
            </View>
          </ZoneBand>
        )}

        <ReminderManager entry={entry} accent={accent} t={t} i18n={i18n} />

        {!!advancedWorkspace.key && (
          <View style={[styles.guideCard, { borderColor: accent + '66' }]}>
            <View style={[styles.guideIcon, { backgroundColor: accent + '22' }]}>
              <Ionicons name={advancedWorkspace.icon} size={24} color={accent} />
            </View>
            <View style={styles.guideCopy}>
              <Text style={styles.guideTitle}>{advancedWorkspace.title}</Text>
              <Text style={styles.guideBody}>{advancedWorkspace.body}</Text>
            </View>
            <TouchableOpacity
              style={[styles.guideButton, { borderColor: accent }]}
              onPress={openAdvancedWorkspace}
              accessibilityRole="button"
              accessibilityLabel={advancedWorkspace.action}
            >
              <Text style={[styles.guideButtonText, { color: accent }]}>{advancedWorkspace.action}</Text>
              <Ionicons name="chevron-forward" size={16} color={accent} />
            </TouchableOpacity>
          </View>
        )}

        {!!meta?.detailRoute && (
          <View style={styles.guideCard}>
            <View style={[styles.guideIcon, { backgroundColor: accent + '22' }]}>
              <Ionicons name="book-outline" size={24} color={accent} />
            </View>
            <View style={styles.guideCopy}>
              <Text style={styles.guideTitle}>{t('specimen.guideTitle')}</Text>
              <Text style={styles.guideBody}>{t('specimen.guideBody')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.guideButton, { borderColor: accent }]}
              onPress={openGuide}
              accessibilityRole="button"
              accessibilityLabel={t('specimen.openGuide')}
            >
              <Text style={[styles.guideButtonText, { color: accent }]}>{t('specimen.openGuide')}</Text>
              <Ionicons name="chevron-forward" size={16} color={accent} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={profileModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeProfileModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.profileModal}
            contentContainerStyle={styles.profileModalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            accessibilityViewIsModal={true}
            onAccessibilityEscape={closeProfileModal}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">
                {t('specimen.personalizeTitle')}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeProfileModal}
                disabled={busyProfile}
                accessibilityRole="button"
                accessibilityState={{ disabled: busyProfile }}
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={21} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('collection.nicknameTitle')}</Text>
            <TextInput
              style={styles.input}
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              editable={!busyProfile}
              maxLength={40}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveProfile}
              placeholder={t('collection.nicknamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t('collection.nicknameTitle')}
            />

            <Text style={[styles.fieldLabel, styles.roomLabel]}>
              {t('collection.assignRoomTitle')}
            </Text>
            <View style={styles.roomOptions}>
              {ROOM_OPTIONS.map(([room, key]) => {
                const selected = roomDraft === room;
                return (
                  <TouchableOpacity
                    key={room || 'none'}
                    style={[
                      styles.roomChip,
                      selected && { borderColor: accent, backgroundColor: accent + '22' },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRoomDraft(room);
                    }}
                    disabled={busyProfile}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: busyProfile }}
                    accessibilityLabel={t(key)}
                  >
                    <Text style={[styles.roomChipText, selected && { color: accent }]}>
                      {t(key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.modalActionButton]}
                onPress={closeProfileModal}
                disabled={busyProfile}
                accessibilityRole="button"
                accessibilityState={{ disabled: busyProfile }}
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primarySmallButton, styles.modalActionButton, busyProfile && styles.disabled]}
                onPress={saveProfile}
                disabled={busyProfile}
                accessibilityRole="button"
                accessibilityState={{ busy: busyProfile, disabled: busyProfile }}
                accessibilityLabel={t('common.ok')}
              >
                {busyProfile && <ActivityIndicator size="small" color={colors.white} />}
                <Text style={styles.primarySmallButtonText}>{t('common.ok')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { ...type.screenTitle, textAlign: 'center' },
  emptyBody: { ...type.body, textAlign: 'center', marginTop: 8, maxWidth: 360 },
  primaryButton: {
    marginTop: 22,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  hero: {
    height: 204,
    alignSelf: 'stretch',
    marginHorizontal: -20,
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: colors.surfaceElevated,
  },
  heroPhoto: { ...StyleSheet.absoluteFillObject },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroTopRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  categoryBadge: {
    minHeight: 30,
    maxWidth: '44%',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.background + 'D9',
  },
  categoryBadgeText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  heroPersonalizeButton: {
    minHeight: control.minTouch,
    maxWidth: '54%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.white + '33',
    backgroundColor: colors.background + 'D9',
  },
  heroPersonalizeText: { color: colors.white, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  heroCopy: { paddingHorizontal: 18, paddingBottom: 15, paddingTop: 58 },
  name: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  realName: { fontSize: 14, lineHeight: 19, color: colors.text, marginTop: 2 },
  scientific: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', color: colors.textSecondary, marginTop: 1 },
  savedDate: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 5 },
  body: { ...type.body },
  bodyGap: { marginTop: 9 },
  foodSafety: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning + '66',
    backgroundColor: colors.warning + '12',
    marginTop: 13,
  },
  foodSafetyText: { ...type.body, flex: 1, color: colors.text },
  careBand: { marginTop: 0 },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    ...shadow,
  },
  todayIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  todayCopy: { flex: 1 },
  todayStatus: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: colors.text },
  careButton: {
    minHeight: control.minTouch,
    maxWidth: 145,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  careButtonText: { color: colors.white, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow,
  },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginBottom: 7 },
  input: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 14,
  },
  roomLabel: { marginTop: 15 },
  roomOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomChip: {
    minHeight: control.minTouch,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  roomChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  noteInput: { minHeight: 126, paddingTop: 12, paddingBottom: 12 },
  characterCount: { ...type.caption, textAlign: 'right', marginTop: 6 },
  noteText: { ...type.body, color: colors.text, minHeight: 42 },
  emptyNote: { ...type.body, color: colors.textMuted, minHeight: 42 },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 13 },
  secondaryButton: {
    minHeight: control.minTouch,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  primarySmallButton: {
    minHeight: control.minTouch,
    borderRadius: 13,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.accent,
  },
  primarySmallButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  editNoteButton: {
    minHeight: control.minTouch,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.accent,
  },
  editNoteText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  removeNoteButton: {
    minHeight: control.minTouch,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeNoteText: { color: colors.error, fontSize: 12.5, fontWeight: '700' },
  timelineBand: { marginTop: 22 },
  timelineCard: {
    position: 'relative',
    backgroundColor: colors.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 15,
    paddingVertical: 5,
    overflow: 'hidden',
    ...shadow,
  },
  timelineLine: {
    position: 'absolute',
    left: 32,
    top: 27,
    bottom: 27,
    width: 1,
    backgroundColor: colors.border,
  },
  timelineItem: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 },
  timelineDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineCopy: { flex: 1, paddingVertical: 10 },
  timelineLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  timelineDate: { ...type.caption, marginTop: 3 },
  guideCard: {
    marginTop: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow,
  },
  guideIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  guideCopy: { flex: 1, minWidth: 180 },
  guideTitle: { ...type.cardTitle },
  guideBody: { ...type.body, marginTop: 3 },
  guideButton: {
    minHeight: control.minTouch,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  guideButtonText: { fontSize: 12.5, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  profileModal: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  profileModalContent: { padding: 20 },
  modalHeader: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: { ...type.sectionTitle, flex: 1, marginTop: 0, marginBottom: 0 },
  modalCloseButton: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalActionButton: { flex: 1 },
  disabled: { opacity: 0.55 },
});
