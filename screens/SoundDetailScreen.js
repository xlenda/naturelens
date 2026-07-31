import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import SectionCard from '../components/SectionCard';
import IdentificationExtras from '../components/IdentificationExtras';
import CategoryIcon from '../components/CategoryIcon';
import AlertModal from '../components/AlertModal';
import InstallNudgeCard from '../components/InstallNudgeCard';
import { useAppAlert } from '../components/useAppAlert';
import { colors } from '../components/theme';
import { CATEGORIES } from '../components/categories';
import { getCollection, saveToCollection, removeFromCollection } from '../components/storage';
import { shareEntity } from '../components/share';
import { getSpeciesInfo } from '../components/speciesPhoto';
import TranslatableText from '../components/TranslatableText';
import { getCuratedBird } from '../components/curatedBirds';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';

// Result of a SOUND identification.
//
// There is no user photo here - the input was audio - so the species photograph
// is not a nice extra, it is the only image on the screen and the main way a
// person confirms the answer. It comes from Wikipedia keyed on the scientific
// name (see components/speciesPhoto.js).
//
// Perch also classifies frogs, crickets, grasshoppers and mammals, so the label
// under the name reflects the group it actually returned instead of always
// claiming "bird".

const GROUP_LABEL_KEY = {
  bird: 'categories.bird.label',
  amphibian: 'sound.groupAmphibian',
  frog: 'sound.groupAmphibian',
  insect: 'categories.insect.label',
  mammal: 'sound.groupMammal',
};

