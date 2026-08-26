import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import PlantHero from '../components/PlantHero';
import SectionCard from '../components/SectionCard';
import IdentificationExtras from '../components/IdentificationExtras';
import DidacticFieldGuide from '../components/DidacticFieldGuide';
import DiscoveryReceiptCard from '../components/DiscoveryReceiptCard';
import { enrichmentTaxon } from '../components/taxonIdentity';
import { colors } from '../components/theme';
import {
  getCollection,
  saveToCollection,
  removeFromCollection,
  updateCollectionEntry,
} from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
import CategoryIcon from '../components/CategoryIcon';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { trackResultSaved } from '../components/tracking';
import { getLocalisedOverview, looksLikeProse } from '../components/localisedOverview';
import TranslatableText from '../components/TranslatableText';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import ShareSpeciesCard from '../components/ShareSpeciesCard';
import CommunityInviteCard from '../components/CommunityInviteCard';
import Pronounce from '../components/Pronounce';
import TopBar, { TopBarIcon } from '../components/TopBar';
import ExpandableText from '../components/ExpandableText';
import DistributionMap from '../components/DistributionMap';
import SeasonChart from '../components/SeasonChart';
import ExactSpeciesGuide from '../components/ExactSpeciesGuide';
import DynamicSpeciesDossier from '../components/DynamicSpeciesDossier';
import { API_BASE } from '../components/apiBase';
import { getSpeciesDossier } from '../components/speciesDossier';
import { buildFishDossierTopics } from '../components/fishDossierTopics';
import {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} from '../components/sourceGroundedTopics';
import ExactSpeciesSafety from '../components/ExactSpeciesSafety';
import QuickFactGrid from '../components/QuickFactGrid';
import TopicNavigatorCard from '../components/TopicNavigatorCard';
import { createSpeciesTopicResourceKey, usePublishSpeciesTopics } from '../components/speciesTopicResource';
import GroupGuideCard from '../components/GroupGuideCard';
import { getGroups } from '../components/groupContent';
import { getSpeciesGroup } from '../components/speciesGroup';
import {
  canonicalBinomial,
  curatedDetailId,
  curatedDisplayName,
  getCuratedDetail,
  getCuratedSafety,
} from '../components/curatedDetails';
import TaxonomyTrail from '../components/TaxonomyTrail';
import LensRevealCard from '../components/LensRevealCard';
import NextBestCaptureCard from '../components/NextBestCaptureCard';
import { retakeResult } from '../components/resultRetake';
import { RESULT_DEPTHS, ResultDepthLayer } from '../components/ResultDepthSwitcher';
import {
  observationSubjectKey,
  moveObservationSubject,
} from '../components/observationStorage';

