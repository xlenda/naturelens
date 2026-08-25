import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
import { canonicalBinomial } from '../components/curatedDetails';
import DistributionMap from '../components/DistributionMap';
import SeasonChart from '../components/SeasonChart';
import DiseaseReport from '../components/DiseaseReport';
import { colors } from '../components/theme';
import {
  getCollection,
  saveToCollection,
  removeFromCollection,
  markCollectionWatered,
  updateCollectionEntry,
} from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { getSpeciesGroup } from '../components/speciesGroup';
import { getGroups } from '../components/groupContent';
import CareSchedule from '../components/CareSchedule';
import SpeciesCareCard from '../components/SpeciesCareCard';
import { getWateringStatus } from '../components/watering';
import { identify } from '../components/identify';
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { trackResultSaved } from '../components/tracking';
import { startCheckout } from '../components/subscription';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import TopBar, { TopBarIcon } from '../components/TopBar';
import Pronounce from '../components/Pronounce';
import HelpfulRow from '../components/HelpfulRow';
import SpeciesFaq from '../components/SpeciesFaq';
import ShareSpeciesCard from '../components/ShareSpeciesCard';
import CommunityInviteCard from '../components/CommunityInviteCard';
import ResultActionBar from '../components/ResultActionBar';
import QuickFactGrid from '../components/QuickFactGrid';
import TopicNavigatorCard from '../components/TopicNavigatorCard';
import { createSpeciesTopicResourceKey, usePublishSpeciesTopics } from '../components/speciesTopicResource';
import { API_BASE } from '../components/apiBase';
import { getSpeciesDossier } from '../components/speciesDossier';
import {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} from '../components/sourceGroundedTopics';
import CareConditions from '../components/CareConditions';
import CareProfile from '../components/CareProfile';
import CommonProblems from '../components/CommonProblems';
import PlantFertilizerCard from '../components/PlantFertilizerCard';
import shortFact from '../components/shortFact';
import ExpandableText from '../components/ExpandableText';
import VendorSourceCredit from '../components/VendorSourceCredit';
import TaxonomyTrail from '../components/TaxonomyTrail';
import LensRevealCard from '../components/LensRevealCard';
import NextBestCaptureCard from '../components/NextBestCaptureCard';
import { retakeResult } from '../components/resultRetake';
import { RESULT_DEPTHS, ResultDepthLayer } from '../components/ResultDepthSwitcher';
import {
  observationSubjectKey,
  moveObservationSubject,
} from '../components/observationStorage';