export default function SoundDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.sound;
  const { t, i18n } = useTranslation();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const [info, setInfo] = useState(null);
  const [curated, setCurated] = useState(null);
  // Whether the Wikipedia lookup has finished, successfully or not.
  //
  // This screen has no user photo, so the species name, the overview and the
  // thumbnail ALL come from that one request. Saving before it settles wrote an
  // entry with the bare binomial as its name, no description and no image - and
  // nothing ever repaired it, so the find sat in the collection permanently worse
  // than the one next to it. The save button waits instead.
  const [lookupDone, setLookupDone] = useState(false);

  useEffect(() => {
    let alive = true;
    // The scientific name is what Wikipedia matches reliably; the common name
    // alone often lands on a disambiguation page or nothing at all.
    const lookup = plant.scientific || plant.name;
    setLookupDone(false);
    getSpeciesInfo(lookup, i18n.language)
      .then((p) => {
        if (alive) setInfo(p);
      })
      // Settled either way. A species Wikipedia simply does not have must not
      // leave the save button disabled forever - the entry is just saved without
      // the extras, which is the honest outcome rather than a dead button.
      .finally(() => {
        if (alive) setLookupDone(true);
      });
    // If this species happens to be one of the curated birds, reuse that text
    // rather than showing an empty overview - the content already exists.
    getCuratedBird(i18n.language, plant.name).then((c) => {
      if (alive) setCurated(c);
    });
    return () => {
      alive = false;
    };
  }, [i18n.language, plant.name, plant.scientific]);

  useEffect(() => {
    (async () => {
      const list = await getCollection();
      const found = list.find((p) => p.savedId === plant.savedId || p.id === plant.id);
      if (found) {
        setSaved(true);
        setSavedEntryId(found.savedId);
      }
    })();
  }, []);

  const toggleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (saved && savedEntryId) {
      const result = await removeFromCollection(savedEntryId);
      if (result) {
        setSaved(false);
        setSavedEntryId(null);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    } else {
      // Saving the species photo as the entry's image is what makes this find
      // look like every other one in the Collection - without it a sound find
      // would be the only entry with a blank thumbnail. The resolved common name
      // and overview are saved too, so the Collection reads "Rufous-bellied
      // Thrush" rather than "Turdus rufiventris" and reopens without a network
      // call.
      const entry = await saveToCollection({
        ...plant,
        name: displayName,
        overview: overview || plant.overview || null,
        photoUri: photo?.url || null,
      });
      if (entry) {
        recordMissionEvent('save').then((done) => {
          if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
        });
        setSaved(true);
        setSavedEntryId(entry.savedId);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    }
  };

  const groupKey = plant.group ? GROUP_LABEL_KEY[String(plant.group).toLowerCase()] : null;
  const groupLabel = groupKey ? t(groupKey) : t('categories.sound.label');

  // Saving is held only for the sub-second it takes the species lookup to settle,
  // and only when saving (removing is always allowed). See lookupDone.
  const saveDisabled = !saved && !lookupDone;

  const photo = info?.url ? info : null;

  // Perch's label list carries no common names, so `plant.name` arrives as the
  // binomial. Wikipedia's page title is the common name in the user's own
  // language, which is a far better headline - and it is the same request that
  // fetched the photo, so it costs nothing extra.
  const displayName =
    info?.title && info.title !== plant.scientific ? info.title : plant.name;

  // Overview, best source first: text we wrote ourselves, then Wikipedia's
  // opening paragraph in the user's language, then an honest "nothing yet".
  const overview = curated?.overview || info?.extract || plant.overview || null;

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
        <Text style={styles.topTitle} accessibilityRole="header">
          {t('detail.profileTitle', { category: groupLabel })}
        </Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              shareEntity(plant, groupLabel);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.shareThisResult')}
          >
            <Ionicons name="share-social-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, saveDisabled && styles.disabled]}
            onPress={toggleSave}
            disabled={saveDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: saveDisabled }}
            accessibilityLabel={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={saved ? meta.accent : colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* The species photo IS the hero here - there is no user photo to show. */}
        {photo ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => photo.sourceUrl && Linking.openURL(photo.sourceUrl)}
            accessibilityRole="imagebutton"
            accessibilityLabel={plant.name}
          >
            <Image source={{ uri: photo.url }} style={styles.heroPhoto} resizeMode="cover" />
            <Text style={styles.photoCredit}>{t('fieldGuide.photoCredit')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.heroFallback, { backgroundColor: meta.accent + '22' }]}>
            <CategoryIcon name="mic" size={38} color={meta.accent} />
          </View>
        )}

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {!!plant.scientific && <Text style={styles.scientific}>{plant.scientific}</Text>}
            {!!info?.description && <Text style={styles.taxonLine}>{info.description}</Text>}
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>{t('common.confidence')}</Text>
            <Text style={styles.confidenceValue}>{plant.confidence}%</Text>
          </View>
        </View>

        <View style={[styles.typePill, { backgroundColor: meta.accent + '22' }]}>
          <Ionicons name="mic" size={13} color={meta.accent} />
          <Text style={[styles.typePillText, { color: meta.accent }]}>
            {t('sound.identifiedBySound', { group: groupLabel.toLowerCase() })}
          </Text>
        </View>

        <IdentificationExtras entity={plant} accent={meta.accent} />

        <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
          {/* Wikipedia answers in the reader's language when it can; when it
              falls back to English this offers the button rather than leaving
              them with a paragraph they cannot read. */}
          <TranslatableText
            text={overview || t('sound.noContentBody')}
            style={styles.body}
            showWhenEnglish={!curated?.overview && !!info?.extract}
          />
          {/* Credit the source when the words are not ours. */}
          {!curated?.overview && !!info?.extract && (
            <TouchableOpacity
              onPress={() => info.sourceUrl && Linking.openURL(info.sourceUrl)}
              accessibilityRole="link"
            >
              <Text style={styles.sourceLink}>{t('fieldGuide.textCredit')}</Text>
            </TouchableOpacity>
          )}
        </SectionCard>

        {/* Curated habitat/curiosity when this species is one we wrote about. */}
        {!!curated?.habitat && (
          <SectionCard icon="earth-outline" title={t('fieldGuide.habitat')} color={colors.info}>
            <Text style={styles.body}>{curated.habitat}</Text>
          </SectionCard>
        )}
        {!!curated?.curiosity && (
          <SectionCard icon="sparkles-outline" title={t('fieldGuide.curiosity')} color={colors.warning}>
            <Text style={styles.body}>{curated.curiosity}</Text>
          </SectionCard>
        )}

        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: meta.accent },
            saved && { backgroundColor: meta.accentDark },
            saveDisabled && styles.disabled,
          ]}
          onPress={toggleSave}
          disabled={saveDisabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled }}
          accessibilityLabel={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
        >
          <Ionicons name={saved ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={colors.white} />
          <Text style={styles.saveBtnText}>{saved ? t('common.saved') : t('common.save')}</Text>
        </TouchableOpacity>

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />
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
  topBarActions: { flexDirection: 'row', gap: 8 },
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
  heroPhoto: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
  },
  photoCredit: { color: colors.textMuted, fontSize: 10.5, textAlign: 'center', marginTop: 5 },
  heroFallback: {
    width: '100%',
    height: 160,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
  taxonLine: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  sourceLink: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 10,
    textDecorationLine: 'underline',
  },
  confidenceBadge: {
    backgroundColor: colors.accentDark + '33',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  confidenceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  confidenceValue: { fontSize: 18, color: colors.accentLight, fontWeight: '800' },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    marginBottom: 20,
  },
  typePillText: { fontSize: 12.5, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 22 },
  saveBtn: {
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 8,
  },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.45 },
});
