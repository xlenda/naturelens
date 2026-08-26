import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PlantHero from '../components/PlantHero';
import SectionCard from '../components/SectionCard';
import IdentificationExtras from '../components/IdentificationExtras';
import DidacticFieldGuide from '../components/DidacticFieldGuide';
import DiscoveryReceiptCard from '../components/DiscoveryReceiptCard';
import { enrichmentTaxon } from '../components/taxonIdentity';
import { insectRedListLabel } from '../components/insectRedList';
import VendorSourceCredit from '../components/VendorSourceCredit';
import TaxonomyTrail from '../components/TaxonomyTrail';
import SeasonChart from '../components/SeasonChart';
import { colors } from '../components/theme';
import { getCollection, saveToCollection, removeFromCollection } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { getSpeciesGroup } from '../components/speciesGroup';
import { getGroups } from '../components/groupContent';
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
import shortFact from '../components/shortFact';
import ExpandableText from '../components/ExpandableText';
import DistributionMap from '../components/DistributionMap';
import GroupGuideCard from '../components/GroupGuideCard';
import ExactSpeciesGuide from '../components/ExactSpeciesGuide';
import DynamicSpeciesDossier from '../components/DynamicSpeciesDossier';
import DynamicPestManagementCard from '../components/DynamicPestManagementCard';
import { API_BASE } from '../components/apiBase';
import { getSpeciesDossier } from '../components/speciesDossier';
import { buildInsectDossierTopics } from '../components/insectDossierTopics';
import {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} from '../components/sourceGroundedTopics';
import { getCuratedDetail } from '../components/curatedDetails';
import LensRevealCard from '../components/LensRevealCard';
import NextBestCaptureCard from '../components/NextBestCaptureCard';
import { retakeResult } from '../components/resultRetake';
import { RESULT_DEPTHS, ResultDepthLayer } from '../components/ResultDepthSwitcher';
import {
  observationSubjectKey,
  moveObservationSubject,
} from '../components/observationStorage';

function Tag({ label, color }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
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

// Campos do insect.id normalmente chegam como arrays, mas uma colecao antiga,
// um sync parcial ou uma mudanca de schema do fornecedor pode trazer uma string
// ou um objeto. A tela nunca chama join/map/some antes de passar por esta borda.
export function normaliseInsectTextList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

// `translateEntity` falha aberto para nao perder o resultado da identificacao.
// Isso e correto para a identidade, mas nao autoriza imprimir prosa inglesa no
// meio de uma interface em outro idioma. `resultLanguage=en` e prova direta; os
// marcadores cobrem o timeout em que a proveniencia ja tinha o idioma solicitado
// mas role/dangerDescription continuaram intocados. Na duvida o campo some.
export function readerSafeInsectText(value, language, resultLanguage) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const reader = String(language || 'en').trim().toLowerCase().replace('_', '-').split('-')[0];
  const source = String(resultLanguage || '').trim().toLowerCase().replace('_', '-').split('-')[0];
  if (reader === 'en') return text;
  if (source === 'en') return null;

  const rawEnglish = /\b(the|and|or|of|to|from|with|without|this|that|these|those|is|are|can|may|insect|species|adult|adults|larva|larvae|feeds?|lives?|found|common|pollinat(?:e|es|or|ors|ing)|predator|prey|pest|parasite|parasitoid|herbivore|carnivore|omnivore|decomposer|scavenger|allergenic|venomous|bites?|stings?|disease transmission)\b/i;
  return rawEnglish.test(text) ? null : text;
}

const HIGH_RISK_TAGS = [
  'bites or stings',
  'bites pets',
  'allergenic',
  'disease transmission',
  'mildly venomous',
  'highly venomous',
];

const GROUP_TOPIC_META = Object.freeze([
  Object.freeze({ key: 'safety', labelKey: 'detail.safetySection', icon: 'shield-checkmark-outline' }),
  Object.freeze({ key: 'role', labelKey: 'detail.ecologicalRoleSection', icon: 'leaf-outline' }),
  Object.freeze({ key: 'uses', labelKey: 'detail.fundamentals', icon: 'compass-outline' }),
]);

