import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import SectionCard from '../components/SectionCard';
import IdentificationExtras from '../components/IdentificationExtras';
import DidacticFieldGuide from '../components/DidacticFieldGuide';
import DiscoveryReceiptCard from '../components/DiscoveryReceiptCard';
import { enrichmentTaxon } from '../components/taxonIdentity';
import CategoryIcon from '../components/CategoryIcon';
import AlertModal from '../components/AlertModal';
import InstallNudgeCard from '../components/InstallNudgeCard';
import { useAppAlert } from '../components/useAppAlert';
import { colors } from '../components/theme';
import { CATEGORIES } from '../components/categories';
import { getSpeciesGroup } from '../components/speciesGroup';
import {
  getCollection,
  saveToCollection,
  removeFromCollection,
  updateCollectionEntry,
} from '../components/storage';
import { shareEntity } from '../components/share';
import { getSpeciesInfo } from '../components/speciesPhoto';
import TranslatableText from '../components/TranslatableText';
import { isInReaderLanguage } from '../components/localisedOverview';
import { getCuratedDetail } from '../components/curatedDetails';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { trackResultSaved } from '../components/tracking';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import CommunityInviteCard from '../components/CommunityInviteCard';
import Pronounce from '../components/Pronounce';
import ExpandableText from '../components/ExpandableText';
import TopBar, { TopBarIcon } from '../components/TopBar';
import DistributionMap from '../components/DistributionMap';
import SeasonChart from '../components/SeasonChart';
import AudioEvidenceCard from '../components/AudioEvidenceCard';
import QuickFactGrid from '../components/QuickFactGrid';
import TopicNavigatorCard from '../components/TopicNavigatorCard';
import { createSpeciesTopicResourceKey, usePublishSpeciesTopics } from '../components/speciesTopicResource';
import { buildSoundTopics } from '../components/mushroomSoundTopics';
import { API_BASE } from '../components/apiBase';
import { getSpeciesDossier } from '../components/speciesDossier';
import {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} from '../components/sourceGroundedTopics';
import LensRevealCard from '../components/LensRevealCard';
import NextBestCaptureCard from '../components/NextBestCaptureCard';
import { retakeResult } from '../components/resultRetake';
import { RESULT_DEPTHS, ResultDepthLayer } from '../components/ResultDepthSwitcher';
import {
  observationSubjectKey,
  moveObservationSubject,
} from '../components/observationStorage';

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

// A saved sound result deliberately does not persist microphone samples or its
// waveform. Treating the generic explanatory sentence as evidence made those
// reopened results claim that a recording was still attached. Keep this check
// aligned with AudioEvidenceCard: either the complete, valid evidence exists or
// every recording-specific block stays absent.
function hasUsableAudioEvidence(waveform, durationSeconds) {
  const peaks = Array.isArray(waveform) ? waveform.map(Number) : [];
  const duration = Number(durationSeconds);
  return (
    peaks.length >= 32 &&
    peaks.length <= 48 &&
    peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1) &&
    Number.isFinite(duration) &&
    duration > 0
  );
}

