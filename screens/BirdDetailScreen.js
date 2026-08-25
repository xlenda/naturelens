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
import SeasonChart from '../components/SeasonChart';
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
import {
  birdIdFromLabel,
  getCuratedBird,
  guideGroupForBirdLabel,
  scientificForBirdLabel,
} from '../components/curatedBirds';
import { curatedDisplayName } from '../components/curatedDetails';
import { getLocalisedOverview } from '../components/localisedOverview';
import TranslatableText from '../components/TranslatableText';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { trackResultSaved } from '../components/tracking';
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
import GroupGuideCard from '../components/GroupGuideCard';
import { getGroups } from '../components/groupContent';
import { getSpeciesGroup } from '../components/speciesGroup';
import TopicNavigatorCard from '../components/TopicNavigatorCard';
import { createSpeciesTopicResourceKey, usePublishSpeciesTopics } from '../components/speciesTopicResource';
import LensRevealCard from '../components/LensRevealCard';
import NextBestCaptureCard from '../components/NextBestCaptureCard';
import { retakeResult } from '../components/resultRetake';
import { RESULT_DEPTHS, ResultDepthLayer } from '../components/ResultDepthSwitcher';
import DynamicBirdDossier from '../components/DynamicBirdDossier';
import { API_BASE } from '../components/apiBase';
import { getBirdSpeciesDossier } from '../components/birdSpeciesDossier';
import { buildBirdDossierTopics } from '../components/birdDossierTopics';
import {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} from '../components/sourceGroundedTopics';
import { enrichmentTaxon } from '../components/taxonIdentity';
import {
  observationSubjectKey,
  moveObservationSubject,
} from '../components/observationStorage';

// Nyckel entrega apenas rotulo e confianca. O servidor agora pode provar a ponte
// desse rotulo para um unico taxon Aves no Wikidata e um match exato no GBIF;
// somente entao fontes estruturadas enriquecem a tela. Sem prova, a tela conserva
// o resultado visual e omite os blocos cientificos em vez de completar por grupo.

// Secao curada da tela principal - tela principal rica (video do concorrente,
// 20/08). Era um card-porta: label + UMA linha truncada, e o texto inteiro so
// existia dentro do manual. Agora o texto mora aqui, colapsado na primeira
// frase, e o cabecalho continua sendo a porta pro manual (que acrescenta
// checklist, dica e o material do grupo - conteudo que nao esta nesta tela).
// Sem onPress o cabecalho e so um cabecalho: nao ha manual que valha abrir.
function TopicBlock({ icon, color, label, text, onPress }) {
  const header = (
    <>
      <View style={[styles.doorIcon, { backgroundColor: color + '22' }]}>
        <Ionicons
          name={icon}
          size={17}
          color={color}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <Text style={[styles.doorLabel, { color }]}>{label}</Text>
      {!!onPress && (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textMuted}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
      )}
    </>
  );

  return (
    <View style={styles.doorCard}>
      {onPress ? (
        <TouchableOpacity
          style={styles.doorHeader}
          onPress={onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {header}
        </TouchableOpacity>
      ) : (
        <View style={styles.doorHeader}>{header}</View>
      )}
      <ExpandableText text={text} textStyle={styles.body} accent={color} />
    </View>
  );
}

const GROUP_TOPIC_META = Object.freeze([
  Object.freeze({ key: 'safety', labelKey: 'detail.safetySection', icon: 'shield-checkmark-outline' }),
  Object.freeze({ key: 'role', labelKey: 'detail.ecologicalRoleSection', icon: 'leaf-outline' }),
  Object.freeze({ key: 'uses', labelKey: 'detail.fundamentals', icon: 'compass-outline' }),
]);

