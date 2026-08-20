import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
import { isInReaderLanguage } from '../components/localisedOverview';
import { getCuratedBird } from '../components/curatedBirds';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import Pronounce from '../components/Pronounce';
import TopBar, { TopBarIcon } from '../components/TopBar';

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

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // `plant.name` is Perch's raw label, which is the binomial - the same
    // string as plant.scientific. Sharing the raw object printed it twice and
    // never the common name the screen is showing.
    shareEntity({ ...plant, name: displayName }, groupLabel);
  };

  // Hub do resultado (video do concorrente): as leituras curadas viram
  // cards-porta pro manual (CareTopics); o overview continua inline completo.
  // Sem material curado, nada renderiza (regra de fallback do hub).
  const TOPICS = [
    { key: 'overview', label: t('common.overview'), icon: 'document-text-outline', color: meta.accent, text: overview },
    { key: 'habitat', label: t('fieldGuide.habitat'), icon: 'earth-outline', color: colors.info, text: curated?.habitat },
    { key: 'curiosity', label: t('fieldGuide.curiosity'), icon: 'sparkles-outline', color: colors.warning, text: curated?.curiosity },
  ].filter((tp) => !!tp.text);

  const openTopic = (key) =>
    navigation.navigate('CareTopics', {
      title: displayName,
      accent: meta.accent,
      category: 'sound',
      topics: TOPICS,
      initialKey: key,
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the container keeps its own backgroundColor
          underneath - the scene paints over it, never replaces it. */}
      <NatureScene accent={meta.accent} />

      {/* Shared TopBar: same icons, labels and handlers as the hand-rolled bar
          it replaces. The save button stays a raw TouchableOpacity because it
          is the one top-bar button in the app with a disabled state, and
          TopBarIcon does not forward `disabled`/`accessibilityState` - going
          through it would silently drop the a11y disabled announcement. */}
      <TopBar
        title={t('detail.profileTitle', { category: groupLabel })}
        onBack={() => navigation.goBack()}
        right={
          <>
            <TopBarIcon onPress={handleShare} label={t('common.shareThisResult')}>
              <Ionicons name="share-social-outline" size={20} color={colors.text} />
            </TopBarIcon>
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
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* The species photo IS the hero here - there is no user photo to show. */}
        {photo ? (
          /* Press-scale by OUTER wrapper: the Touchable stays byte for byte. */
          <PressScale>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => photo.sourceUrl && Linking.openURL(photo.sourceUrl)}
              accessibilityRole="imagebutton"
              accessibilityLabel={plant.name}
            >
              <Image source={{ uri: photo.url }} style={styles.heroPhoto} resizeMode="cover" />
              <Text style={styles.photoCredit}>{t('fieldGuide.photoCredit')}</Text>
            </TouchableOpacity>
          </PressScale>
        ) : (
          <View style={[styles.heroFallback, { backgroundColor: meta.accent + '22' }]}>
            <CategoryIcon name="mic" size={38} color={meta.accent} />
          </View>
        )}

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {/* Hub do resultado (video do concorrente): falante ao lado do
                cientifico + nomes populares como linha discreta. */}
            {!!plant.scientific && (
              <View style={styles.sciRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {!!plant.commonNames && (
              <Text style={styles.commonNames}>
                {t('detail.commonNames')}: {Array.isArray(plant.commonNames) ? plant.commonNames.join(', ') : plant.commonNames}
              </Text>
            )}
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

        {/* Fatos rapidos (hub do resultado, video do concorrente): grade de
            cards compactos que navegam pro manual. Sound so tem material real
            pro habitat curado - sem material, nao força. */}
        {!!curated?.habitat && (
          <View style={styles.factsWrap}>
            <Text style={styles.factsTitle}>{t('detail.quickFacts')}</Text>
            <View style={styles.factsGrid}>
              <TouchableOpacity
                style={styles.factCard}
                onPress={() => openTopic('habitat')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('fieldGuide.habitat')}
              >
                <View style={[styles.factIcon, { backgroundColor: colors.info + '22' }]}>
                  <Ionicons name="earth-outline" size={15} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.factLabel}>{t('fieldGuide.habitat')}</Text>
                  <Text style={styles.factValue} numberOfLines={2}>
                    {curated.habitat.split('\n')[0]}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Zona de cor: the reading about the species - overview plus the
            curated habitat/curiosity when we have them - lives in one
            full-bleed band a shade above the page. ZoneBand is a pure wrapper
            (order untouched) and never empty: the overview card is
            unconditional. */}
        <ZoneBand gutter={20}>
          <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
            {/* Wikipedia answers in the reader's language when it can; when it
                falls back to English this offers the button rather than leaving
                them with a paragraph they cannot read. */}
            <TranslatableText
              text={overview || t('sound.noContentBody')}
              style={styles.body}
              /* Only when the text is Wikipedia's AND that article came back in
                 English. Curated text is written in the reader language by
                 definition, and a Portuguese extract needs no button. */
              showWhenEnglish={
                !curated?.overview &&
                !!info?.extract &&
                !isInReaderLanguage(info.extract, i18n.language)
              }
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

          {/* Hub do resultado (video do concorrente): habitat/curiosidade
              curados deixam de ser prosa empilhada e viram cards-porta que
              abrem o manual da especie na aba certa. O overview acima continua
              inline completo. */}
          {TOPICS.filter((tp) => tp.key !== 'overview').map((tp) => (
            <TouchableOpacity
              key={tp.key}
              style={styles.doorCard}
              onPress={() => openTopic(tp.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={tp.label}
            >
              <View style={[styles.doorIcon, { backgroundColor: tp.color + '22' }]}>
                <Ionicons name={tp.icon} size={16} color={tp.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doorLabel}>{tp.label}</Text>
                <Text style={styles.doorPreview} numberOfLines={1}>
                  {tp.text}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ZoneBand>

        {/* Gancho da especialista (hub do resultado): a pergunta ja sai com o
            contexto da especie, do jeito que BotanistScreen.route.params.context
            espera. displayName em vez de plant.name porque no sound o name cru
            e o proprio binomio (viria duplicado). */}
        <TouchableOpacity
          style={styles.specialistCta}
          onPress={() =>
            navigation.navigate('Botanist', {
              context: displayName + ' (' + (plant.scientific || '') + ')',
            })
          }
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('detail.askSpecialistCta')}
        >
          <Ionicons name="sparkles" size={16} color={meta.accent} />
          <Text style={styles.specialistCtaText}>{t('detail.askSpecialistCta')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Press-scale by OUTER wrapper: the Touchable stays byte for byte
            (a11y, disabled state, handlers) - on RN-web an Animated.Value on
            the Touchable's own style would not drive the transform. */}
        <PressScale>
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
        </PressScale>

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Hub do resultado (video do concorrente): feedback de utilidade no
            fim do scroll. */}
        <HelpfulRow category="sound" context="result" />
      </ScrollView>

      {/* Hub do resultado (video do concorrente): a barra fixa Nova | Compartilhar
          | Salvar substitui o SaveFab; styles.scroll carries paddingBottom >= 120
          so the bar never covers the last row. While the species lookup is still
          settling the save tap is a no-op, for the same reason the other save
          buttons are disabled then: saving early writes a permanently bare entry
          (see lookupDone). The old SaveFab had no disabled state so hiding WAS
          the guard; the bar guards the handler instead. "Nova" so faz sentido
          vindo da identificacao. O bookmark do TopBar permanece. */}
      <ResultActionBar
        onNew={fromIdentify ? () => navigation.goBack() : null}
        onShare={handleShare}
        onSave={() => {
          if (saveDisabled) return;
          toggleSave();
        }}
        saved={saved}
        accent={meta.accent}
      />

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
  // Kept (not moved into TopBar): the raw disabled-capable save button in the
  // top bar's `right` slot still needs the 40x40 r12 surface look.
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // paddingBottom >= 120: room for the fixed ResultActionBar (doutrina: a bar
  // that hides the last row is the viewport bug in miniature).
  scroll: { padding: 20, paddingBottom: 120 },
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
  sciRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
  commonNames: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  taxonLine: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  // Fatos rapidos + cards-porta do hub do resultado (video do concorrente).
  factsWrap: { marginBottom: 16 },
  factsTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  factIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  factValue: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  doorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  doorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  doorPreview: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: 10,
  },
  specialistCtaText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.textSecondary },
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