// Modelled on TreeDetailScreen, minus everything that only makes sense for a
// plant: no watering tracker, no light/soil guide, no "mark as watered". Fish
// gain three fields no other category has - common names, scientific synonyms
// and a reference photo of the species - all straight out of Fishial's
// `fishangler-data` block.

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function technicalText(value) {
  const values = Array.isArray(value) ? value : [value];
  const clean = values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

// O dossie marinho atual e recifal. So especies de recife confirmadas podem
// abri-lo; atuns e outros pelagicos continuam sem esse bloco.
const REEF_GUIDE_SPECIES = new Set([
  'amphiprion ocellaris',
  'paracanthurus hepatus',
  'pterois volitans',
]);

const GROUP_TOPIC_META = Object.freeze([
  Object.freeze({ key: 'safety', labelKey: 'detail.safetySection', icon: 'shield-checkmark-outline' }),
  Object.freeze({ key: 'role', labelKey: 'detail.ecologicalRoleSection', icon: 'leaf-outline' }),
  Object.freeze({ key: 'uses', labelKey: 'detail.fundamentals', icon: 'compass-outline' }),
]);

export function buildFishGroupTopics(group, translate) {
  if (!group?.topics || typeof translate !== 'function') return [];
  return GROUP_TOPIC_META.flatMap((meta) => {
    const value = group.topics[meta.key];
    const advice = Array.isArray(value?.advice) ? value.advice : [];
    const checklist = Array.isArray(value?.checklist) ? value.checklist : [];
    const hasContent = advice.some((line) => typeof line === 'string' && line.trim())
      || checklist.some((line) => typeof line === 'string' && line.trim());
    if (!hasContent) return [];
    return [{
      key: meta.key,
      label: translate(meta.labelKey),
      icon: meta.icon,
      text: null,
      groupOnly: true,
    }];
  });
}

export function mergeFishTopics(primary = [], groupTopics = []) {
  const merged = primary.slice();
  const keys = new Set(merged.map((topic) => topic?.key).filter(Boolean));
  for (const topic of groupTopics) {
    if (!topic?.key || keys.has(topic.key)) continue;
    merged.push(topic);
    keys.add(topic.key);
  }
  return merged;
}

export default function FishDetailScreen({ route }) {
  const navigation = useNavigation();
  // The param is named `plant` across every detail screen in this app - it is
  // the generic "identified entity", not a plant specifically. Renaming it would
  // mean touching every navigate() call site for no user-visible gain.
  const { plant, fromIdentify, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.fish;
  const { t, i18n } = useTranslation();
  const enrichment = enrichmentTaxon(plant.identityV1, {
    scientificName: plant.scientific,
    gbifKey: plant.gbifId,
  });
  const enrichmentScientific = enrichment?.canonicalName || null;
  const fishId = curatedDetailId('fish', enrichmentScientific);
  const fishNames = t('discover.topics.oceanAndRiverFish.species', { returnObjects: true });
  const curatedName = curatedDisplayName(fishNames, fishId);
  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  // Peixe usa uma ficha unica: Tecnico inclui as camadas essencial e visual.
  // A divulgacao progressiva continua nos blocos expansivos dentro da ficha.
  const resultDepth = RESULT_DEPTHS.EXPERT;
  const unsavedObservationKey = observationSubjectKey({ ...plant, savedId: null }, null);
  const observationKey = savedEntryId
    ? observationSubjectKey(plant, savedEntryId)
    : unsavedObservationKey;
  const detachedObservationKey = React.useRef(null);
  const presentationLookupKey = `fish|${i18n.language}|${enrichmentScientific || ''}`;
  const [localisedState, setLocalisedState] = useState({ key: null, value: null });
  const localised = localisedState.key === presentationLookupKey
    ? localisedState.value
    : null;
  const localisedLoading = Boolean(enrichmentScientific)
    && localisedState.key !== presentationLookupKey;
  const localisedDisplayName = localised?.localised && localised.title
    ? localised.title
    : null;
  const displayName = curatedName || localisedDisplayName || plant.displayName || plant.name;
  const curatedLookupKey = `fish|${i18n.language}|${enrichmentScientific || ''}`;
  const [curatedState, setCuratedState] = useState({ key: null, value: null });
  const curated = curatedState.key === curatedLookupKey
    ? curatedState.value
    : null;
  const curatedLoading = Boolean(enrichmentScientific)
    && curatedState.key !== curatedLookupKey;
  // undefined = carregando; null = consulta concluida sem dossie.
  const [speciesDossier, setSpeciesDossier] = useState(undefined);
  const [groupGuideState, setGroupGuideState] = useState({ key: null, guide: null });
  const [safetyRiskLevel, setSafetyRiskLevel] = useState(null);
  const [safetyLookupDone, setSafetyLookupDone] = useState(false);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  useEffect(() => {
    let alive = true;
    if (!enrichmentScientific) {
      setLocalisedState({ key: presentationLookupKey, value: null });
      return () => { alive = false; };
    }
    getLocalisedOverview({
      scientific: enrichmentScientific,
      language: i18n.language,
    }).then((r) => {
      if (alive) setLocalisedState({ key: presentationLookupKey, value: r });
    }).catch(() => {
      if (alive) setLocalisedState({ key: presentationLookupKey, value: null });
    });
    return () => {
      alive = false;
    };
  }, [enrichmentScientific, i18n.language, presentationLookupKey]);

  useEffect(() => {
    let alive = true;
    if (!enrichmentScientific) {
      setCuratedState({ key: curatedLookupKey, value: null });
      return () => { alive = false; };
    }
    getCuratedDetail(i18n.language, 'fish', enrichmentScientific).then((detail) => {
      if (alive) setCuratedState({ key: curatedLookupKey, value: detail });
    }).catch(() => {
      if (alive) setCuratedState({ key: curatedLookupKey, value: null });
    });
    return () => {
      alive = false;
    };
  }, [curatedLookupKey, enrichmentScientific, i18n.language]);

  useEffect(() => {
    let alive = true;
    setSpeciesDossier(enrichmentScientific ? undefined : null);
    if (!enrichmentScientific) return () => { alive = false; };
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'fish',
      scientific: enrichmentScientific,
      language: i18n.language,
    }).then((value) => {
      if (alive) setSpeciesDossier(value);
    });
    return () => { alive = false; };
  }, [enrichmentScientific, i18n.language]);

  useEffect(() => {
    let alive = true;
    setSafetyRiskLevel(null);
    setSafetyLookupDone(false);
    // O nivel cru precisa chegar antes do reveal. Assim um peixe com espinhos
    // venenosos nunca recebe primeiro a apresentacao neutra da descoberta.
    getCuratedSafety(i18n.language, 'fish', enrichmentScientific)
      .then((safety) => {
        if (alive) setSafetyRiskLevel(safety?.riskLevel || null);
      })
      .catch(() => {
        if (alive) setSafetyRiskLevel(null);
      })
      .finally(() => {
        if (alive) setSafetyLookupDone(true);
      });
    return () => {
      alive = false;
    };
  }, [enrichmentScientific, i18n.language]);

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

  useEffect(() => {
    if (!savedEntryId || !displayName || displayName === plant.displayName) return;
    updateCollectionEntry(savedEntryId, { displayName }).catch(() => undefined);
  }, [displayName, plant.displayName, savedEntryId]);

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
      // O nome do fornecedor continua em `name`; a traducao exata e somente
      // apresentacao e viaja separada para diario e compartilhamento.
      const entry = await saveToCollection({ ...plant, displayName });
      if (entry) {
        const savedObservationKey = observationSubjectKey(entry, entry.savedId);
        if (previousObservationKey && savedObservationKey) {
          await moveObservationSubject(previousObservationKey, savedObservationKey);
          detachedObservationKey.current = null;
        }
        trackResultSaved({ category: 'fish' });
        // Save-mission credit (idempotent - see components/missions.js).
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

  // Which text leads, and which becomes the technical card. Vendor prose beats
  // an encyclopaedia entry - it is about this exact species record. A vendor
  // diagnostic key loses to Wikipedia prose, because a fin-ray count is not a
  // description of an animal.
  const vendorText = plant.overview || null;
  const wikiText = localised?.text || null;
  // The server's verdict, decided on the ENGLISH original. Never re-derived
  // here: by this point plant.overview may be a Korean or Chinese translation,
  // and the detector cannot read those - it would call every one of them a
  // diagnostic key and bury the translation the app just paid for.
  //
  // The `??` fallback covers an entry saved to the collection before this field
  // existed, where re-deriving is still better than nothing.
  const vendorIsProse =
    typeof plant.overviewIsProse === 'boolean'
      ? plant.overviewIsProse
      : looksLikeProse(vendorText);

  const lead = vendorIsProse ? vendorText : wikiText || vendorText;

  // The second card, or nothing.
  //
  // It must never repeat what is already above it. The previous version reached
  // for plant.overviewOriginal whenever a translation had happened - but when
  // the vendor's prose IS the lead, the "original" is that same paragraph in
  // English, so the screen showed the same text twice, with a Translate button
  // offering to spend an API call reproducing the translation already on screen.
  //
  // Rules, in order:
  //   * vendor prose leads  -> Wikipedia is the alternative view, if it differs.
  //   * Wikipedia leads     -> the vendor's diagnostic key is the technical card.
  //   * nothing else        -> no second card at all.
  const secondaryRaw = lead === vendorText ? wikiText : vendorText;
  const secondary = secondaryRaw && secondaryRaw !== lead ? secondaryRaw : null;

  // Which of the two texts is STILL in English, so the Translate button is only
  // offered where it would do something.
  //
  // Getting this wrong is not harmless: the first version keyed the button off
  // the Wikipedia language flag and attached it to whatever text was leading, so
  // a vendor description already translated server-side into Portuguese still
  // showed "Traduzir" - a button that would send Portuguese to be translated
  // into Portuguese, costing a call to change nothing.
  //
  // The vendor's text is in the reader's language exactly when a translation
  // happened, and `overviewOriginal` is only populated in that case.
  const vendorIsEnglish = !plant.overviewOriginal;
  const wikiIsEnglish = !localised?.localised;
  const stillEnglish = (text) => {
    if (!text) return false;
    if (text === plant.overviewOriginal) return true; // the original, by definition
    if (text === vendorText) return vendorIsEnglish;
    if (text === wikiText) return wikiIsEnglish;
    return false;
  };

  // commonNames left this list for the identity block under the scientific
  // name - a fish's everyday names are who it IS, not a receipt row ("quente
  // primeiro, ficha depois"). Familia, ordem e sinonimos ficam na ficha:
  // Fishial ja devolve os tres e o sync ja os preserva. Esconde-los fazia o
  // resultado restaurado parecer mais pobre sem economizar nenhuma coleta.
  const infoRows = [
    { label: t('detail.synonyms'), value: technicalText(plant.synonyms) },
  ].filter((r) => r.value);
  const detailsTopicRows = [
    { label: t('detail.family'), value: technicalText(plant.family) },
    { label: t('detail.order'), value: technicalText(plant.ord) },
    ...infoRows,
  ].filter((row) => row.value);
  const detailsTopicText = detailsTopicRows.length
    ? detailsTopicRows.map((row) => `${row.label}: ${row.value}`).join('\n')
    : null;
  const groupKey = getSpeciesGroup({ ...plant, scientific: enrichmentScientific });
  const binomial = canonicalBinomial(enrichmentScientific);
  const guideGroupKey = groupKey === 'freshwaterFish'
    || (groupKey === 'marineFish' && REEF_GUIDE_SPECIES.has(binomial))
    ? groupKey
    : null;
  const groupGuideLookupKey = `${i18n.language}|${guideGroupKey || ''}`;
  const groupGuide = groupGuideState.key === groupGuideLookupKey
    ? groupGuideState.guide
    : null;
  const groupGuideLoading = Boolean(guideGroupKey)
    && groupGuideState.key !== groupGuideLookupKey;

  useEffect(() => {
    let alive = true;
    if (!guideGroupKey) {
      setGroupGuideState({ key: groupGuideLookupKey, guide: null });
      return () => { alive = false; };
    }
    getGroups(i18n.language).then(
      (groups) => {
        if (alive) setGroupGuideState({
          key: groupGuideLookupKey,
          guide: groups?.[guideGroupKey] || null,
        });
      },
      () => {
        if (alive) setGroupGuideState({ key: groupGuideLookupKey, guide: null });
      }
    );
    return () => { alive = false; };
  }, [groupGuideLookupKey, guideGroupKey, i18n.language]);

  const dynamicTopics = buildFishDossierTopics({
    dossier: speciesDossier,
    scientific: enrichmentScientific,
    language: i18n.language,
    translate: t,
  });
  const dynamicByKey = new Map(dynamicTopics.map((topic) => [topic.key, topic]));
  const dynamicEnvironment = dynamicByKey.get('environment');
  const dynamicDiet = dynamicByKey.get('diet');
  const dynamicHabitat = dynamicByKey.get('habitat');
  const dynamicReproduction = dynamicByKey.get('reproduction');
  const dynamicLifeCycle = dynamicByKey.get('lifeCycle');
  const dynamicConservation = dynamicByKey.get('conservation');
  const habitatTopicText = [curated?.habitat, dynamicHabitat?.text]
    .filter(Boolean)
    .join('\n\n');
  const speciesTopics = [
    curated?.safety && {
      key: 'safety',
      label: t('detail.safetySection'),
      text: curated.safety,
    },
    lead && {
      key: 'overview',
      label: t('common.overview'),
      text: lead,
    },
    dynamicEnvironment,
    dynamicDiet,
    dynamicReproduction,
    dynamicLifeCycle,
    habitatTopicText && {
      key: 'habitat',
      label: dynamicHabitat?.label || t('fieldGuide.habitat'),
      text: habitatTopicText,
      icon: dynamicHabitat?.icon,
      scientific: dynamicHabitat?.scientific,
      sourceIds: dynamicHabitat?.sourceIds,
    },
    dynamicConservation,
    curated?.curiosity && {
      key: 'curiosity',
      label: t('fieldGuide.curiosity'),
      text: curated.curiosity,
    },
    detailsTopicText && {
      key: 'details',
      label: t('common.details'),
      text: detailsTopicText,
    },
  ].filter(Boolean);
  const sourceTopics = buildSourceGroundedTopics({
    dossier: speciesDossier,
    labels: {
      feeding: t('speciesDossier.diet'),
      reproduction: t('speciesDossier.reproduction'),
      lifeCycle: t('speciesDossier.lifeCycle'),
      habitat: t('fieldGuide.habitat'),
      behavior: t('observationWorkspace.eventTypes.fish.behavior'),
      ecology: t('detail.ecologicalRoleSection'),
      conservation: t('detail.conservationStatus'),
    },
  });
  // O fallback do grupo e apenas uma porta para um manual declarado como
  // geral. Nunca recebe scientific nem texto especifico da especie.
  const topics = mergeFishTopics(
    mergeSourceGroundedTopics(speciesTopics, sourceTopics),
    buildFishGroupTopics(groupGuide, t)
  );
  const topicsLoading = curatedLoading
    || localisedLoading
    || (Boolean(enrichmentScientific) && speciesDossier === undefined)
    || groupGuideLoading;
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'fish',
    language: i18n.language,
    routeKey: route.key,
    identity: plant.savedId || enrichmentScientific || plant.scientific || plant.name,
  });
  usePublishSpeciesTopics(topicResourceKey, topics, topicsLoading);

  const openTopic = (initialKey, routeTopics = topics) =>
    navigation.navigate('CareTopics', {
      groupKey: guideGroupKey,
      title: displayName,
      accent: meta.accent,
      category: 'fish',
      topics: routeTopics,
      topicsLoading,
      topicResourceKey,
      initialKey,
    });

  const quickFacts = [
    detailsTopicText && {
      key: 'details',
      icon: 'finger-print-outline',
      color: colors.purple,
      label: t('common.details'),
      value: technicalText(plant.family) || technicalText(plant.ord),
    },
  ].filter(Boolean);
  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity({ ...plant, name: displayName }, t('categories.fish.label'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the container keeps its own backgroundColor
          underneath - the scene paints over it, never replaces it. */}
      <NatureScene accent={meta.accent} />

      {/* Shared TopBar: same icons, labels and handlers as the hand-rolled bar
          it replaces - one component, one truth. */}
      <TopBar
        title={t('detail.profileTitle', { category: t('categories.fish.label') })}
        onBack={() => navigation.goBack()}
        right={
          <>
            <TopBarIcon onPress={handleShare} label={t('common.shareThisResult')}>
              <Ionicons name="share-social-outline" size={20} color={colors.text} />
            </TopBarIcon>
            <TopBarIcon
              onPress={toggleSave}
              label={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
            >
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={saved ? meta.accent : colors.text}
              />
            </TopBarIcon>
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PlantHero
          photoUri={plant.photoUri}
          similarImages={plant.similarImages}
          scientific={plant.scientific}
          identityV1={plant.identityV1}
          accent={meta.accent}
          icon={meta.tabIcon}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {/* Speaker do concorrente (hub do resultado): ouvir o latim. */}
            {!!plant.scientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {/* Moved out of the Details receipt: the names people actually call
                this fish belong with its name, not in the ficha at the bottom.
                Same text, same i18n key - only the place changed. */}
            {!!plant.commonNames && (
              <Text style={styles.commonNamesLine}>
                {t('detail.commonNames')}: {plant.commonNames}
              </Text>
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
          <CategoryIcon
            name={meta.tabIcon}
            size={13}
            color={meta.accent}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.typePillText, { color: meta.accent }]}>
            {t('categories.fish.label')}
          </Text>
        </View>

        {/* Risco curado por binomio e chave crua. Fica inteiro antes da
            galeria; sem os tres dados exatos o bloco nao aparece. */}
        <ExactSpeciesSafety category="fish" scientific={enrichmentScientific} />

        {/* A ausencia de um registro curado nao transforma o peixe em seguro.
            O aviso e deliberadamente neutro: informa o limite da evidencia
            sem deduzir risco a partir de nome popular, foto ou prosa. */}
        {safetyLookupDone && !safetyRiskLevel && (
          <SectionCard
            icon="shield-outline"
            title={t('fishSafety.unverifiedTitle')}
            color={colors.warning}
          >
            <Text style={styles.body}>{t('fishSafety.unverifiedBody')}</Text>
          </SectionCard>
        )}

        {safetyLookupDone && (
          <LensRevealCard
            confidence={plant.confidence}
            summary={lead}
            accent={meta.accent}
            critical={safetyRiskLevel === 'danger'}
          />
        )}
        <TopicNavigatorCard topics={topicsLoading ? [] : topics}
          accent={meta.accent}
          onOpen={openTopic}
          title={t('speciesDossier.title')}
          loading={topicsLoading}
        />
        <NextBestCaptureCard
          category="fish"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'fish', fromIdentify })}
        />

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. */}
        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <IdentificationExtras entity={plant} savedId={savedEntryId || plant.savedId || null} identityV1={plant.identityV1} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.ESSENTIAL}>
          <DiscoveryReceiptCard
            outcome={scanOutcome}
            request={scanOutcomeRequest}
            accent={meta.accent}
            automaticSaveConfirmed={fromIdentify === true && !!plant.savedId}
            celebrationAllowed={safetyLookupDone && safetyRiskLevel === 'safe'}
            naturePrintAllowed={safetyLookupDone}
            riskLevel={safetyRiskLevel}
            safetyPending={!safetyLookupDone}
          />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <DidacticFieldGuide category="fish" entity={plant} accent={meta.accent} />
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

        {/* Overview in the reader's language, when one exists.
            Fishial.AI has no localised content whatsoever, so a user in Brazil
            was shown a paragraph of English written in ichthyology register -
            fin ray counts, vertebrae, diagnostic characters. Wikipedia's summary
            is already in their language and already written for a general
            reader, so it leads; the vendor's text moves below as the technical
            section, which is where a fin ray count belongs. */}
        {/* Whichever source is actually readable leads; the other becomes the
            technical card. Both are already in the reader's language - the
            vendor's text is translated server-side, Wikipedia is fetched in
            their language - so this is purely about CONTENT, not translation.
            See looksLikeProse: Fishial's description for a clownfish is a
            fin-ray count table, and no amount of translating makes that the
            right thing to lead with. */}
        {/* Zona de cor #1: the reading matter - overview plus the technical
            description - lives in one full-bleed band a shade above the page.
            ZoneBand is a pure wrapper: the quente-primeiro order (readable text
            first, fin-ray counts after) is untouched. `secondary` can only
            exist when `lead` does (see its derivation), so nesting it here
            changes nothing. */}
        {!!lead && (
          <ZoneBand gutter={20}>
            <SectionCard icon="fish-outline" title={t('common.overview')} color={meta.accent}>
              {/* Wikipedia may have answered in English when the reader's
                  language has no article. Offer the button there too - it is the
                  same leaked-English problem, just from a different source. */}
              <TranslatableText text={lead} style={styles.body} showWhenEnglish={stillEnglish(lead)} />
              {lead === localised?.text && !!localised?.url && (
                <TouchableOpacity onPress={() => Linking.openURL(localised.url)} accessibilityRole="link">
                  <Text style={styles.sourceLink}>{t('fieldGuide.textCredit')}</Text>
                </TouchableOpacity>
              )}
            </SectionCard>

            {!!secondary && (
              <SectionCard
                icon="school-outline"
                title={t('common.technicalDescription')}
                color={colors.info}
              >
                {/* Tela principal rica (video do concorrente, 20/08): a chave
                    diagnostica do vendor ("Dorsal spines (total): 9-10; ...")
                    e o bloco mais longo e menos lido da tela, e empurrava a
                    ficha inteira pra fora da dobra. Fica colapsada atras do
                    "Ver mais" - o titulo da secao continua visivel, entao
                    nada some, so espera um toque.
                    initial={0}: nenhum filho aberto. O TranslatableText nao
                    pode ser cortado por frase (perderia o botao Traduzir e o
                    aviso de origem), entao o corte e do bloco inteiro. */}
                <ExpandableText initial={0} accent={meta.accent}>
                  <TranslatableText text={secondary} style={styles.body} showWhenEnglish={stillEnglish(secondary)} />
                  {secondary === plant.overviewOriginal && (
                    <Text style={styles.sourceNote}>{t('common.vendorEnglishNote')}</Text>
                  )}
                </ExpandableText>
              </SectionCard>
            )}
          </ZoneBand>
        )}

        <ExactSpeciesGuide
          category="fish"
          scientific={enrichmentScientific}
          accent={meta.accent}
          includeOverview={!lead}
        />

        <DynamicSpeciesDossier
          category="fish"
          scientific={plant.scientific}
          identityV1={plant.identityV1}
          dossier={speciesDossier}
          accent={meta.accent}
        />

        <GroupGuideCard
          groupKey={guideGroupKey}
          entityName={enrichmentScientific ? displayName : null}
          topics={topics}
          accent={meta.accent}
          onOpen={(guideTopics, key) => openTopic(key, guideTopics)}
        />

        {/* Ciencia observacional entra depois da descricao legivel. Mapa e
            grafico somem sem dado. O antigo guia marinho/recifal saiu porque
            familia nao distingue peixe de recife, pelagico ou de agua doce. */}
        <DistributionMap scientific={plant.scientific} identityV1={plant.identityV1} accent={meta.accent} />
        <SeasonChart scientific={plant.scientific} identityV1={plant.identityV1} accent={meta.accent} />

        {/* Zona de cor #2: the receipt. The ficha closes the screen in its own
            band, and the gap between the bands is the scene showing through. */}
        {(!!plant.family || !!plant.ord || infoRows.length > 0) && (
          <ZoneBand gutter={20}>
            <TaxonomyTrail order={plant.ord} family={plant.family} scientific={plant.scientific} accent={meta.accent} />
            {infoRows.length > 0 && (
              <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
                {infoRows.map((row) => (
                  <InfoRow key={row.label} label={row.label} value={row.value} />
                ))}
              </SectionCard>
            )}
          </ZoneBand>
        )}

        {/* The species reference photo used to be rendered here as its own card.
            It now comes through IdentificationExtras above, which builds
            `similarImages` from the same Fishial photo for every category
            uniformly - keeping both would show the identical image twice. */}

        {/* Press-scale by OUTER wrapper: the Touchable stays byte for byte
            (a11y, handlers, activeOpacity) - on RN-web an Animated.Value on the
            Touchable's own style would not drive the transform. */}
        <PressScale>
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: meta.accent },
              saved && { backgroundColor: meta.accentDark },
            ]}
            onPress={toggleSave}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
          >
            <Ionicons
              name={saved ? 'checkmark-circle' : 'add-circle-outline'}
              size={20}
              color={colors.white}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.saveBtnText}>{saved ? t('common.saved') : t('common.save')}</Text>
          </TouchableOpacity>
        </PressScale>

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Compartilhe sua planta - tela principal rica (video do concorrente,
            20/08): o motor de share ja existia, mas so atras do icone de 20px
            da TopBar. Aqui ele vira convite, no fim da leitura. */}
        <ShareSpeciesCard
          entity={{ ...plant, name: displayName }}
          categoryLabel={t('categories.fish.label')}
          accent={meta.accent}
        />

        <CommunityInviteCard accent={meta.accent} />

        {/* Feedback fecha o scroll (hub do resultado, video do concorrente). */}
        <HelpfulRow category="fish" context="result" />
        </ResultDepthLayer>
      </ScrollView>

      {/* Barra de acao fixa do hub do resultado (video do concorrente),
          substituindo o SaveFab: Nova foto (so quando veio direto de uma
          identificacao), Share e a pill dominante de salvar. Absolute WITHIN
          the screen; styles.scroll keeps paddingBottom >= 120 so the bar never
          covers the last row. The top-bar bookmark stays as state indicator. */}
      <ResultActionBar
        onNew={fromIdentify ? () => navigation.goBack() : null}
        onShare={handleShare}
        onSave={toggleSave}
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
  // paddingBottom >= 120: room for the fixed ResultActionBar (hub do
  // resultado, video do concorrente) - a bar that hides the last row is the
  // viewport bug in miniature.
  scroll: { padding: 20, paddingBottom: 120 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  scientificRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
  commonNamesLine: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    marginBottom: 20,
  },
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6 },
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
  sourceLink: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 10,
    textDecorationLine: 'underline',
  },
  // Says plainly that the paragraph above is the vendor's, in English, so nobody
  // reads an untranslated block and concludes the app is broken.
  sourceNote: { color: colors.textMuted, fontSize: 11, marginTop: 9, fontStyle: 'italic' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  referenceImage: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  saveBtn: {
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15, marginLeft: 8 },
});