export function buildBirdGroupTopics(group, translate) {
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

export function mergeBirdTopics(primary = [], groupTopics = []) {
  const merged = primary.slice();
  const keys = new Set(merged.map((topic) => topic?.key).filter(Boolean));
  for (const topic of groupTopics) {
    if (!topic?.key || keys.has(topic.key)) continue;
    merged.push(topic);
    keys.add(topic.key);
  }
  return merged;
}

export default function BirdDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.bird;
  const { t, i18n } = useTranslation();
  const birdId = birdIdFromLabel(plant.name);
  const birdNames = t('discover.topics.birdsOfTheWorld.species', { returnObjects: true });
  const curatedName = curatedDisplayName(birdNames, birdId);
  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const unsavedObservationKey = observationSubjectKey({ ...plant, savedId: null }, null);
  const observationKey = savedEntryId
    ? observationSubjectKey(plant, savedEntryId)
    : unsavedObservationKey;
  const detachedObservationKey = React.useRef(null);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  // undefined = carregando; null = consulta concluida sem dossie.
  const [birdDossier, setBirdDossier] = useState(undefined);
  const [groupGuideState, setGroupGuideState] = useState({ key: null, guide: null });
  // Ave usa uma ficha unica: Tecnico inclui as camadas essencial e visual.
  // A divulgacao progressiva continua nos blocos expansivos dentro da ficha.
  const resultDepth = RESULT_DEPTHS.EXPERT;
  // A ponte servidor prova rotulo unico no Wikidata e match exato no GBIF.
  // Registros antigos sem essa identidade ainda usam apenas a tabela curada;
  // um campo cientifico solto nunca autoriza enriquecimento por conta propria.
  const providerTaxon = enrichmentTaxon(plant.identityV1, {
    scientificName: plant.scientific,
  });
  // Um rotulo curado preserva colecoes antigas, mas nunca promove um resultado
  // novo candidate/unresolved a especie exata.
  const legacyScientific = plant.identityV1 === undefined
    ? scientificForBirdLabel(plant.name)
    : null;
  const resolvedScientific = providerTaxon?.canonicalName || legacyScientific;
  const identityScientific = resolvedScientific;
  const presentationLookupKey = `bird|${i18n.language}|${resolvedScientific || ''}|${plant.name || ''}`;
  // Curadoria e artigo localizado so existem quando a chave inteira coincide.
  // Isso impede um idioma/especie anterior de reaparecer durante uma troca
  // rapida de rota, mesmo antes de o effect da nova consulta executar.
  const [presentationState, setPresentationState] = useState({
    key: null,
    curated: null,
    localised: null,
  });
  const presentation = presentationState.key === presentationLookupKey
    ? presentationState
    : null;
  const curated = presentation?.curated || null;
  const localised = presentation?.localised || null;
  const presentationLoading = Boolean(resolvedScientific)
    && presentationState.key !== presentationLookupKey;
  const localisedDisplayName = localised?.localised && localised.title
    ? localised.title
    : null;
  const displayName = curatedName || localisedDisplayName || plant.name;
  // Nyckel/BioCLIP deliberately return overview:null. Curated/Wikipedia prose
  // is presentation in the active reader language and must never be frozen in
  // the stable collection entity.
  const resolvedOverview = curated?.overview || localised?.text || null;

  useEffect(() => {
    let alive = true;
    const settlePresentation = (curatedValue = null, localisedValue = null) => {
      if (alive) setPresentationState({
        key: presentationLookupKey,
        curated: curatedValue,
        localised: localisedValue,
      });
    };
    if (!resolvedScientific) {
      settlePresentation();
      return () => { alive = false; };
    }
    getCuratedBird(i18n.language, plant.name).then(
      (c) => {
        if (!alive) return;
        const exactCurated = c?.scientific === resolvedScientific ? c : null;
        // Only worth fetching when there is no curated text - the curated file is
        // already written in the reader's language and is better than a Wikipedia
        // lead paragraph.
        if (!exactCurated) {
          getLocalisedOverview({ scientific: resolvedScientific, language: i18n.language })
            .then(
              (r) => settlePresentation(null, r),
              () => settlePresentation()
            );
        } else {
          settlePresentation(exactCurated, null);
        }
      },
      () => settlePresentation()
    );
    return () => {
      alive = false;
    };
  }, [i18n.language, plant.name, presentationLookupKey, resolvedScientific]);

  useEffect(() => {
    let alive = true;
    setBirdDossier(resolvedScientific ? undefined : null);
    if (!resolvedScientific) return () => { alive = false; };
    getBirdSpeciesDossier({
      apiBase: API_BASE,
      scientific: resolvedScientific,
      language: i18n.language,
    }).then((value) => {
      if (alive) setBirdDossier(value);
    });
    return () => { alive = false; };
  }, [i18n.language, resolvedScientific]);

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
    if (!savedEntryId) return;
    const patch = {};
    if (identityScientific && identityScientific !== plant.scientific) {
      patch.scientific = identityScientific;
    }
    if (!Object.keys(patch).length) return;
    updateCollectionEntry(savedEntryId, patch).catch(() => undefined);
  }, [
    identityScientific,
    plant.scientific,
    savedEntryId,
  ]);

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
      const stablePlant = { ...plant };
      delete stablePlant.displayName;
      delete stablePlant.overview;
      const entry = await saveToCollection({
        ...stablePlant,
        scientific: identityScientific,
      });
      if (entry) {
        const savedObservationKey = observationSubjectKey(entry, entry.savedId);
        if (previousObservationKey && savedObservationKey) {
          await moveObservationSubject(previousObservationKey, savedObservationKey);
          detachedObservationKey.current = null;
        }
        trackResultSaved({ category: 'bird' });
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

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity({ ...plant, name: displayName, scientific: identityScientific }, t('categories.bird.label'));
  };

  const detailLines = [
    resolvedScientific ? `${t('common.identified')}: ${resolvedScientific}` : null,
    Number.isFinite(plant.confidence) ? `${t('common.confidence')}: ${plant.confidence}%` : null,
  ].filter(Boolean);
  const detailsText = detailLines.length > 0 ? detailLines.join('\n') : null;
  const taxonomyGroupKey = getSpeciesGroup({
    ...plant,
    category: 'bird',
    scientific: resolvedScientific,
    family: plant.family || birdDossier?.taxonomy?.family || null,
    ord: plant.ord || birdDossier?.taxonomy?.order || null,
  });
  const guideGroupKey = taxonomyGroupKey || guideGroupForBirdLabel(plant.name);
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

  // A mesma resposta normalizada alimenta o card tecnico e as abas. Assim a
  // tela faz uma unica consulta e nenhum campo cru do servidor contorna a
  // prova conjunta de identidade GBIF + proveniencia Wikidata.
  const dossierTopics = buildBirdDossierTopics({
    scientific: resolvedScientific,
    dossier: birdDossier,
    language: i18n.language,
    translate: t,
  });
  const dossierTopic = (key) => dossierTopics.find((topic) => topic.key === key);
  const dynamicHabitat = dossierTopic('habitat');
  const habitatText = [curated?.habitat, dynamicHabitat?.text].filter(Boolean).join('\n\n');
  const speciesTopics = [
    resolvedOverview && { key: 'overview', label: t('common.overview'), text: resolvedOverview },
    dossierTopic('diet'),
    habitatText && {
      ...(dynamicHabitat || {}),
      key: 'habitat',
      label: t('fieldGuide.habitat'),
      text: habitatText,
    },
    dossierTopic('reproduction'),
    dossierTopic('lifeCycle'),
    dossierTopic('conservation'),
    curated?.curiosity && { key: 'curiosity', label: t('fieldGuide.curiosity'), text: curated.curiosity },
    detailsText && { key: 'details', label: t('common.details'), text: detailsText },
  ].filter(Boolean);
  const sourceTopics = buildSourceGroundedTopics({
    dossier: birdDossier,
    labels: {
      vocalization: t('observationWorkspace.eventTypes.bird.vocalization'),
      feeding: t('speciesDossier.diet'),
      reproduction: t('speciesDossier.reproduction'),
      lifeCycle: t('speciesDossier.lifeCycle'),
      habitat: t('fieldGuide.habitat'),
      behavior: t('observationWorkspace.eventTypes.bird.behavior'),
      ecology: t('detail.ecologicalRoleSection'),
      conservation: t('detail.conservationStatus'),
    },
  });
  // O fallback do grupo e apenas uma porta para um manual declarado como
  // geral. Nunca recebe scientific nem texto especifico da especie.
  const topics = mergeBirdTopics(
    mergeSourceGroundedTopics(speciesTopics, sourceTopics),
    buildBirdGroupTopics(groupGuide, t)
  );
  const topicsLoading = presentationLoading
    || (Boolean(resolvedScientific) && birdDossier === undefined)
    || groupGuideLoading;
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'bird',
    language: i18n.language,
    routeKey: route.key,
    // The recognition label may be a common name. A live scientific manual is
    // keyed only by the saved specimen or the taxon that the bridge proved.
    identity: plant.savedId || resolvedScientific || null,
  });
  usePublishSpeciesTopics(topicResourceKey, topics, topicsLoading);
  const hasManual = topics.length >= 2;

  const openTopic = (initialKey, routeTopics = topics) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('CareTopics', { groupKey: guideGroupKey,
      title: displayName,
      accent: meta.accent,
      category: 'bird',
      topics: routeTopics,
      topicsLoading,
      topicResourceKey,
      initialKey,
    });
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
        title={t('detail.profileTitle', { category: t('categories.bird.label') })}
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
          scientific={resolvedScientific}
          accent={meta.accent}
          icon={meta.tabIcon}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{displayName}</Text>
            {/* Speaker do concorrente (hub do resultado): ouvir o latim. */}
            {!!identityScientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{identityScientific}</Text>
                <Pronounce text={identityScientific} />
              </View>
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
            {t('categories.bird.label')}
          </Text>
        </View>

        {/* Esta ressalva de cobertura descreve somente o Nyckel. Ela vem
            antes das fotos e da prosa para a galeria não parecer confirmação
            absoluta de uma espécie apenas sugerida pela imagem. */}
        {!(
          plant.sourceProvider === 'bioclip-2' &&
          plant.identityV1?.status === 'exact'
        ) ? (
          <SectionCard icon="alert-circle-outline" title={t('detail.coverageNoteTitle')} color={colors.warning}>
            <Text style={styles.body}>{t('detail.birdCoverageNote')}</Text>
          </SectionCard>
        ) : null}

        <LensRevealCard confidence={plant.confidence} summary={resolvedOverview} accent={meta.accent} />
        <TopicNavigatorCard topics={topics}
          accent={meta.accent}
          onOpen={openTopic}
          title={t('speciesDossier.title')}
          loading={topicsLoading}
        />
        <NextBestCaptureCard
          category="bird"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'bird', fromIdentify })}
        />

        {/* O hero ja usa a foto enciclopedica. Repeti-la num segundo card fazia
            a tela parecer maior sem acrescentar evidencia; a galeria abaixo
            busca observacoes licenciadas do taxon exato. */}
        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <IdentificationExtras
            entity={{ ...plant, scientific: resolvedScientific }}
            scientific={resolvedScientific}
            accent={meta.accent}
          />
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
          <DidacticFieldGuide
            category="bird"
            entity={{ ...plant, scientific: resolvedScientific }}
            accent={meta.accent}
          />
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

        <DynamicBirdDossier
          dossier={birdDossier}
          accent={meta.accent}
        />

        {/* A prosa so aparece quando uma fonte entregou conteudo real. */}
        {/* Zona de cor: everything we can SAY about the species - the reading
            plus the honesty note that qualifies it - lives in one full-bleed
            band a shade above the page. ZoneBand is a pure wrapper: the
            quente-primeiro order of the cards is untouched. */}
        <ZoneBand gutter={20}>
          {curated ? (
            <>
              {/* Overview fica inline e completo - a leitura que abre a tela
                  ("quente primeiro"). */}
              {!!resolvedOverview && (
                <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
                  <Text style={styles.body}>{resolvedOverview}</Text>
                </SectionCard>
              )}
              {/* Tela principal rica (video do concorrente, 20/08): habitat e
                  curiosidade voltam a ser TEXTO nesta tela - colapsados na
                  primeira frase - em vez de duas linhas truncadas que so
                  faziam sentido depois de navegar. O cabecalho segue abrindo o
                  manual quando ele existe (>= 2 topicos); sem manual, e so um
                  cabecalho. Campo vazio nao gera bloco. */}
              {[
                { key: 'habitat', icon: 'earth-outline', color: colors.info, label: t('fieldGuide.habitat'), text: curated.habitat },
                { key: 'curiosity', icon: 'sparkles-outline', color: colors.warning, label: t('fieldGuide.curiosity'), text: curated.curiosity },
                { key: 'details', icon: 'finger-print-outline', color: colors.purple, label: t('common.details'), text: detailsText },
              ]
                .filter((b) => !!b.text)
                .map((b) => (
                  <TopicBlock
                    key={b.key}
                    icon={b.icon}
                    color={b.color}
                    label={b.label}
                    text={b.text}
                    onPress={hasManual ? () => openTopic(b.key) : null}
                  />
                ))}
            </>
          ) : resolvedOverview ? (
            <SectionCard icon="information-circle-outline" title={t('common.overview')} color={meta.accent}>
              <TranslatableText
                text={resolvedOverview}
                style={styles.body}
                showWhenEnglish={
                  !!localised?.text && resolvedOverview === localised?.text && !localised?.localised
                }
              />
              {resolvedOverview === localised?.text && !!localised?.url && (
                <TouchableOpacity onPress={() => Linking.openURL(localised.url)} accessibilityRole="link">
                  <Text style={styles.sourceLink}>{t('fieldGuide.textCredit')}</Text>
                </TouchableOpacity>
              )}
            </SectionCard>
          ) : null}

        </ZoneBand>

        <GroupGuideCard
          groupKey={guideGroupKey}
          entityName={providerTaxon ? displayName : null}
          topics={topics}
          accent={meta.accent}
          onOpen={(guideTopics, key) => openTopic(key, guideTopics)}
        />

        {/* Ocorrencias GBIF entram depois da leitura e da ressalva de
            cobertura. O histograma e observacional e mundial: nao afirma
            migracao, epoca reprodutiva nem melhor mes para ver esta ave. */}
        <DistributionMap scientific={resolvedScientific} accent={meta.accent} />
        <SeasonChart scientific={resolvedScientific} accent={meta.accent} />

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
          entity={{ ...plant, name: displayName, scientific: identityScientific }}
          categoryLabel={t('categories.bird.label')}
          accent={meta.accent}
        />

        <CommunityInviteCard accent={meta.accent} />

        {/* Feedback fecha o scroll (hub do resultado, video do concorrente). */}
        <HelpfulRow category="bird" context="result" />
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
  // Fatos rapidos: estilos removidos na auditoria de diagramacao 20/08
  // junto com a grade (habitat e prosa, nao vira valor curto).
  // Bloco curado da tela principal (video do concorrente, 20/08): o card
  // deixou de ser uma LINHA tocavel e virou um bloco - cabecalho (que ainda
  // abre o manual) + o texto colapsado embaixo.
  doorCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  doorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  doorIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorLabel: { fontSize: 14.5, fontWeight: '700', flex: 1 },
  specialistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  specialistText: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '700' },
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
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
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
