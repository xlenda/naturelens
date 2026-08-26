import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import VendorSourceCredit from '../components/VendorSourceCredit';
import TaxonomyTrail from '../components/TaxonomyTrail';
import {
  observationSubjectKey,
  moveObservationSubject,
} from '../components/observationStorage';
import { colors } from '../components/theme';
import { getCollection, saveToCollection, removeFromCollection } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { getSpeciesGroup } from '../components/speciesGroup';
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
import CategoryIcon from '../components/CategoryIcon';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { trackResultSaved } from '../components/tracking';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import TopBar, { TopBarIcon } from '../components/TopBar';
import Pronounce from '../components/Pronounce';
import HelpfulRow from '../components/HelpfulRow';
import ShareSpeciesCard from '../components/ShareSpeciesCard';
import CommunityInviteCard from '../components/CommunityInviteCard';
import ResultActionBar from '../components/ResultActionBar';
import QuickFactGrid from '../components/QuickFactGrid';
import TopicNavigatorCard from '../components/TopicNavigatorCard';
import { createSpeciesTopicResourceKey, usePublishSpeciesTopics } from '../components/speciesTopicResource';
import DistributionMap from '../components/DistributionMap';
import SeasonChart from '../components/SeasonChart';
import GroupGuideCard from '../components/GroupGuideCard';
import ExactSpeciesGuide from '../components/ExactSpeciesGuide';
import { getCuratedDetail } from '../components/curatedDetails';
import { buildMushroomTopics } from '../components/mushroomSoundTopics';
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

const EDIBILITY_COLORS = {
  // A positive food label is vendor evidence, never a green permission to eat.
  choice: colors.warning,
  edible: colors.warning,
  'edible with caution': colors.warning,
  inedible: colors.warning,
  unknown: colors.textMuted,
  poisonous: colors.error,
  toxic: colors.error,
  deadly: colors.error,
};

function edibilityColor(edibility) {
  if (typeof edibility !== 'string' || !edibility.trim()) return colors.textMuted;
  return EDIBILITY_COLORS[edibility.trim().toLowerCase()] || colors.warning;
}