function InfoRow({ label, value, color }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
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

const BOTANICAL_GROUP_TOPIC_DEFS = Object.freeze([
  { key: 'watering', labelKey: 'detail.wateringGuideSection' },
  { key: 'light', labelKey: 'detail.lightSection' },
  { key: 'soil', labelKey: 'detail.soilSection' },
  { key: 'safety', labelKey: 'detail.safetySection' },
  { key: 'uses', labelKey: 'detail.commonUsesSection' },
]);

function availableGroupTopicKeys(groups, groupKey) {
  const source = groups?.[groupKey]?.topics;
  if (!source) return [];
  return BOTANICAL_GROUP_TOPIC_DEFS
    .filter(({ key }) => {
      const topic = source[key];
      return ['advice', 'checklist'].some((field) => (
        Array.isArray(topic?.[field])
          && topic[field].some((line) => typeof line === 'string' && line.trim())
      ));
    })
    .map(({ key }) => key);
}

function healthResultFromEntry(entry) {
  if (entry?.healthAssessed !== true) return null;
  return {
    healthAssessed: true,
    scientific: entry.healthScientific || entry.scientific || null,
    healthScientific: entry.healthScientific || entry.scientific || null,
    healthCheckedAt: entry.healthCheckedAt || null,
    sourceProvider: entry.healthSourceProvider || null,
    resultLanguage: entry.healthResultLanguage || null,
    disease: entry.disease ?? null,
  };
}

function healthFields(result) {
  if (!result) return {};
  const fields = {
    healthAssessed: true,
    disease: result.disease ?? null,
  };
  const scientific = result.healthScientific || result.scientific;
  if (scientific) fields.healthScientific = scientific;
  if (result.healthCheckedAt) fields.healthCheckedAt = result.healthCheckedAt;
  if (result.sourceProvider) fields.healthSourceProvider = result.sourceProvider;
  if (result.resultLanguage) fields.healthResultLanguage = result.resultLanguage;
  return fields;
}

// TopicDoor saiu daqui (tela principal rica - video do concorrente, 20/08):
// Usos / Significado cultural / Partes comestiveis / Propagacao voltaram a ser
// SectionCard inline com o texto real. As portas que restam sao os cards da
// grade de fatos (rega/luz/solo/seguranca), cujo manual profundo vive na aba.

export default function PlantDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, photoBase64, fromIdentify, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.plant;
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const unsavedObservationKey = observationSubjectKey({ ...plant, savedId: null }, null);
  const observationKey = savedEntryId
    ? observationSubjectKey(plant, savedEntryId)
    : unsavedObservationKey;
  const detachedObservationKey = React.useRef(null);
  const [lastWateredAt, setLastWateredAt] = useState(plant.lastWateredAt || null);
  const [wateringBusy, setWateringBusy] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState(() => healthResultFromEntry(plant));
  const [healthError, setHealthError] = useState(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  // A ficha botanica sempre entrega todo o dossie verdadeiro. Os wrappers de
  // profundidade continuam apenas para preservar a ordem editorial existente;
  // com Expert fixo, nenhuma preferencia antiga do onboarding esconde dados.
  const resultDepth = RESULT_DEPTHS.EXPERT;
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  const enrichment = enrichmentTaxon(plant.identityV1, {
    scientificName: plant.scientific,
    gbifKey: plant.gbifId,
  });
  const enrichmentScientific = enrichment?.canonicalName || null;
  const dossierLookupKey = `plant|${i18n.language}|${enrichmentScientific || ''}`;
  const [speciesDossierState, setSpeciesDossierState] = useState({ key: null, dossier: null });
  const speciesDossier = speciesDossierState.key === dossierLookupKey
    ? speciesDossierState.dossier
    : null;
  const speciesDossierLoading = Boolean(enrichmentScientific)
    && speciesDossierState.key !== dossierLookupKey;
  // Familia e ordem sustentam apenas o guia geral. O binomio desta identidade
  // continua nulo ate a confirmacao exata, impedindo que um palpite de especie
  // libere USDA, GBIF, adubacao ou diagnostico especifico.
  const groupGuideEntity = {
    category: 'plant',
    scientific: enrichmentScientific,
    family: plant.family || null,
    ord: plant.ord || null,
  };

  useEffect(() => {
    let alive = true;
    // Wikipedia so entra depois que identityV1 confirmou o binomio. O estado
    // carrega a chave junto do resultado para uma especie nunca herdar o texto
    // da anterior durante troca de rota ou idioma.
    if (!enrichmentScientific) return () => { alive = false; };
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'plant',
      scientific: enrichmentScientific,
      language: i18n.language,
    }).then(
      (dossier) => {
        if (alive) setSpeciesDossierState({ key: dossierLookupKey, dossier });
      },
      () => {
        if (alive) setSpeciesDossierState({ key: dossierLookupKey, dossier: null });
      }
    );
    return () => { alive = false; };
  }, [dossierLookupKey, enrichmentScientific, i18n.language]);

  useEffect(() => {
    (async () => {
      if (!plant.savedId) return;
      const list = await getCollection();
      const found = list.find((p) => p.savedId === plant.savedId);
      if (found) {
        setSaved(true);
        setSavedEntryId(found.savedId);
        setLastWateredAt(found.lastWateredAt || null);
        setHealthResult(healthResultFromEntry(found));
      } else {
        setSaved(false);
        setSavedEntryId(null);
        setLastWateredAt(null);
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
      const entry = await saveToCollection({ ...plant, ...healthFields(healthResult) });
      if (entry) {
        const savedObservationKey = observationSubjectKey(entry, entry.savedId);
        if (previousObservationKey && savedObservationKey) {
          await moveObservationSubject(previousObservationKey, savedObservationKey);
          detachedObservationKey.current = null;
        }
        trackResultSaved({ category: 'plant' });
        // Save-mission credit (idempotent - see components/missions.js).
        recordMissionEvent('save').then((done) => {
          if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
        });
        setSaved(true);
        setSavedEntryId(entry.savedId);
        // Salvar identifica a planta; nao prova que ela acabou de ser regada.
        setLastWateredAt(entry.lastWateredAt || null);
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

  // edibleParts/propagation nao voltam pra ficha: eles tem card proprio na
  // banda de baixo (tela principal rica - video do concorrente, 20/08).
  const familyText = technicalText(plant.family);
  const originText = technicalText(plant.origin);
  const infoRows = [
    // Identificacoes antigas salvaram "familia / genero" como se fosse origem
    // nativa. Esse valor taxonomico nao e geografia e precisa ficar oculto.
    { label: t('common.nativeOrigin'), value: familyText && originText?.toLowerCase().startsWith(familyText.toLowerCase() + ' /') ? null : originText },
    { label: t('detail.wateringNeeds'), value: technicalText(plant.waterLabel || plant.water) },
    { label: t('detail.synonyms'), value: technicalText(plant.synonyms) },
  ].filter((r) => r.value);

  // Auditoria de diagramacao 20/08: quando o vendor nao tem nome comum ele
  // devolve name === scientific, e a primeira dobra imprimia o mesmo latim
  // duas vezes. Nesse caso a linha do cientifico some (o speaker nao se
  // perde - ele encosta no proprio nome logo abaixo).
  const showScientific = !!plant.scientific && plant.scientific !== plant.name;

  const groupKey = getSpeciesGroup(groupGuideEntity);
  const groupTopicLookupKey = `${i18n.language}|${groupKey || ''}`;
  const [groupTopicState, setGroupTopicState] = useState({ key: null, keys: [] });
  const groupTopicKeys = groupTopicState.key === groupTopicLookupKey
    ? groupTopicState.keys
    : [];
  const groupTopicsLoading = Boolean(groupKey) && groupTopicState.key !== groupTopicLookupKey;

  useEffect(() => {
    let alive = true;
    if (!groupKey) {
      setGroupTopicState({ key: groupTopicLookupKey, keys: [] });
      return () => { alive = false; };
    }
    getGroups(i18n.language).then(
      (groups) => {
        if (alive) {
          setGroupTopicState({
            key: groupTopicLookupKey,
            keys: availableGroupTopicKeys(groups, groupKey),
          });
        }
      },
      () => {
        if (alive) setGroupTopicState({ key: groupTopicLookupKey, keys: [] });
      }
    );
    return () => { alive = false; };
  }, [groupKey, groupTopicLookupKey, i18n.language]);

  // Abas do manual CareTopics: APROFUNDAMENTO, nao o unico endereco do texto
  // (tela principal rica - video do concorrente, 20/08). Cada card da grade de
  // fatos abre a aba do seu topico; uses/cultural/edible/propagation continuam
  // na lista porque tambem sao abas la, mas agora vivem inline no resultado.
  // Only topics with real text ship - the manual filters again anyway.
  const listText = (v) => (Array.isArray(v) ? v.map((x) => '• ' + x).join('\n') : v);
  const baseTopics = [
    {
      key: 'watering',
      label: t('detail.wateringGuideSection'),
      text: plant.bestWatering,
      // O campo estruturado e intensidade. Ele alimenta o nivel visual, mas
      // nao pode virar um intervalo que o fornecedor nunca informou.
      shortValue: shortFact('water', plant.waterLabel || plant.water, t),
      level: /high/i.test(plant.water || '') ? 3 : /medium/i.test(plant.water || '') ? 2 : /low/i.test(plant.water || '') ? 1 : undefined,
    },
    { key: 'light', label: t('detail.lightSection'), text: plant.bestLightCondition },
    { key: 'soil', label: t('detail.soilSection'), text: plant.bestSoilType },
    { key: 'safety', label: t('detail.safetySection'), text: plant.toxicity },
    { key: 'uses', label: t('detail.commonUsesSection'), text: plant.commonUses },
    { key: 'cultural', label: t('detail.culturalSignificanceSection'), text: plant.culturalSignificance },
    { key: 'edible', label: t('detail.edibleParts'), text: listText(plant.edibleParts) },
    { key: 'propagation', label: t('detail.propagation'), text: listText(plant.propagationMethods) },
    { key: 'overview', label: t('common.overview'), text: plant.overview },
  ].filter((tp) => tp.text);
  const sourceTopics = buildSourceGroundedTopics({ dossier: speciesDossier });
  const topics = mergeSourceGroundedTopics(baseTopics, sourceTopics);
  groupTopicKeys.forEach((key) => {
    if (topics.some((topic) => topic.key === key)) return;
    const definition = BOTANICAL_GROUP_TOPIC_DEFS.find((topic) => topic.key === key);
    if (definition) topics.push({ key, label: t(definition.labelKey), groupOnly: true });
  });
  const topicsLoading = groupTopicsLoading || speciesDossierLoading;
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'plant',
    language: i18n.language,
    routeKey: route.key,
    identity: plant.savedId || plant.scientific || plant.name,
  });
  usePublishSpeciesTopics(topicResourceKey, topics, topicsLoading);

  // initialProblem: indice do acordeao de problemas, so quando a porta e um
  // card do carrossel "Problemas Comuns" (paridade 120%). undefined nas outras
  // portas, e ai o CareTopics abre o primeiro acordeao como sempre.
  const openTopic = (initialKey, initialProblem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('CareTopics', { groupKey,
      title: plant.name,
      accent: meta.accent,
      category: 'plant',
      topics,
      topicsLoading,
      topicResourceKey,
      initialKey,
      initialProblem,
    });
  };

  // Gancho da especialista (hub do resultado, video do concorrente): leva a
  // especie junto como contexto pro chat do Botanico (tab irmao no App.js).
  const openSpecialist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Botanist', {
      context: plant.name + ' (' + (plant.scientific || '') + ')',
    });
  };

  const wateringStatus = saved ? getWateringStatus({ ...plant, lastWateredAt }) : null;

  const handleMarkWatered = async () => {
    if (!savedEntryId || wateringBusy) return;
    setWateringBusy(true);
    let result = null;
    try {
      result = await markCollectionWatered(savedEntryId);
    } catch (e) {
      result = null;
    } finally {
      setWateringBusy(false);
    }
    if (result) {
      setLastWateredAt(result.lastWateredAt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
    }
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.plant.label'));
  };

  const handleCheckHealth = async () => {
    if (!photoBase64 || healthChecking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHealthChecking(true);
    setHealthError(null);
    try {
      const cropEntity = await identify('crop', photoBase64);
      const expectedSpecies = canonicalBinomial(enrichmentScientific);
      const checkedSpecies = canonicalBinomial(cropEntity?.scientific);
      // O segundo modelo tambem classifica a cultura. Um laudo de algodao nao
      // pode entrar no perfil de milho so porque a foto veio da mesma tela.
      if (!expectedSpecies || !checkedSpecies || expectedSpecies !== checkedSpecies) {
        setHealthResult(null);
        setHealthError(t('detail.healthSpeciesMismatch'));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const acceptedResult = {
        ...cropEntity,
        healthAssessed: true,
        healthScientific: cropEntity.scientific,
        healthCheckedAt: new Date().toISOString(),
        disease: cropEntity.disease ?? null,
      };
      setHealthResult(acceptedResult);
      if (savedEntryId) {
        const updated = await updateCollectionEntry(savedEntryId, healthFields(acceptedResult));
        if (!updated) showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err.paymentRequired) {
        setPaywallVisible(true);
        return;
      }
      setHealthError(err.message || t('identify.identificationFailedDefault'));
    } finally {
      setHealthChecking(false);
    }
  };

  const handleSubscribe = async (plan) => {
    setSubscribing(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setSubscribing(false);
      showAlert(t('paywall.checkoutFailedTitle'), e.message || t('paywall.checkoutFailedBody'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas (diagramacao-premium): FIRST child of the root,
          pointerEvents none inside the component, and the root keeps its own
          backgroundColor underneath - decoration never steals a touch. */}
      <NatureScene accent={meta.accent} />

      <TopBar
        title={t('detail.profileTitle', { category: t('categories.plant.label') })}
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
        {/* Hero compacto (auditoria de diagramacao 20/08): 220 -> 150, pra
            primeira dobra caber FATO e nao so foto. `height` ja era prop
            opcional do PlantHero - passar 150 daqui mantem o default de 220
            intacto pras outras 6 telas de resultado. */}
        <PlantHero
          photoUri={plant.photoUri}
          similarImages={plant.similarImages}
          scientific={enrichmentScientific}
          identityV1={plant.identityV1}
          accent={meta.accent}
          icon={meta.tabIcon}
          height={150}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            {/* Speaker do concorrente (hub do resultado): ouvir o latim.
                Sem nome comum (name === scientific) a linha de baixo nao
                repete o latim - o speaker vem junto do nome (auditoria de
                diagramacao 20/08). */}
            <View style={styles.scientificRow}>
              <Text style={styles.name}>{plant.name}</Text>
              {!!plant.scientific && !showScientific && <Pronounce text={plant.scientific} />}
            </View>
            {showScientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {/* The names people actually call this plant belong with its
                name (hub do resultado, video do concorrente). */}
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

        {/* ORDEM DO SCROLL - auditoria de diagramacao 20/08 ("fato antes de
            prosa"): a primeira dobra entregava zero fato sobre a especie. O
            chip de categoria saiu daqui - o header ja diz "Perfil de Planta" e
            o dock repete; era ruido puro. Agora vem seguranca -> evidencia ->
            fatos, e mapa/visao geral descem pra depois deles.
            "Quente primeiro": havendo toxicidade, ela abre ANTES da grade -
            responde o medo que trouxe o usuario aqui. Sem toxicidade a banda
            inteira nao renderiza (nunca um card vazio). */}
        {!!plant.toxicity && (
          <ZoneBand gutter={20}>
            <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={colors.error}>
              {/* NUNCA colapsado. Colapsado em 1 frase, uma prosa que comeca
                  com "Nao e toxica para humanos." e segue com "E FATAL para
                  gatos." mostrava so a primeira metade e escondia a que
                  importa - o usuario le exatamente o contrario do aviso.
                  Nenhum ganho de diagramacao paga isso (auditoria 20/08). */}
              <Text style={styles.body}>{plant.toxicity}</Text>
            </SectionCard>
          </ZoneBand>
        )}

        <LensRevealCard
          confidence={plant.confidence}
          summary={plant.overview}
          accent={meta.accent}
          critical={!!plant.toxicity}
        />
        <PlantFertilizerCard
          category="plant"
          scientific={enrichmentScientific}
          groupKey={groupKey}
          entityName={plant.name}
          defaultExpanded={resultDepth === RESULT_DEPTHS.EXPERT}
          accent={meta.accent}
        />
        <TopicNavigatorCard
          topics={topics}
          accent={meta.accent}
          onOpen={openTopic}
          loading={groupTopicsLoading || speciesDossierLoading}
        />
        <NextBestCaptureCard
          category="plant"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'plant', fromIdentify })}
        />

        {/* O dossie de 146 mil avaliacoes mostrou que confiar no resultado e
            uma necessidade anterior ao cuidado. Fotos de referencia, especies
            alternativas e o alerta de baixa confianca agora aparecem logo
            depois do risco. Os dados ja vieram da identificacao; se nenhum
            existir, o componente inteiro some. */}
        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <IdentificationExtras entity={plant} identityV1={plant.identityV1} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.ESSENTIAL}>
          <DiscoveryReceiptCard
            outcome={scanOutcome}
            request={scanOutcomeRequest}
            accent={meta.accent}
            automaticSaveConfirmed={fromIdentify === true && !!plant.savedId}
            riskLevel={plant.toxicity ? 'danger' : null}
          />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <DidacticFieldGuide category="plant" entity={plant} accent={meta.accent} />
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

        {/* Quick facts (auditoria de diagramacao 20/08): um componente so
            (QuickFactGrid) no lugar do bloco copiado, e VALOR curto no lugar
            da prosa truncada. Luz/solo/toxicidade passam pelo shortFact - se
            a prosa do vendor nao casar palavra-chave nenhuma o card some em
            vez de mostrar meia frase; a prosa inteira continua na aba do
            manual. Rega ja vinha curta (rotulo do proprio vendor). */}
        {topics.length > 0 && (
          <QuickFactGrid
            accent={meta.accent}
            facts={[
              {
                key: 'watering',
                icon: 'water-outline',
                color: colors.info,
                label: t('detail.wateringGuideSection'),
                // Nivel curto, nunca o rotulo composto do vendor: era
                // ele que truncava em 'Baixa (pr...' (auditoria 20/08).
                value: shortFact('water', plant.waterLabel || plant.water, t),
                onPress: () => openTopic('watering'),
              },
              {
                key: 'light',
                icon: 'sunny-outline',
                color: colors.warning,
                label: t('detail.lightSection'),
                value: shortFact('light', plant.bestLightCondition, t),
                onPress: () => openTopic('light'),
              },
              {
                key: 'soil',
                icon: 'layers-outline',
                color: colors.purple,
                label: t('detail.soilSection'),
                value: shortFact('soil', plant.bestSoilType, t),
                onPress: () => openTopic('soil'),
              },
              {
                key: 'safety',
                icon: 'warning-outline',
                color: colors.error,
                label: t('detail.safetySection'),
                value: shortFact('toxicity', plant.toxicity, t),
                onPress: () => openTopic('safety'),
              },
            ]}
          />
        )}

        {/* Condicao + cronograma no ponto quente. O antigo card mensal colava o
            mes atual em um METODO de propagacao e inventava quando propagar. O
            cronograma usa o corpus por estacao e hemisferio; sem base, some. */}
        <CareConditions plant={plant} onOpenTopic={openTopic} />
        <CareSchedule
          groupKey={groupKey}
          entityName={plant.name}
          hideFertilizing
          accent={meta.accent}
        />

        {/* Perfil de cuidado + Problemas Comuns - paridade 120% (video do
            concorrente, 20/08). O card de dificuldade dele e o carrossel de
            problemas, ambos honestos: a dificuldade sai do GRUPO (dossies em
            docs/agronomia/grupos) com a rega real da especie ao lado, e os
            problemas sao os do manual editorial que ja existe - nenhum dos dois
            renderiza sem base. Sem foto de sintoma de proposito. */}
        <CareProfile groupKey={groupKey} plant={plant} accent={meta.accent} />
        <CommonProblems
          topics={topics}
          entityName={plant.name}
          accent={meta.accent}
          onOpen={openTopic}
        />

        {/* Mapa de distribuicao REAL (GBIF) - o concorrente desenha o dele;
            este e ciencia com credito. Some sozinho sem match/offline. */}
        <DistributionMap scientific={plant.scientific} gbifId={plant.gbifId} identityV1={plant.identityV1} accent={meta.accent} />

        {/* Destaque da estacao (paridade 120% - video do concorrente, 20/08):
            onde ele desenha um grafico de estacao generico, aqui e o
            histograma REAL de ocorrencias por mes da especie no GBIF. Some
            sozinho com menos de 30 registros datados. */}
        <SeasonChart scientific={plant.scientific} gbifId={plant.gbifId} identityV1={plant.identityV1} accent={meta.accent} />

        {/* Zona de cor (diagramacao-premium): each thematic run of sections
            lives in a full-bleed band one shade above the background; the gap
            between bands is the scene showing through. ZoneBand is a pure
            wrapper. A visao geral e PROSA, entao vem depois do fato
            (auditoria de diagramacao 20/08); a seguranca continua sendo a
            unica prosa que abre a tela. */}
        {!!plant.overview && (
          <ZoneBand gutter={20}>
            <SectionCard icon="leaf-outline" title={t('common.overview')} color={meta.accent}>
              <Text style={styles.body}>{plant.overview}</Text>
              <VendorSourceCredit
                provider={plant.sourceProvider}
                citation={plant.overviewCitation}
                licenseName={plant.overviewLicense}
                licenseUrl={plant.overviewLicenseUrl}
              />
            </SectionCard>
          </ZoneBand>
        )}

        {/* Monta sempre: a consulta USDA e exata por especie e nao pode ser
            escondida por uma guarda baseada nos campos opcionais do vendor.
            O proprio componente retorna null sem especie nem grupo. */}
        <SpeciesCareCard
          scientific={enrichmentScientific}
          groupKey={groupKey}
          entityName={plant.name}
          hideFertility
          accent={meta.accent}
        />

        {/* A banda de acoes continua guardada para nunca produzir um bloco
            vazio enquanto SpeciesCareCard resolve seus dados assincronos. */}
        {!!(wateringStatus || photoBase64 || healthResult || healthError) && (
        <ZoneBand gutter={20}>
        {!!wateringStatus && (
          <SectionCard icon="water-outline" title={t('detail.wateringSection')} color={colors.info}>
            <View style={styles.wateringRow}>
              <Text style={[styles.wateringLabel, { color: colors.textSecondary }]}>
                {wateringStatus.untracked
                  ? t('detail.waterCheckToday')
                  : t('specimen.timelineWatered')}
              </Text>
              <TouchableOpacity
                style={[styles.waterBtn, wateringBusy && { opacity: 0.55 }]}
                activeOpacity={0.85}
                onPress={handleMarkWatered}
                disabled={wateringBusy}
                accessibilityRole="button"
                accessibilityState={{ busy: wateringBusy, disabled: wateringBusy }}
                accessibilityLabel={t('detail.markAsWateredLabel')}
              >
                {wateringBusy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons
                    name={wateringStatus.untracked ? 'water' : 'checkmark-circle'}
                    size={16}
                    color={colors.white}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                )}
                <Text style={styles.waterBtnText}>{t('detail.markAsWatered')}</Text>
              </TouchableOpacity>
            </View>
          </SectionCard>
        )}

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium): the
            Touchable stays byte for byte - a11y, labels and handlers intact. */}
        {!!photoBase64 && !healthResult && (
          <PressScale>
          <TouchableOpacity
            style={[styles.healthBtn, healthChecking && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleCheckHealth}
            disabled={healthChecking}
            accessibilityRole="button"
            accessibilityLabel={healthChecking ? t('detail.checkingForDiseasesLabel') : t('detail.checkForDiseasesLabel')}
          >
            <Ionicons
              name="medkit-outline"
              size={18}
              color={colors.white}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.healthBtnText}>
              {healthChecking ? t('detail.checkingForDiseases') : t('detail.checkForDiseases')}
            </Text>
          </TouchableOpacity>
          </PressScale>
        )}

        {!!healthError && (
          <Text style={styles.healthErrorText}>{healthError}</Text>
        )}

        {!!healthResult && (
          <SectionCard icon="medkit-outline" title={t('detail.healthCheckSection')} color={colors.info}>
            <DiseaseReport disease={healthResult.disease} provider={healthResult.sourceProvider} />
          </SectionCard>
        )}
        </ZoneBand>
        )}

        {/* Ficha/recibo band: story context and the technical rows close the
            screen as a receipt. Guarded like the care band.

            TELA PRINCIPAL RICA (video do concorrente, 20/08): estas quatro
            secoes tinham virado card-porta de uma linha truncada, e o
            conhecimento sumiu da tela de resultado. O concorrente empilha
            Usos / Historia / Adaptacao INLINE no resultado - a aba e
            aprofundamento, nao o unico endereco do texto. Voltaram a ser
            SectionCard com o texto real, colapsado no ExpandableText (1a
            frase + "Ver mais"). As portas ficam SO em rega/luz/solo/seguranca
            (grade de fatos acima), onde o manual profundo por topico e o
            valor da aba. Campo ausente = bloco nao renderiza; listText('')
            cobre tambem a lista vazia que o vendor as vezes devolve. */}
        {!!(plant.commonUses || plant.culturalSignificance || listText(plant.edibleParts) || listText(plant.propagationMethods) || familyText || technicalText(plant.ord) || infoRows.length > 0) && (
        <ZoneBand gutter={20}>
        {!!plant.commonUses && (
          <SectionCard icon="construct-outline" title={t('detail.commonUsesSection')} color={meta.accent}>
            <ExpandableText text={plant.commonUses} textStyle={styles.body} accent={meta.accent} />
          </SectionCard>
        )}

        {!!plant.culturalSignificance && (
          <SectionCard icon="book-outline" title={t('detail.culturalSignificanceSection')} color={colors.purple}>
            <ExpandableText text={plant.culturalSignificance} textStyle={styles.body} accent={meta.accent} />
          </SectionCard>
        )}

        {!!listText(plant.edibleParts) && (
          <SectionCard icon="restaurant-outline" title={t('detail.edibleParts')} color={meta.accent}>
            <ExpandableText text={listText(plant.edibleParts)} textStyle={styles.body} accent={meta.accent} />
            {/* O mesmo aviso que a tela de Cogumelo carrega, colado na
                afirmacao que ele desmente. FORA do ExpandableText de
                proposito: "Partes Comestiveis" e uma afirmacao de comida, e um
                aviso escondido atras de "Ver mais" nao e aviso. Reusa
                terms.accuracyBody - mesma fonte de verdade, ja traduzida nos
                17 idiomas, nenhuma chave nova. */}
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
          </SectionCard>
        )}

        {!!listText(plant.propagationMethods) && (
          <SectionCard icon="flower-outline" title={t('detail.propagation')} color={colors.info}>
            <ExpandableText text={listText(plant.propagationMethods)} textStyle={styles.body} accent={meta.accent} />
          </SectionCard>
        )}

        <TaxonomyTrail
          order={plant.ord}
          family={plant.family}
          scientific={plant.scientific}
          accent={meta.accent}
        />

        {infoRows.length > 0 && (
          <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
            {infoRows.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} />
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
            accessibilityLabel={t('detail.readMoreLabel', { category: t('categories.plant.label').toLowerCase() })}
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

        {/* Gancho da especialista (hub do resultado, video do concorrente):
            apos a leitura, a duvida vai com a especie pro chat do Botanico. */}
        <TouchableOpacity
          style={styles.specialistRow}
          onPress={openSpecialist}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('detail.askSpecialistCta')}
        >
          <Ionicons
            name="sparkles"
            size={16}
            color={meta.accent}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.specialistText, { color: meta.accent }]}>
            {t('detail.askSpecialistCta')}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium). */}

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Compartilhe sua planta - tela principal rica (video do concorrente,
            20/08): o motor de share ja existia, mas so atras do icone de 20px
            da TopBar. Aqui ele vira convite, no fim da leitura. */}
        <ShareSpeciesCard
          entity={plant}
          categoryLabel={t('categories.plant.label')}
          accent={meta.accent}
        />

        <CommunityInviteCard accent={meta.accent} mode="care" />

        {/* "Duvidas frequentes" - paridade 120% (video do concorrente,
            20/08): o FAQ fixo dele vira pergunta SUGERIDA que abre a
            especialista ja com a duvida escrita e a especie como contexto. */}
        <SpeciesFaq
          category="plant"
          name={plant.name}
          scientific={plant.scientific}
          accent={meta.accent}
          navigation={navigation}
        />

        {/* Feedback no fim do scroll (hub do resultado, video do concorrente). */}
        <HelpfulRow category="plant" context="result" />
        </ResultDepthLayer>
      </ScrollView>

      {/* Barra de acoes fixa do resultado (hub do resultado, video do
          concorrente): Nova foto | Compartilhar | Salvar sempre a um toque -
          substitui o SaveFab. Absolute WITHIN the screen; the scroll content
          above carries paddingBottom >= 120 so the bar never hides the last
          row. */}
      <ResultActionBar
        onNew={fromIdentify ? () => navigation.goBack() : null}
        onShare={handleShare}
        onSave={toggleSave}
        saved={saved}
        savedId={savedEntryId}
        accent={meta.accent}
      />

      <PaywallModal
        visible={paywallVisible}
        categoryLabel={t('categories.crop.label').toLowerCase()}
        accent={meta.accent}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onCancel={() => setPaywallVisible(false)}
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
  // marginBottom repoe o respiro que o chip de categoria removido dava
  // (auditoria de diagramacao 20/08).
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, marginBottom: 8 },
  // flexShrink: o nome agora divide a linha com o speaker quando o vendor nao
  // manda nome comum.
  name: { fontSize: 24, fontWeight: '800', color: colors.text, flexShrink: 1 },
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
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  // Copia literal do aviso da tela de Cogumelo, para as duas lerem igual.
  edibilityNote: {
    flexDirection: 'row',
    backgroundColor: colors.warning + '14',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.warning + '3C',
    alignItems: 'flex-start',
  },
  edibilityNoteText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, marginLeft: 10, lineHeight: 18 },
  // Estilos do card-porta sairam com o TopicDoor (tela principal rica - video
  // do concorrente, 20/08): as portas que restaram sao os cards da grade de
  // fatos, que vivem em components/QuickFactGrid.js.
  specialistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  specialistText: { fontSize: 14, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  wateringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wateringLabel: { fontSize: 13.5, fontWeight: '600', flexShrink: 1, marginRight: 12 },
  waterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.info,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  waterBtnText: { color: colors.white, fontWeight: '700', fontSize: 12.5, marginLeft: 6 },
  healthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  healthBtnText: { color: colors.white, fontWeight: '700', fontSize: 14.5, marginLeft: 8 },
  healthErrorText: { color: colors.error, fontSize: 13, marginBottom: 16, textAlign: 'center' },
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