export default function SoundDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify, waveform, durationSeconds, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.sound;
  const { t, i18n } = useTranslation();
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  const enrichmentScientific = enrichmentTaxon(plant.identityV1, {
    scientificName: plant.scientific,
  })?.canonicalName || null;
  const lookupKey = `${i18n.language}|${enrichmentScientific || ''}`;

  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const unsavedObservationKey = observationSubjectKey({ ...plant, savedId: null }, null);
  const observationKey = savedEntryId
    ? observationSubjectKey(plant, savedEntryId)
    : unsavedObservationKey;
  const detachedObservationKey = React.useRef(null);
  const [infoState, setInfoState] = useState({ key: null, value: null });
  const [curatedState, setCuratedState] = useState({ key: null, value: null });
  const [dossierState, setDossierState] = useState({ key: null, value: null });
  const [lookupSettled, setLookupDone] = useState(false);
  // A chave faz o dado antigo sumir no mesmo render em que idioma ou identidade
  // mudam; limpar apenas dentro do effect ainda deixaria uma foto errada piscar.
  const info = infoState.key === lookupKey ? infoState.value : null;
  const curated = curatedState.key === lookupKey ? curatedState.value : null;
  const speciesDossier = dossierState.key === lookupKey ? dossierState.value : null;
  const lookupDone = !enrichmentScientific || (
    lookupSettled && infoState.key === lookupKey
  );
  const topicsLoading = Boolean(enrichmentScientific) && (
    infoState.key !== lookupKey || curatedState.key !== lookupKey || dossierState.key !== lookupKey
  );
  // Som sempre mostra toda evidencia verdadeira disponivel. O modo escolhido
  // no onboarding nao pode esconder mapa, sazonalidade ou leitura tecnica.
  const resultDepth = RESULT_DEPTHS.EXPERT;

  useEffect(() => {
    let alive = true;
    // The scientific name is what Wikipedia matches reliably; the common name
    // alone often lands on a disambiguation page or nothing at all.
    const lookup = enrichmentScientific;
    setLookupDone(false);
    if (!lookup) {
      setLookupDone(true);
      return () => { alive = false; };
    }
    getSpeciesInfo(lookup, i18n.language)
      .then((value) => {
        if (alive) setInfoState({ key: lookupKey, value });
      })
      .finally(() => {
        if (alive) setLookupDone(true);
      });
    // O catalogo Heard, not seen e indexado pelo binomio do Perch. A tela
    // antiga consultava birdDetails pelo nome popular e nunca encontrava as
    // dez especies de soundDetails que ja estavam traduzidas.
    getCuratedDetail(i18n.language, 'sound', lookup).then(
      (value) => {
        if (alive) setCuratedState({ key: lookupKey, value });
      },
      () => {
        if (alive) setCuratedState({ key: lookupKey, value: null });
      }
    );
    return () => {
      alive = false;
    };
  }, [lookupKey, i18n.language, enrichmentScientific]);

  useEffect(() => {
    let alive = true;
    // A classificacao candidata nunca consulta prosa de especie. O endpoint e
    // chamado apenas depois do mesmo portao exato usado por mapa e curadoria.
    if (!enrichmentScientific) return () => { alive = false; };
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'sound',
      scientific: enrichmentScientific,
      language: i18n.language,
    }).then((value) => {
      if (alive) setDossierState({ key: lookupKey, value });
    });
    return () => { alive = false; };
  }, [lookupKey, i18n.language, enrichmentScientific]);

  useEffect(() => {
    (async () => {
      if (!plant.savedId) return;
      const list = await getCollection();
      const found = list.find((p) => p.savedId === plant.savedId);
      if (found) {
        setSaved(true);
        setSavedEntryId(found.savedId);
      } else {
        setSaved(false);
        setSavedEntryId(null);
      }
    })();
  }, []);

  const toggleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (saved && savedEntryId) {
      const previousObservationKey = observationKey;
      const result = await removeFromCollection(savedEntryId);
      if (result) {
        if (previousObservationKey && unsavedObservationKey) {
          await moveObservationSubject(previousObservationKey, unsavedObservationKey);
          detachedObservationKey.current = null;
        } else if (previousObservationKey) {
          detachedObservationKey.current = previousObservationKey;
        }
        setSaved(false);
        setSavedEntryId(null);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    } else {
      const previousObservationKey = observationKey || detachedObservationKey.current;
      // Wikipedia title/overview are language-sensitive presentation. Persisting
      // either field freezes the language used on the day of the scan and also
      // makes a reopened result look vendor-sourced. Strip legacy copies and
      // reload them for the current reader language instead.
      const stablePlant = { ...plant };
      delete stablePlant.displayName;
      delete stablePlant.overview;
      const entry = await saveToCollection({
        ...stablePlant,
        // A imagem veio da enciclopedia, nao do microfone da pessoa. Grava-la
        // como photoUri fazia o diario chamar uma referencia publica de foto
        // pessoal e ela ainda sumia no sync, que remove fotos locais de proposito.
        referencePhoto: photo?.url || plant.referencePhoto || null,
      });
      if (entry) {
        const savedObservationKey = observationSubjectKey(entry, entry.savedId);
        if (previousObservationKey && savedObservationKey) {
          await moveObservationSubject(previousObservationKey, savedObservationKey);
          detachedObservationKey.current = null;
        }
        trackResultSaved({ category: 'sound' });
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

  const openObservationWorkspace = () => {
    if (!observationKey) return;
    navigation.navigate('ObservationWorkspace', {
      entity: plant,
      savedId: savedEntryId || null,
    });
  };

  const groupLabelKey = plant.group ? GROUP_LABEL_KEY[String(plant.group).toLowerCase()] : null;
  const groupLabel = groupLabelKey ? t(groupLabelKey) : t('categories.sound.label');

  // Se a escrita automatica falhar, o botao manual espera apenas a consulta de
  // especie terminar. Remover uma entrada confirmada continua sempre liberado.
  const saveDisabled = !saved && !lookupDone;

  const photo = info?.url ? info : null;

  // Perch's label list carries no common names, so `plant.name` arrives as the
  // binomial. Wikipedia's page title is the common name in the user's own
  // language, which is a far better headline - and it is the same request that
  // fetched the photo, so it costs nothing extra.
  const displayName =
    info?.title && info.title !== plant.scientific ? info.title : plant.name;

  // O texto identificado pelo fornecedor sempre lidera. Curadoria exata e
  // Wikipedia apenas completam o vazio deixado pelo Perch atual.
  const overview = curated?.overview || info?.extract || null;
  const overviewIsWikipedia =
    !curated?.overview && !!info?.extract && overview === info.extract;

  useEffect(() => {
    if (!savedEntryId) return;
    const patch = {};
    const referencePhoto = photo?.url || plant.referencePhoto || null;
    if (referencePhoto && referencePhoto !== plant.referencePhoto) {
      patch.referencePhoto = referencePhoto;
    }
    if (!Object.keys(patch).length) return;
    updateCollectionEntry(savedEntryId, patch).catch(() => undefined);
  }, [
    photo?.url,
    plant.referencePhoto,
    savedEntryId,
  ]);

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
  const hasAudioEvidence = hasUsableAudioEvidence(waveform, durationSeconds);
  const evidenceLines = hasAudioEvidence
    ? [
        t('sound.audioEvidenceBody'),
        t('sound.audioEvidenceDuration', { seconds: Math.round(Number(durationSeconds)) }),
        Number.isFinite(plant.confidence) ? `${t('common.confidence')}: ${plant.confidence}%` : null,
      ].filter(Boolean)
    : [];
  const readerDescription = info?.description && isInReaderLanguage(info.description, i18n.language)
    ? info.description
    : null;
  const baseTopics = buildSoundTopics({
    labels: {
      evidence: t('sound.audioEvidenceTitle'),
      overview: t('common.overview'),
      habitat: t('fieldGuide.habitat'),
      curiosity: t('fieldGuide.curiosity'),
      details: t('common.details'),
    },
    presentation: {
      evidence: { icon: 'pulse-outline', color: meta.accent },
      overview: { icon: 'document-text-outline', color: meta.accent },
      habitat: { icon: 'earth-outline', color: colors.info },
      curiosity: { icon: 'sparkles-outline', color: colors.warning },
      details: { icon: 'finger-print-outline', color: colors.purple },
    },
    evidenceLines,
    overview,
    habitat: curated?.habitat,
    curiosity: curated?.curiosity,
    detailRows: [
      { label: t('common.identified'), value: enrichmentScientific },
      { label: t('categories.sound.label'), value: groupLabelKey ? groupLabel : null },
      { label: t('detail.commonNames'), value: plant.commonNames },
      { label: t('common.technicalDescription'), value: readerDescription },
    ],
  });
  const sourceTopics = buildSourceGroundedTopics({ dossier: speciesDossier });
  const topics = mergeSourceGroundedTopics(baseTopics, sourceTopics);
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'sound',
    language: i18n.language,
    routeKey: route.key,
    // Audio labels can be common names. Never let one become the identity used
    // to bind asynchronously enriched species topics.
    identity: plant.savedId || enrichmentScientific || null,
  });
  usePublishSpeciesTopics(topicResourceKey, topics, topicsLoading);

  const quickFacts = [
    hasAudioEvidence && {
      key: 'evidence',
      icon: 'pulse-outline',
      color: meta.accent,
      label: t('sound.audioEvidenceTitle'),
      value: t('sound.audioEvidenceDuration', { seconds: Math.round(Number(durationSeconds)) }),
    },
  ].filter(Boolean);

  // Evidence has its own card and must not keep an otherwise empty reading band
  // alive. This list contains only doors that actually render inside ZoneBand.
  const readingTopics = topics.filter((topic) => topic.key !== 'evidence');

  const openTopic = (key) =>
    navigation.navigate('CareTopics', { groupKey: getSpeciesGroup(plant),
      title: displayName,
      accent: meta.accent,
      category: 'sound',
      topics,
      topicsLoading,
      topicResourceKey,
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
        <AudioEvidenceCard
          waveform={waveform}
          durationSeconds={durationSeconds}
          accent={meta.accent}
        />

        {/* The species photo IS the hero here - there is no user photo to show. */}
        {photo ? (
          /* Press-scale by OUTER wrapper: the Touchable stays byte for byte. */
          <PressScale>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => (photo.imageSourceUrl || photo.sourceUrl) && Linking.openURL(photo.imageSourceUrl || photo.sourceUrl)}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('detail.referencePhotoAlt', { name: displayName })}
            >
              <Image source={{ uri: photo.url }} style={styles.heroPhoto} resizeMode="cover" />
              <View style={styles.referenceBadge} pointerEvents="none">
                <Ionicons name="images-outline" size={13} color={colors.white} />
                <Text style={styles.referenceBadgeText}>{t('detail.referencePhoto')}</Text>
              </View>
              <Text style={styles.photoCredit}>
                {[photo.imageCreator, photo.imageLicense].filter(Boolean).join(' · ') ||
                  t('fieldGuide.photoCredit')}
              </Text>
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
            {!!info?.description && isInReaderLanguage(info.description, i18n.language) && (
              <Text style={styles.taxonLine}>{info.description}</Text>
            )}
          </View>
          {Number.isFinite(plant.confidence) && (
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceLabel}>{t('common.confidence')}</Text>
              <Text style={styles.confidenceValue}>{plant.confidence}%</Text>
            </View>
          )}
        </View>

        <View style={[styles.typePill, { backgroundColor: meta.accent + '22' }]}>
          <Ionicons name="mic" size={13} color={meta.accent} />
          <Text style={[styles.typePillText, { color: meta.accent }]}>
            {t('sound.identifiedBySound', { group: groupLabel.toLowerCase() })}
          </Text>
        </View>

        <LensRevealCard
          confidence={plant.confidence}
          summary={overview}
          accent={meta.accent}
        />

        <TopicNavigatorCard
          topics={topics}
          accent={meta.accent}
          onOpen={openTopic}
          loading={topicsLoading}
        />

        <NextBestCaptureCard
          category="sound"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'sound', fromIdentify })}
        />

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <IdentificationExtras entity={plant} identityV1={plant.identityV1} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.ESSENTIAL}>
          <DiscoveryReceiptCard
            outcome={scanOutcome}
            request={scanOutcomeRequest}
            accent={meta.accent}
            automaticSaveConfirmed={fromIdentify === true && !!plant.savedId}
          />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <DidacticFieldGuide category="sound" entity={plant} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.ESSENTIAL}>
          {observationKey ? (
            <TouchableOpacity
              style={[styles.observationCard, { borderColor: meta.accent + '66' }]}
              onPress={openObservationWorkspace}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('observationWorkspace.openAction')}
            >
              <View style={[styles.observationIcon, { backgroundColor: meta.accent + '20' }]}>
                <Ionicons name="journal-outline" size={24} color={meta.accent} />
              </View>
              <View style={styles.observationCopy}>
                <Text style={styles.observationTitle}>{t('observationWorkspace.openTitle')}</Text>
                <Text style={styles.observationBody}>{t('observationWorkspace.openBody')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={meta.accent} />
            </TouchableOpacity>
          ) : null}
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.EXPERT}>

        <QuickFactGrid
          accent={meta.accent}
          facts={quickFacts.map((fact) => ({ ...fact, onPress: () => openTopic(fact.key) }))}
        />

        {/* The reading band exists only when real prose exists. Missing
            overview, habitat and curiosity leave no placeholder or empty band. */}
        {readingTopics.length > 0 && (
          <ZoneBand gutter={20}>
            {!!overview && (
              <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
                {/* Wikipedia answers in the reader's language when it can; when it
                    falls back to English this offers the button rather than leaving
                    them with a paragraph they cannot read. */}
                <TranslatableText
                  text={overview}
                  style={styles.body}
                  /* Only when the text is Wikipedia's AND that article came back in
                     English. Curated text is written in the reader language by
                     definition, and a Portuguese extract needs no button. */
                  showWhenEnglish={
                    overviewIsWikipedia &&
                    !isInReaderLanguage(info.extract, i18n.language)
                  }
                />
                {/* Credit the source when the words are not ours. */}
                {overviewIsWikipedia && (
                  <TouchableOpacity
                    onPress={() => info.sourceUrl && Linking.openURL(info.sourceUrl)}
                    accessibilityRole="link"
                  >
                    <Text style={styles.sourceLink}>{t('fieldGuide.textCredit')}</Text>
                  </TouchableOpacity>
                )}
              </SectionCard>
            )}

            {/* Tela principal rica (video do concorrente, 20/08): habitat e
                curiosidade curados voltam a ser TEXTO aqui - colapsados na
                primeira frase - em vez de uma linha truncada que so fazia
                sentido depois de navegar. O cabecalho continua sendo a porta pro
                manual, que acrescenta dica, checklist e o material do grupo. O
                overview acima segue inline e completo. Sem material curado,
                nada renderiza. */}
            {readingTopics.filter((tp) => tp.key !== 'overview').map((tp) => (
              <View key={tp.key} style={styles.doorCard}>
                <TouchableOpacity
                  style={styles.doorHeader}
                  onPress={() => openTopic(tp.key)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={tp.label}
                >
                  <View style={[styles.doorIcon, { backgroundColor: tp.color + '22' }]}>
                    <Ionicons name={tp.icon} size={16} color={tp.color} />
                  </View>
                  <Text style={styles.doorLabel}>{tp.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <ExpandableText text={tp.text} textStyle={styles.body} accent={tp.color} />
              </View>
            ))}
          </ZoneBand>
        )}

        {/* Sao registros reais da especie, nao inferencia sobre a gravacao.
            Ambos somem sem binomio, sem rede ou sem amostra suficiente. */}
        <DistributionMap scientific={plant.scientific} identityV1={plant.identityV1} accent={meta.accent} />
        <SeasonChart scientific={plant.scientific} identityV1={plant.identityV1} accent={meta.accent} />

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

        <CommunityInviteCard accent={meta.accent} />

        {/* Hub do resultado (video do concorrente): feedback de utilidade no
            fim do scroll. */}
        <HelpfulRow category="sound" context="result" />
        </ResultDepthLayer>
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
        savedId={savedEntryId}
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
  referenceBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  referenceBadgeText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },
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
  // Cards-porta do hub do resultado (video do concorrente). Os estilos dos
  // fatos rapidos sairam daqui na auditoria de diagramacao 20/08 junto com a
  // grade (habitat e prosa, nao vira valor curto).
  // Tela principal rica (video do concorrente, 20/08): o card deixou de ser
  // uma LINHA tocavel e virou bloco - cabecalho (que ainda abre o manual) +
  // texto colapsado embaixo.
  doorCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  doorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  doorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorLabel: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
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
  observationCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    padding: 14,
    marginBottom: 16,
  },
  observationIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  observationCopy: { flex: 1 },
  observationTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  observationBody: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
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