function technicalText(value) {
  const values = Array.isArray(value) ? value : [value];
  const clean = values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

function readerEdibilityLabel(rawValue, translatedValue, language, dangerous, toxicLabel) {
  const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
  const translated = typeof translatedValue === 'string' ? translatedValue.trim() : '';
  if (!raw) return null;

  const reader = String(language || 'en').trim().toLowerCase().replace('_', '-').split('-')[0];
  if (reader === 'en') return translated || raw;
  if (translated && translated.toLocaleLowerCase() !== raw.toLocaleLowerCase()) return translated;
  return dangerous ? toxicLabel : null;
}

export default function MushroomDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.mushroom;
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  // Fungos sempre mostram a ficha inteira. Uma preferencia antiga de leitura
  // visual nao pode esconder seguranca, distribuicao ou o guia tecnico.
  const resultDepth = RESULT_DEPTHS.EXPERT;
  const unsavedObservationKey = observationSubjectKey({ ...plant, savedId: null }, null);
  const observationKey = savedEntryId
    ? observationSubjectKey(plant, savedEntryId)
    : unsavedObservationKey;
  const detachedObservationKey = React.useRef(null);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  const enrichment = enrichmentTaxon(plant.identityV1, {
    scientificName: plant.scientific,
    gbifKey: plant.gbifId,
  });
  const enrichmentScientific = enrichment?.canonicalName || null;
  const curatedLookupKey = `${i18n.language}|${enrichmentScientific || ''}`;
  const [curatedState, setCuratedState] = useState({ key: null, detail: null });
  const [dossierState, setDossierState] = useState({ key: null, value: null });
  const curated = curatedState.key === curatedLookupKey ? curatedState.detail : null;
  const speciesDossier = dossierState.key === curatedLookupKey ? dossierState.value : null;
  const curatedLoading = Boolean(enrichmentScientific) && curatedState.key !== curatedLookupKey;
  const dossierLoading = Boolean(enrichmentScientific) && dossierState.key !== curatedLookupKey;

  useEffect(() => {
    let alive = true;
    if (!enrichmentScientific) return () => { alive = false; };
    getCuratedDetail(i18n.language, 'mushroom', enrichmentScientific).then(
      (detail) => {
        if (alive) setCuratedState({ key: curatedLookupKey, detail });
      },
      () => {
        if (alive) setCuratedState({ key: curatedLookupKey, detail: null });
      }
    );
    return () => {
      alive = false;
    };
  }, [curatedLookupKey, i18n.language, enrichmentScientific]);

  useEffect(() => {
    let alive = true;
    // O endpoint recebe somente o binomio confirmado pelo contrato de
    // identidade. Candidato usa o guia geral, nunca estas secoes da especie.
    if (!enrichmentScientific) return () => { alive = false; };
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'mushroom',
      scientific: enrichmentScientific,
      language: i18n.language,
    }).then((value) => {
      if (alive) setDossierState({ key: curatedLookupKey, value });
    });
    return () => { alive = false; };
  }, [curatedLookupKey, i18n.language, enrichmentScientific]);

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
      const entry = await saveToCollection(plant);
      if (entry) {
        const savedObservationKey = observationSubjectKey(entry, entry.savedId);
        if (previousObservationKey && savedObservationKey) {
          await moveObservationSubject(previousObservationKey, savedObservationKey);
          detachedObservationKey.current = null;
        }
        trackResultSaved({ category: 'mushroom' });
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

  const edColor = edibilityColor(plant.edibility);
  // The raw English value remains the severity key and is never presentation.
  // It is readable as-is only for an English reader. In any other locale, a
  // missing/copied translation fails closed; high risk still receives the
  // explicit local "toxic" label while positive food claims disappear.
  const displayedEdibilityLabel = readerEdibilityLabel(
    plant.edibility,
    plant.edibilityLabel,
    i18n.language,
    edColor === colors.error,
    t('detail.toxicShort')
  );
  // O binomio continua fechado pela identidade exata. Familia e ordem servem
  // somente para escolher um guia GERAL explicitamente rotulado como tal.
  const groupKey = getSpeciesGroup({
    category: 'mushroom',
    scientific: enrichmentScientific,
    family: plant.family,
    ord: plant.ord,
  });
  // Mushroom.id covers moulds, yeasts and other fungi too. "Fungus" is true
  // for every result while "mushroom" is not.
  const resultTypeLabel = t('detail.fungusLabel');
  const infoRows = [
    { label: t('detail.synonyms'), value: technicalText(plant.synonyms) },
  ].filter((row) => row.value);
  const detailsTopicRows = [
    { label: t('detail.family'), value: technicalText(plant.family) },
    { label: t('detail.order'), value: technicalText(plant.ord) },
    { label: t('detail.commonNames'), value: technicalText(plant.commonNames) },
    ...infoRows,
  ].filter((row) => row.value);
  const fallbackLookAlikes = Array.isArray(plant.lookAlike) ? plant.lookAlike : [];
  const detailedLookAlikes = Array.isArray(plant.lookAlikeDetails)
    ? plant.lookAlikeDetails
    : [];
  const lookAlikes = (detailedLookAlikes.length
    ? detailedLookAlikes
    : fallbackLookAlikes.map((name) => ({ name })))
    .map((item, index) => ({
      name: technicalText(item?.name) || technicalText(fallbackLookAlikes[index]),
      description: technicalText(item?.description),
      features: technicalText(item?.distinguishing_features || item?.distinguishingFeatures),
      url: /^https?:\/\//i.test(item?.url || '') ? item.url : null,
    }))
    .filter((item) => item.name);

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, resultTypeLabel);
  };

  const safetyTopicText = [
    plant.psychoactive === true ? t('detail.psychoactiveWarning') : null,
    displayedEdibilityLabel,
    t('terms.accuracyBody'),
  ].filter(Boolean).join('\n\n');
  const overviewText = plant.overview || curated?.overview || null;

  // O manual do fungo comeca por seguranca. Habitat, curiosidade e ficha so
  // entram quando o verbete exato ou o fornecedor realmente os entregou.
  const baseTopics = buildMushroomTopics({
    labels: {
      safety: t('detail.safetySection'),
      lookAlikes: t('detail.frequentlyConfusedWith'),
      overview: t('common.overview'),
      habitat: t('fieldGuide.habitat'),
      curiosity: t('fieldGuide.curiosity'),
      details: t('common.details'),
    },
    safetyText: safetyTopicText,
    lookAlikes,
    overview: overviewText,
    habitat: curated?.habitat,
    curiosity: curated?.curiosity,
    detailRows: detailsTopicRows,
  });
  const sourceTopics = buildSourceGroundedTopics({ dossier: speciesDossier });
  const topics = mergeSourceGroundedTopics(baseTopics, sourceTopics);
  const topicsLoading = curatedLoading || dossierLoading;
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'mushroom',
    language: i18n.language,
    routeKey: route.key,
    identity: plant.savedId || plant.scientific || plant.name,
  });
  usePublishSpeciesTopics(topicResourceKey, topics, topicsLoading);

  const openTopic = (initialKey, routeTopics = topics) =>
    navigation.navigate('CareTopics', { groupKey,
      title: plant.name,
      accent: meta.accent,
      category: 'mushroom',
      topics: routeTopics,
      topicsLoading,
      topicResourceKey,
      initialKey,
    });

  // Fatos rapidos sao portas para abas reais; nunca uma autorizacao para comer.
  const quickFacts = [
    displayedEdibilityLabel && {
      key: 'safety',
      icon: 'shield-checkmark-outline',
      color: edColor === colors.error ? colors.error : colors.warning,
      label: t('detail.safetySection'),
      value: displayedEdibilityLabel,
    },
    lookAlikes.length > 0 && {
      key: 'confusas',
      icon: 'eye-outline',
      color: colors.warning,
      label: t('detail.frequentlyConfusedWith'),
      value: lookAlikes[0].name,
    },
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas (diagramacao-premium): FIRST child of the root,
          pointerEvents none inside the component, and the root keeps its own
          backgroundColor underneath - decoration never steals a touch. */}
      <NatureScene accent={meta.accent} />

      <TopBar
        title={t('detail.profileTitle', { category: resultTypeLabel })}
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

      {/* A ResultActionBar cresce com insets.bottom, entao o respiro do scroll
          tem que crescer junto - o dock, que carregava a area segura nesta
          rota, nao existe mais aqui (HIDE_DOCK_ON). */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <PlantHero
          photoUri={plant.photoUri}
          similarImages={plant.similarImages}
          scientific={enrichmentScientific}
          identityV1={plant.identityV1}
          accent={meta.accent}
          icon={meta.tabIcon}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{plant.name}</Text>
            {/* Hub do resultado (video do concorrente): alto-falante de
                pronuncia colado no nome cientifico. */}
            {!!plant.scientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {!!plant.commonNames && (
              <Text style={styles.commonNamesLine}>
                {t('detail.commonNames')}:{' '}
                {Array.isArray(plant.commonNames) ? plant.commonNames.join(', ') : plant.commonNames}
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

        <View style={styles.pillRow}>
          <View style={[styles.typePill, { backgroundColor: meta.accent + '22' }]}>
            <CategoryIcon
              name={meta.tabIcon}
              size={13}
              color={meta.accent}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={[styles.typePillText, { color: meta.accent }]}>{resultTypeLabel}</Text>
          </View>
          {!!displayedEdibilityLabel && (
            <View style={[styles.typePill, { backgroundColor: edColor + '22' }]}>
              <Ionicons
                name="restaurant-outline"
                size={13}
                color={edColor}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
              {/* Cor pelo valor CRU (edColor), texto pelo rotulo traduzido. Traduzir
                  o valor no lugar faria um cogumelo MORTAL cair no laranja de
                  aviso comum, porque a cor e escolhida casando a palavra em
                  ingles (auditoria 20/08). */}
              <Text style={[styles.typePillText, { color: edColor }]}>
                {displayedEdibilityLabel}
              </Text>
            </View>
          )}
        </View>

        {/* Zona de cor (diagramacao-premium): thematic runs of sections live
            in full-bleed bands one shade above the background; the gap between
            bands is the scene showing through. ZoneBand is a pure wrapper -
            the quente-primeiro order stays byte for byte. This first band is
            the whole safety story: psychoactive warning, the always-visible
            edibility note, the identification extras (on mushrooms they ARE
            food safety) and the overview. */}
        <ZoneBand gutter={20}>
        {plant.psychoactive === true && (
          <View style={styles.warningBanner}>
            <Ionicons
              name="alert-circle"
              size={20}
              color={colors.error}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.warningText}>
              {t('detail.psychoactiveWarning')}
            </Text>
          </View>
        )}

        {/* Always-visible food-safety note. The "never eat based on this
            app's result" warning used to live only in Terms and the FAQ -
            places nobody about to cook a find ever reads. It reuses the
            Terms wording verbatim: one source of truth, already translated
            in all 17 languages, and the exact claim a store reviewer looks
            for next to an edibility badge. */}
        <View style={styles.edibilityNote}>
          <Ionicons
            name="warning-outline"
            size={18}
            color={colors.warning}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.edibilityNoteText}>{t('terms.accuracyBody')}</Text>
        </View>

        <LensRevealCard
          confidence={plant.confidence}
          summary={overviewText}
          accent={meta.accent}
          critical={edColor === colors.error || plant.psychoactive === true}
        />
        <TopicNavigatorCard
          topics={topics}
          accent={meta.accent}
          onOpen={openTopic}
          loading={curatedLoading || dossierLoading}
        />
        <NextBestCaptureCard
          category="mushroom"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'mushroom', fromIdentify })}
        />

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. This matters more on
            mushrooms than anywhere else in the app: a confidently-stated wrong
            species here is a food-safety problem, not a cosmetic one. */}
        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <IdentificationExtras entity={plant} savedId={savedEntryId || plant.savedId || null} identityV1={plant.identityV1} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.ESSENTIAL}>
          <DiscoveryReceiptCard
            outcome={scanOutcome}
            request={scanOutcomeRequest}
            accent={meta.accent}
            automaticSaveConfirmed={fromIdentify === true && !!plant.savedId}
            riskLevel={edColor === colors.error || plant.psychoactive === true ? 'danger' : null}
          />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <DidacticFieldGuide category="mushroom" entity={plant} accent={meta.accent} />
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

        {!!overviewText && (
          <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
            <Text style={styles.body}>{overviewText}</Text>
            {!!plant.overview && (
              <VendorSourceCredit
                provider={plant.sourceProvider}
                citation={plant.overviewCitation}
                licenseName={plant.overviewLicense}
                licenseUrl={plant.overviewLicenseUrl}
              />
            )}
          </SectionCard>
        )}
        </ResultDepthLayer>
        </ZoneBand>

        {/* Sosias sao seguranca alimentar e permanecem visiveis em qualquer
            nivel de profundidade. A pessoa nao precisa escolher "Especialista"
            para descobrir que existe uma especie parecida. */}
        {lookAlikes.length > 0 && (
          <ZoneBand gutter={20}>
            <SectionCard
              icon="eye-outline"
              title={t('detail.frequentlyConfusedWith')}
              color={colors.warning}
            >
              {lookAlikes.map((item) => (
                <View key={item.name} style={styles.lookAlikeRow}>
                  <Text style={styles.lookAlikeName}>{'• ' + item.name}</Text>
                  {!!item.description && <Text style={styles.lookAlikeDetail}>{item.description}</Text>}
                  {!!item.features && <Text style={styles.lookAlikeDetail}>{item.features}</Text>}
                  {!!item.url && (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      accessibilityRole="link"
                      onPress={() => Linking.openURL(item.url)}
                    >
                      <Text style={styles.lookAlikeLink}>{t('common.readMore')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </SectionCard>
          </ZoneBand>
        )}

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.EXPERT}>

        {/* Comestibilidade e sósias são os fatos quentes de um cogumelo. Eles
            ficam antes de mapa e sazonalidade, sem transformar ausência de
            dado em orientação alimentar. */}
        <QuickFactGrid
          accent={meta.accent}
          facts={quickFacts.map((f) => ({ ...f, onPress: () => openTopic(f.key) }))}
        />

        <ExactSpeciesGuide
          category="mushroom"
          scientific={enrichmentScientific}
          accent={meta.accent}
          includeOverview={!overviewText}
        />

        {/* Mapa de distribuicao REAL (GBIF) - tela principal rica (video do
            concorrente, 20/08): o GBIF indexa fungos como indexa plantas, e o
            componente e o mesmo da tela de planta. Some sozinho quando o nome
            cientifico nao casa com nenhum taxon ou o aparelho esta offline. */}
        <DistributionMap scientific={plant.scientific} gbifId={plant.gbifId} identityV1={plant.identityV1} accent={meta.accent} />
        <SeasonChart scientific={plant.scientific} gbifId={plant.gbifId} identityV1={plant.identityV1} accent={meta.accent} />

        <GroupGuideCard
          groupKey={groupKey}
          entityName={plant.name}
          topics={topics}
          accent={meta.accent}
          onOpen={(guideTopics, key) => openTopic(key, guideTopics)}
        />

        {(!!technicalText(plant.family) || !!technicalText(plant.ord) || infoRows.length > 0) && (
          <ZoneBand gutter={20}>
            <TaxonomyTrail order={plant.ord} family={plant.family} scientific={plant.scientific} accent={meta.accent} />
            {infoRows.length > 0 && (
              <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
                {infoRows.map((row) => (
                  <View key={row.label} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                ))}
              </SectionCard>
            )}
          </ZoneBand>
        )}

        {!!plant.url && (
          <TouchableOpacity
            style={styles.linkBtn}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(plant.url)}
            accessibilityRole="button"
            accessibilityLabel={t('detail.readMoreLabel', { category: resultTypeLabel.toLowerCase() })}
          >
            <Ionicons
              name="globe-outline"
              size={18}
              color={colors.info}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.linkBtnText}>{t('common.readMore')}</Text>
          </TouchableOpacity>
        )}

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium): the
            Touchable stays byte for byte - a11y, labels and handlers intact. */}
        <PressScale>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: meta.accent }, saved && { backgroundColor: meta.accentDark }]}
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
          <Text style={styles.saveBtnText}>
            {saved ? t('common.saved') : t('common.save')}
          </Text>
        </TouchableOpacity>
        </PressScale>

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Compartilhe sua planta - tela principal rica (video do concorrente,
            20/08): o motor de share ja existia, mas so atras do icone de 20px
            da TopBar. Aqui ele vira convite, no fim da leitura. */}
        <ShareSpeciesCard
          entity={plant}
          categoryLabel={resultTypeLabel}
          accent={meta.accent}
        />

        <CommunityInviteCard accent={meta.accent} />

        {/* Foi util? - hub do resultado (video do concorrente): fecha o
            scroll medindo a identificacao. */}
        <HelpfulRow category="mushroom" context="result" />
        </ResultDepthLayer>
      </ScrollView>

      {/* Barra de acoes fixa - hub do resultado (video do concorrente):
          Nova foto | Compartilhar | Salvar sempre a um toque; substitui o
          SaveFab, e o scroll acima carrega paddingBottom >= 120. "Nova foto"
          so quando a tela veio da identificacao. */}
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
  // paddingBottom >= 120: room for the fixed ResultActionBar (viewport law).
  scroll: { padding: 20, paddingBottom: 120 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary },
  scientificRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
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
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 16 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
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
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: colors.error + '18',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error + '44',
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: '600', marginLeft: 10, lineHeight: 18 },
  edibilityNote: {
    flexDirection: 'row',
    backgroundColor: colors.warning + '14',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.warning + '3C',
    alignItems: 'flex-start',
  },
  edibilityNoteText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, marginLeft: 10, lineHeight: 18 },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  // Bullet da lista de confusoes - tela principal rica (video do concorrente,
  // 20/08). Os estilos do card-porta sairam daqui junto com ele: a lista agora
  // e inline. Os dos fatos rapidos moram em components/QuickFactGrid.js.
  bullet: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  lookAlikeRow: { paddingVertical: 6 },
  lookAlikeName: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  lookAlikeDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 3, marginLeft: 13 },
  lookAlikeLink: { color: colors.info, fontSize: 12.5, fontWeight: '700', marginTop: 5, marginLeft: 13 },
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  specialistText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13.5 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  linkBtnText: { color: colors.info, fontWeight: '600', marginLeft: 8, fontSize: 14 },
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