export function buildInsectGroupTopics(group, translate) {
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

export function mergeInsectTopics(primary = [], groupTopics = []) {
  const merged = primary.slice();
  const keys = new Set(merged.map((topic) => topic?.key).filter(Boolean));
  for (const topic of groupTopics) {
    if (!topic?.key || keys.has(topic.key)) continue;
    merged.push(topic);
    keys.add(topic.key);
  }
  return merged;
}

export default function InsectDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.insect;
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  // A chave do snapshot impede que o guia do grupo anterior seja tratado como
  // pronto enquanto taxonomia e idioma ainda estao mudando.
  const [groupGuideState, setGroupGuideState] = useState({ key: null, guide: null });
  // O dono escolheu uma ficha unica para insetos: Tecnico significa o conjunto
  // completo e inclui as camadas essencial e visual. Nenhuma preferencia antiga
  // do onboarding pode voltar a esconder o dossie nesta categoria.
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
  const dossierLookupKey = `insect|${i18n.language}|${enrichmentScientific || ''}`;
  const [curatedState, setCuratedState] = useState({ key: null, detail: null });
  const [speciesDossierState, setSpeciesDossierState] = useState({ key: null, dossier: null });
  const curated = curatedState.key === dossierLookupKey ? curatedState.detail : null;
  const speciesDossier = speciesDossierState.key === dossierLookupKey
    ? speciesDossierState.dossier
    : null;
  const curatedLoading = Boolean(enrichmentScientific)
    && curatedState.key !== dossierLookupKey;
  const speciesDossierLoading = Boolean(enrichmentScientific)
    && speciesDossierState.key !== dossierLookupKey;

  useEffect(() => {
    let alive = true;
    // Curadoria por especie obedece ao mesmo portao do dossie dinamico. Um
    // binomio candidato ou um genero visivel nunca destrava texto especifico.
    if (!enrichmentScientific) return () => { alive = false; };
    getCuratedDetail(i18n.language, 'insect', enrichmentScientific).then(
      (detail) => {
        if (alive) setCuratedState({ key: dossierLookupKey, detail });
      },
      () => {
        if (alive) setCuratedState({ key: dossierLookupKey, detail: null });
      }
    );
    return () => {
      alive = false;
    };
  }, [dossierLookupKey, i18n.language, enrichmentScientific]);

  useEffect(() => {
    let alive = true;
    if (!enrichmentScientific) return () => { alive = false; };
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'insect',
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
        trackResultSaved({ category: 'insect' });
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

  const rawDanger = normaliseInsectTextList(plant.danger);
  const candidateDangerLabels = normaliseInsectTextList(plant.dangerLabel);
  const rawRole = normaliseInsectTextList(plant.role);
  const readerLanguage = i18n.language;
  const resultLanguage = plant.resultLanguage;
  const readerIsEnglish = String(readerLanguage || 'en').toLowerCase().split(/[-_]/)[0] === 'en';
  const dangerLabelsByIndex = rawDanger.map((raw, index) => {
    const candidate = candidateDangerLabels[index] || (readerIsEnglish ? raw : null);
    if (!candidate) return null;
    // Quando o tradutor falha depois de preparar os rotulos, dangerLabel e uma
    // copia byte a byte da chave crua. Ela continua servindo para cor, nao texto.
    if (!readerIsEnglish && candidate.toLocaleLowerCase() === raw.toLocaleLowerCase()) return null;
    return readerSafeInsectText(candidate, readerLanguage, resultLanguage);
  });
  const visibleDangerLabels = dangerLabelsByIndex.filter(Boolean);
  const visibleRole = rawRole
    .map((value) => readerSafeInsectText(value, readerLanguage, resultLanguage))
    .filter(Boolean);
  const visibleDangerDescription = readerSafeInsectText(
    plant.dangerDescription,
    readerLanguage,
    resultLanguage
  );
  const hasDanger = rawDanger.length > 0;
  const dangerColor = rawDanger.some((d) => HIGH_RISK_TAGS.includes(d.toLowerCase()))
    ? colors.error
    : colors.warning;
  const safetyFallback = hasDanger && visibleDangerLabels.length === 0 && !visibleDangerDescription
    ? t('lensReveal.safetyFirst')
    : null;
  const safetyText = [
    visibleDangerLabels.length ? '• ' + visibleDangerLabels.join('\n• ') : null,
    visibleDangerDescription,
    safetyFallback,
  ].filter(Boolean).join('\n\n');
  const hasSafetyEvidence = !!safetyText;
  const dossierTaxonomy = speciesDossier?.taxonomy || {};
  const groupKey = getSpeciesGroup({
    ...plant,
    // Um candidato nao ganha override por binomio. Familia e ordem continuam
    // servindo apenas ao guia geral, que se declara nao especifico da especie.
    scientific: enrichmentScientific,
    family: plant.family || dossierTaxonomy.family || null,
    ord: plant.ord || dossierTaxonomy.order || null,
  });
  const groupGuideLookupKey = `${i18n.language}|${groupKey || ''}`;
  const groupGuide = groupGuideState.key === groupGuideLookupKey
    ? groupGuideState.guide
    : null;
  const groupGuideLoading = Boolean(groupKey)
    && groupGuideState.key !== groupGuideLookupKey;
  // Insect.id also covers spiders, molluscs and other invertebrates. The broad
  // label stays true for every result without guessing a class the API lacks.
  const resultTypeLabel = t('detail.invertebrateLabel');
  const conservationLabel = insectRedListLabel(plant.redList, t);

  useEffect(() => {
    let alive = true;
    if (!groupKey) {
      setGroupGuideState({ key: groupGuideLookupKey, guide: null });
      return () => { alive = false; };
    }
    getGroups(i18n.language).then(
      (groups) => {
        if (alive) setGroupGuideState({
          key: groupGuideLookupKey,
          guide: groups?.[groupKey] || null,
        });
      },
      () => {
        if (alive) setGroupGuideState({ key: groupGuideLookupKey, guide: null });
      }
    );
    return () => { alive = false; };
  }, [groupGuideLookupKey, groupKey, i18n.language]);

  const infoRows = [
    { label: t('detail.family'), value: technicalText(plant.family || dossierTaxonomy.family) },
    { label: t('detail.order'), value: technicalText(plant.ord || dossierTaxonomy.order) },
    { label: t('detail.synonyms'), value: technicalText(plant.synonyms) },
    // O enum cru continua sendo evidencia; somente o rotulo padronizado e
    // traduzido pode chegar a interface. Objeto desconhecido falha fechado.
    { label: t('detail.conservationStatus'), value: conservationLabel },
  ].filter((r) => r.value);

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, resultTypeLabel);
  };

  // Hub do resultado (video do concorrente): o texto longo vira topicos do
  // manual da especie (CareTopicsScreen). So entra topico com conteudo REAL -
  // campo ausente nao gera aba.
  const overviewText = plant.overview || curated?.overview || null;
  const roleText = visibleRole.length ? '\u2022 ' + visibleRole.join('\n\u2022 ') : null;
  const habitatText = curated?.habitat || null;
  const detailsTopicText = infoRows.length
    ? infoRows.map((row) => `${row.label}: ${row.value}`).join('\n')
    : null;
  const evidenceTopicText = [
    enrichmentScientific ? `${t('common.identified')}: ${enrichmentScientific}` : null,
    Number.isFinite(plant.confidence) ? `${t('common.confidence')}: ${plant.confidence}%` : null,
    plant.sourceProvider ? `${t('learning.provider')}: ${plant.sourceProvider}` : null,
  ].filter(Boolean).join('\n');
  const baseTopics = [
    evidenceTopicText && {
      key: 'evidence',
      label: t('learning.evidenceTitle'),
      text: evidenceTopicText,
      icon: 'scan-outline',
    },
    roleText && {
      key: 'role',
      label: t('detail.ecologicalRoleSection'),
      text: roleText,
    },
    hasSafetyEvidence && {
      key: 'safety',
      label: t('detail.safetySection'),
      text: safetyText,
    },
    overviewText && {
      key: 'overview',
      label: t('common.overview'),
      text: overviewText,
    },
    habitatText && {
      key: 'habitat',
      label: t('fieldGuide.habitat'),
      text: habitatText,
    },
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
  const speciesTopics = buildInsectDossierTopics({
    scientific: enrichmentScientific,
    dossier: speciesDossier,
    order: plant.ord || dossierTaxonomy.order,
    taxonClass: plant.taxonClass || dossierTaxonomy.className,
    language: i18n.language,
    translate: t,
    baseTopics,
  });
  const sourceTopics = buildSourceGroundedTopics({
    dossier: speciesDossier,
    labels: {
      feeding: t('speciesDossier.diet'),
      reproduction: t('speciesDossier.reproduction'),
      lifeCycle: t('speciesDossier.lifeCycle'),
      habitat: t('fieldGuide.habitat'),
      behavior: t('observationWorkspace.eventTypes.insect.behavior'),
      ecology: t('detail.ecologicalRoleSection'),
      conservation: t('detail.conservationStatus'),
    },
  });
  const topics = mergeInsectTopics(
    mergeSourceGroundedTopics(speciesTopics, sourceTopics),
    buildInsectGroupTopics(groupGuide, t)
  );
  const topicsLoading = curatedLoading
    || speciesDossierLoading
    || groupGuideLoading;
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'insect',
    language: i18n.language,
    routeKey: route.key,
    identity: plant.savedId || enrichmentScientific || plant.scientific || plant.name,
  });
  usePublishSpeciesTopics(topicResourceKey, topics, topicsLoading);

  const openTopic = (initialKey, routeTopics = topics) =>
    navigation.navigate('CareTopics', { groupKey,
      title: plant.name,
      accent: meta.accent,
      category: 'insect',
      topics: routeTopics,
      topicsLoading,
      topicResourceKey,
      initialKey,
    });

  // Fatos rapidos (auditoria de diagramacao 20/08): valor CURTO de verdade.
  // As tags de `danger` ja sao rotulos curtos do vendor; `dangerDescription`
  // e prosa, entao passa pelo shortFact - e se nao casar palavra-chave o card
  // some em vez de mostrar meia frase (a prosa fica na aba do manual).
  const quickFacts = [
    topics.some((tp) => tp.key === 'safety') && {
      key: 'safety',
      icon: 'warning-outline',
      color: dangerColor,
      label: t('detail.safetySection'),
      value: visibleDangerLabels.length
        ? visibleDangerLabels.join(', ')
        : shortFact('toxicity', visibleDangerDescription, t) || safetyFallback,
    },
    topics.some((tp) => tp.key === 'role') && {
      key: 'role',
      icon: 'leaf-outline',
      color: colors.accent,
      label: t('detail.ecologicalRoleSection'),
      value: visibleRole.join(', '),
    },
  ];

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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

        {/* Safety leads ("quente primeiro"): for insects, "did the thing that
            just stung me matter?" is the question that opened the camera - it
            cannot sit below the encyclopedia paragraph. */}
        {/* Zona de cor (diagramacao-premium): thematic runs of sections live
            in full-bleed bands one shade above the background; the gap between
            bands is the scene showing through. ZoneBand is a pure wrapper -
            the quente-primeiro order stays byte for byte. */}
        {hasSafetyEvidence && (
        <ZoneBand gutter={20}>
          {/* Tela principal rica (video do concorrente, 20/08): a descricao de
              perigo agora abre a secao mesmo SEM tags - antes so existia
              acompanhando `danger`, entao um inseto com prosa de risco e
              nenhuma tag nao mostrava nada aqui. A prosa de risco vem inteira:
              cortar pode esconder justamente a parte grave. Sem os dois campos,
              a secao inteira nao renderiza. */}
          {hasSafetyEvidence && (
            <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={dangerColor}>
              {visibleDangerLabels.length > 0 && (
                <View style={styles.tagRow}>
                  {/* Rotulo traduzido pareado por INDICE com a tag crua: a cor
                      de risco alto e escolhida casando o valor em ingles
                      (HIGH_RISK_TAGS), entao a tag crua tem que sobreviver
                      mesmo com a tela em outro idioma (auditoria 20/08). */}
                  {dangerLabelsByIndex.map((label, i) => label ? (
                    <Tag key={`${rawDanger[i]}-${i}`} label={label} color={dangerColor} />
                  ) : null)}
                </View>
              )}
              {!!visibleDangerDescription && (
                <View style={visibleDangerLabels.length ? { marginTop: 10 } : null}>
                  {/* Inteiro, nunca colapsado: cortar um aviso de picada ou
                      veneno na primeira frase pode esconder justamente a parte
                      grave (auditoria 20/08). */}
                  <Text style={styles.body}>{visibleDangerDescription}</Text>
                </View>
              )}
              {!!safetyFallback && <Text style={styles.body}>{safetyFallback}</Text>}
            </SectionCard>
          )}
        </ZoneBand>
        )}

        <LensRevealCard
          confidence={plant.confidence}
          summary={plant.overview}
          accent={meta.accent}
          critical={dangerColor === colors.error}
        />
        <TopicNavigatorCard
          topics={topics}
          accent={meta.accent}
          onOpen={openTopic}
          title={t('speciesDossier.title')}
          loading={topicsLoading}
        />
        <GroupGuideCard
          groupKey={groupKey}
          entityName={enrichmentScientific ? plant.name : null}
          topics={topics}
          accent={meta.accent}
          onOpen={(guideTopics, key) => openTopic(key, guideTopics)}
        />
        {/* MIP e uma decisao de campo, nao curiosidade tecnica. Quando existe
            um par exato inseto-cultura ele precisa ficar encontravel em
            qualquer profundidade; o proprio card continua fechado quando o
            par nao foi documentado. */}
        <DynamicPestManagementCard
          scientific={plant.scientific}
          identityV1={plant.identityV1}
          accent={colors.warning}
        />
        <NextBestCaptureCard
          category="insect"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'insect', fromIdentify })}
        />

        {/* Risco -> evidencia -> fatos: primeiro responde se o inseto exige
            cautela, depois mostra por que a identidade e plausivel, e so entao
            abre a leitura enciclopedica. */}
        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <IdentificationExtras entity={plant} savedId={savedEntryId || plant.savedId || null} identityV1={plant.identityV1} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.ESSENTIAL}>
          <DiscoveryReceiptCard
            outcome={scanOutcome}
            request={scanOutcomeRequest}
            accent={meta.accent}
            automaticSaveConfirmed={fromIdentify === true && !!plant.savedId}
            riskLevel={dangerColor === colors.error ? 'danger' : null}
          />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <DidacticFieldGuide category="insect" entity={plant} accent={meta.accent} />
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
          facts={quickFacts.map((f) => f && { ...f, onPress: () => openTopic(f.key) })}
        />

        {!!plant.overview && (
          <ZoneBand gutter={20}>
            <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
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

        <ExactSpeciesGuide
          category="insect"
          scientific={enrichmentScientific}
          accent={meta.accent}
          includeOverview={!plant.overview}
        />
        <DynamicSpeciesDossier
          category="insect"
          scientific={plant.scientific}
          identityV1={plant.identityV1}
          dossier={speciesDossier}
          accent={meta.accent}
        />
        <DistributionMap scientific={plant.scientific} gbifId={plant.gbifId} identityV1={plant.identityV1} accent={meta.accent} />
        <SeasonChart scientific={plant.scientific} gbifId={plant.gbifId} identityV1={plant.identityV1} accent={meta.accent} />

        {/* Ecology - tela principal rica (video do concorrente, 20/08): o papel
            ecologico era so um card-porta com uma linha truncada; agora a lista
            REAL do vendor fica inline, um bullet por papel, como na tela de
            resultado do concorrente. A porta pro manual nao se perdeu - o mesmo
            topico continua a um toque pelo fato rapido "Papel ecologico" acima.
            Guarded: campo ausente = banda inteira nao renderiza. */}
        {visibleRole.length > 0 && (
          <ZoneBand gutter={20}>
            <SectionCard
              icon="leaf-outline"
              title={t('detail.ecologicalRoleSection')}
              color={colors.accent}
            >
              {visibleRole.map((r) => (
                <Text key={r} style={styles.bullet}>{'• ' + r}</Text>
              ))}
            </SectionCard>
          </ZoneBand>
        )}

        {/* Ficha/recibo band: the technical rows close the screen as a
            receipt. Guarded like the band above. */}
        {(!!technicalText(plant.family || dossierTaxonomy.family)
          || !!technicalText(plant.ord || dossierTaxonomy.order)
          || infoRows.length > 0) && (
          <ZoneBand gutter={20}>
            <TaxonomyTrail
              order={plant.ord || dossierTaxonomy.order}
              family={plant.family || dossierTaxonomy.family}
              scientific={enrichmentScientific}
              accent={meta.accent}
            />
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
        <HelpfulRow category="insect" context="result" />
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
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  tagText: { fontSize: 12, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  // Bullet da lista de papel ecologico - tela principal rica (video do
  // concorrente, 20/08). Os estilos do card-porta sairam daqui junto com ele:
  // a lista agora e inline. Os dos fatos rapidos moram em QuickFactGrid.js.
  bullet: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  specialistText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13.5 },
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
