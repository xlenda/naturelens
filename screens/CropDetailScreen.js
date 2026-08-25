import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PlantHero from '../components/PlantHero';
import SectionCard from '../components/SectionCard';
import DiseaseReport from '../components/DiseaseReport';
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
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import SpeciesFaq from '../components/SpeciesFaq';
import Pronounce from '../components/Pronounce';
import TopBar, { TopBarIcon } from '../components/TopBar';
import ExpandableText from '../components/ExpandableText';
import TopicNavigatorCard from '../components/TopicNavigatorCard';
import { createSpeciesTopicResourceKey, usePublishSpeciesTopics } from '../components/speciesTopicResource';
import { API_BASE } from '../components/apiBase';
import { getSpeciesDossier } from '../components/speciesDossier';
import {
  buildSourceGroundedTopics,
  mergeSourceGroundedTopics,
} from '../components/sourceGroundedTopics';
import IdentificationExtras from '../components/IdentificationExtras';
import DidacticFieldGuide from '../components/DidacticFieldGuide';
import DiscoveryReceiptCard from '../components/DiscoveryReceiptCard';
import { enrichmentTaxon } from '../components/taxonIdentity';
import VendorSourceCredit from '../components/VendorSourceCredit';
import TaxonomyTrail from '../components/TaxonomyTrail';
import PestManagementTablesCard from '../components/PestManagementTablesCard';
import FertilizerTablesCard from '../components/FertilizerTablesCard';
import CommunityInviteCard from '../components/CommunityInviteCard';
import { getPestManagementProfile } from '../components/pestManagementTables';
import { getCuratedDetail } from '../components/curatedDetails';
import LensRevealCard from '../components/LensRevealCard';
import NextBestCaptureCard from '../components/NextBestCaptureCard';
import { retakeResult } from '../components/resultRetake';
import { RESULT_DEPTHS, ResultDepthLayer } from '../components/ResultDepthSwitcher';
import {
  agronomySubjectKey,
  moveAgronomyProfileSubject,
} from '../components/agronomyStorage';

function technicalText(value) {
  const values = Array.isArray(value) ? value : [value];
  const clean = values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

export default function CropDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify, scanOutcome, scanOutcomeRequest } = route.params;
  const meta = CATEGORIES.crop;
  const { t, i18n } = useTranslation();
  const disease = plant.disease;
  const [saved, setSaved] = useState(Boolean(plant.savedId));
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  // Lavoura sempre entrega todo o dossie verdadeiro. Os wrappers preservam a
  // ordem editorial existente, mas nenhuma preferencia antiga esconde tabelas.
  const resultDepth = RESULT_DEPTHS.EXPERT;
  const scrollRef = useRef(null);
  const agronomyNodes = useRef({});
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  const agronomyKey = agronomySubjectKey(plant, savedEntryId);
  const unsavedAgronomyKey = agronomySubjectKey({ ...plant, savedId: null }, null);
  const enrichment = enrichmentTaxon(plant.identityV1, {
    scientificName: plant.scientific,
    gbifKey: plant.gbifId,
  });
  const enrichmentScientific = enrichment?.canonicalName || null;
  const curatedLookupKey = `${i18n.language}|${enrichmentScientific || ''}`;
  const [curatedState, setCuratedState] = useState({ key: null, detail: null });
  const curated = curatedState.key === curatedLookupKey ? curatedState.detail : null;
  const curatedLoading = Boolean(enrichmentScientific) && curatedState.key !== curatedLookupKey;
  const dossierLookupKey = `crop|${i18n.language}|${enrichmentScientific || ''}`;
  const [speciesDossierState, setSpeciesDossierState] = useState({ key: null, dossier: null });
  const speciesDossier = speciesDossierState.key === dossierLookupKey
    ? speciesDossierState.dossier
    : null;
  const speciesDossierLoading = Boolean(enrichmentScientific)
    && speciesDossierState.key !== dossierLookupKey;
  // Familia e ordem pertencem somente ao contexto geral. O resolver de
  // lavoura continua exigindo o binomio exato para abrir qualquer protocolo.
  const groupGuideEntity = {
    category: 'crop',
    scientific: enrichmentScientific,
    family: plant.family || null,
    ord: plant.ord || null,
  };

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
    let alive = true;
    if (!enrichmentScientific) return () => { alive = false; };
    getCuratedDetail(i18n.language, 'crop', enrichmentScientific).then(
      (detail) => {
        if (alive) setCuratedState({ key: curatedLookupKey, detail });
      },
      () => {
        if (alive) setCuratedState({ key: curatedLookupKey, detail: null });
      }
    );
    return () => { alive = false; };
  }, [curatedLookupKey, i18n.language, enrichmentScientific]);

  useEffect(() => {
    let alive = true;
    // O endpoint confirma a mesma especie no GBIF antes de aceitar secoes da
    // Wikipedia. A chave impede que uma cultura mostre por um quadro o texto
    // da consulta anterior enquanto idioma ou rota mudam.
    if (!enrichmentScientific) return () => { alive = false; };
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'crop',
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

  const toggleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (saved && savedEntryId) {
      const previousAgronomyKey = agronomyKey;
      const result = await removeFromCollection(savedEntryId);
      if (result) {
        if (previousAgronomyKey && unsavedAgronomyKey) {
          await moveAgronomyProfileSubject(previousAgronomyKey, unsavedAgronomyKey);
        }
        setSaved(false);
        setSavedEntryId(null);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    } else {
      const previousAgronomyKey = agronomyKey;
      // A curadoria melhora a leitura desta tela, mas nao reescreve o recibo
      // devolvido pelo fornecedor que sera reaberto e sincronizado depois.
      const entry = await saveToCollection(plant);
      if (entry) {
        const savedAgronomyKey = agronomySubjectKey(entry, entry.savedId);
        if (previousAgronomyKey && savedAgronomyKey) {
          await moveAgronomyProfileSubject(previousAgronomyKey, savedAgronomyKey);
        }
        trackResultSaved({ category: 'crop' });
        // Save-mission credit (idempotent - see components/missions.js). This
        // screen was the one the first wiring pass missed - caught by the Fable
        // review: a user who only used the Crops tab could never complete a
        // save mission.
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

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.crop.label'));
  };

  const groupKey = getSpeciesGroup(groupGuideEntity);
  const resolvedOverview = plant.overview || curated?.overview || null;
  const hasHealthAssessment = plant.healthAssessed === true;
  const infoRows = [
    { label: t('detail.synonyms'), value: technicalText(plant.synonyms) },
  ].filter((row) => row.value);

  // Hub do resultado (video do concorrente): leituras longas viram cards-porta
  // pro manual (CareTopics) em vez de prosa empilhada. O relatorio de doenca
  // fica inline - e acao, nao leitura. Quando o vendor nao traz estes campos,
  // o dossie exato pode acrescentar secoes documentadas da Wikipedia depois da
  // prova GBIF; sem uma das duas fontes, nada renderiza.
  const joinField = (v) => (Array.isArray(v) ? v.join('\n\n') : v);
  const baseTopics = [
    { key: 'overview', label: t('common.overview'), icon: 'document-text-outline', color: colors.info, text: joinField(resolvedOverview) },
    { key: 'habitat', label: t('fieldGuide.habitat'), icon: 'earth-outline', color: colors.info, text: joinField(curated?.habitat) },
    { key: 'curiosity', label: t('fieldGuide.curiosity'), icon: 'sparkles-outline', color: colors.warning, text: joinField(curated?.curiosity) },
    { key: 'uses', label: t('detail.commonUsesSection'), icon: 'construct-outline', color: colors.info, text: joinField(plant.commonUses) },
    { key: 'cultural', label: t('detail.culturalSignificanceSection'), icon: 'earth-outline', color: colors.purple, text: joinField(plant.culturalSignificance) },
    { key: 'edibleParts', label: t('detail.edibleParts'), icon: 'restaurant-outline', color: colors.accent, text: joinField(plant.edibleParts) },
    { key: 'propagation', label: t('detail.propagation'), icon: 'git-branch-outline', color: colors.accent, text: joinField(plant.propagationMethods) },
  ].filter((tp) => !!tp.text);
  const sourceTopics = buildSourceGroundedTopics({ dossier: speciesDossier });
  const TOPICS = mergeSourceGroundedTopics(baseTopics, sourceTopics);
  const topicResourceKey = createSpeciesTopicResourceKey({
    category: 'crop',
    language: i18n.language,
    routeKey: route.key,
    identity: plant.savedId || plant.scientific || plant.name,
  });
  usePublishSpeciesTopics(topicResourceKey, TOPICS);
  const hasPestManagement = !!getPestManagementProfile({ scientific: enrichmentScientific, groupKey });
  const showFertilizerPlanner = groupKey === 'grainCrop' || groupKey === 'vegCrop';
  const hasAgronomyModules = hasPestManagement || showFertilizerPlanner;
  const hasFieldContent = hasPestManagement || showFertilizerPlanner || TOPICS.length > 0;

  const scrollToAgronomyModule = (key) => {
    const node = agronomyNodes.current[key];
    const inner = scrollRef.current?.getInnerViewNode?.() || scrollRef.current;
    if (node?.measureLayout && inner) {
      node.measureLayout(
        inner,
        (x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true }),
        () => {}
      );
    }
  };

  const openAgronomyModule = (key) => {
    scrollToAgronomyModule(key);
  };

  const openTopic = (key, routeTopics = TOPICS) =>
    navigation.navigate('CareTopics', { groupKey: null,
      title: plant.name,
      accent: meta.accent,
      category: 'crop',
      topics: routeTopics,
      topicResourceKey,
      initialKey: key,
    });

  const openAgronomyWorkspace = () => {
    if (!agronomyKey) return;
    navigation.navigate('AgronomyWorkspace', {
      entity: plant,
      savedId: savedEntryId || null,
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
        title={hasHealthAssessment ? t('detail.cropHealthReportTitle') : t('categories.crop.label')}
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

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <PlantHero
          photoUri={plant.photoUri}
          similarImages={plant.similarImages}
          scientific={plant.scientific}
          identityV1={plant.identityV1}
          accent={meta.accent}
          icon={meta.tabIcon}
          showIdentifiedBadge={hasHealthAssessment}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{plant.name}</Text>
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
          </View>
          {Number.isFinite(plant.confidence) && (
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceLabel}>{t('detail.cropMatch')}</Text>
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
          <Text style={[styles.typePillText, { color: meta.accent }]}>{t('detail.cropPill')}</Text>
        </View>

        {/* Zona de cor: the health report - the reason the screen exists - is
            the first full-bleed band. Cultura e doenca tem galerias separadas:
            DiseaseReport mostra somente sintomas do laudo, e a evidencia da
            cultura vencedora vem depois. */}
        {hasHealthAssessment && (
          <ZoneBand gutter={20}>
            <DiseaseReport disease={disease} provider={plant.sourceProvider} />
          </ZoneBand>
        )}

        <LensRevealCard
          confidence={plant.confidence}
          summary={resolvedOverview}
          accent={meta.accent}
          critical={['high', 'severe'].includes(String(disease?.severity || '').toLowerCase())}
        />
        {/* As portas preservam a leitura progressiva e levam direto ao modulo;
            o conteudo verdadeiro ja esta montado, sem depender do onboarding. */}
        {hasAgronomyModules && (
          <View style={styles.agronomyHub}>
            <View style={styles.agronomyHubHeader}>
              <View style={[styles.agronomyHubIcon, { backgroundColor: meta.accent + '1F' }]}>
                <Ionicons name="grid-outline" size={20} color={meta.accent} />
              </View>
              <View style={styles.agronomyHubCopy}>
                <Text style={styles.agronomyHubTitle}>{t('detail.agronomySection')}</Text>
                <Text style={styles.agronomyHubBody}>{t('detail.agronomyDecisionNote')}</Text>
              </View>
            </View>
            <View style={styles.agronomyModules}>
              {showFertilizerPlanner && (
                <TouchableOpacity
                  style={[styles.agronomyModule, { borderColor: meta.accent + '66' }]}
                  onPress={() => openAgronomyModule('fertilizer')}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={t('fertilizer.title')}
                >
                  <View style={[styles.agronomyModuleIcon, { backgroundColor: meta.accent + '1F' }]}>
                    <Ionicons name="flask-outline" size={20} color={meta.accent} />
                  </View>
                  <Text style={styles.agronomyModuleText}>{t('fertilizer.title')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={meta.accent} />
                </TouchableOpacity>
              )}
              {hasPestManagement && (
                <TouchableOpacity
                  style={[styles.agronomyModule, { borderColor: colors.warning + '66' }]}
                  onPress={() => openAgronomyModule('pests')}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={t('detail.integratedManagementSection')}
                >
                  <View style={[styles.agronomyModuleIcon, { backgroundColor: colors.warning + '1F' }]}>
                    <Ionicons name="bug-outline" size={20} color={colors.warning} />
                  </View>
                  <Text style={styles.agronomyModuleText}>{t('detail.integratedManagementSection')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.warning} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {agronomyKey ? (
          <TouchableOpacity
            style={[styles.advancedAgronomyCard, { borderColor: meta.accent + '66' }]}
            onPress={openAgronomyWorkspace}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('agronomyWorkspace.openAction')}
          >
            <View style={[styles.advancedAgronomyIcon, { backgroundColor: meta.accent + '20' }]}>
              <Ionicons name="analytics-outline" size={24} color={meta.accent} />
            </View>
            <View style={styles.advancedAgronomyCopy}>
              <Text style={styles.advancedAgronomyTitle}>{t('agronomyWorkspace.openTitle')}</Text>
              <Text style={styles.advancedAgronomyBody}>{t('agronomyWorkspace.openBody')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={meta.accent} />
          </TouchableOpacity>
        ) : null}

        <TopicNavigatorCard
          topics={TOPICS}
          accent={meta.accent}
          onOpen={openTopic}
          loading={curatedLoading || speciesDossierLoading}
        />
        <NextBestCaptureCard
          category="crop"
          confidence={plant.confidence}
          alternatives={plant.alternatives}
          identityStatus={plant.identityV1?.status}
          resultName={plant.name || plant.scientific}
          fromIdentify={fromIdentify}
          accent={meta.accent}
          onRetake={() => retakeResult({ navigation, category: 'crop', fromIdentify })}
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
            riskLevel={['high', 'severe'].includes(String(disease?.severity || '').toLowerCase())
              ? 'danger'
              : null}
          />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.VISUAL}>
          <DidacticFieldGuide category="crop" entity={plant} accent={meta.accent} />
        </ResultDepthLayer>

        <ResultDepthLayer activeDepth={resultDepth} depth={RESULT_DEPTHS.EXPERT}>

        {hasFieldContent && (
        <ZoneBand gutter={20}>

          {/* Foto nao mede populacao. A tabela de insetos obriga a passar por
              amostragem, estadio e nivel de acao antes de qualquer controle;
              numeros so entram para milho e soja confirmados. */}
          {hasPestManagement && (
            <View ref={(node) => { agronomyNodes.current.pests = node; }}>
              <PestManagementTablesCard
                scientific={enrichmentScientific}
                groupKey={groupKey}
                entityName={plant.name}
              />
            </View>
          )}

          {/* Tabela de adubacao vem depois do protocolo de campo porque
              primeiro se define o que medir. Numeros de extracao so aparecem
              com especie confirmada e nunca sao convertidos em dose. */}
          {showFertilizerPlanner && (
            <View ref={(node) => { agronomyNodes.current.fertilizer = node; }}>
              <FertilizerTablesCard
                scientific={enrichmentScientific}
                groupKey={groupKey}
                entityName={plant.name}
                accent={meta.accent}
                showPlannerFallback
              />
            </View>
          )}

          {/* Tela principal rica (video do concorrente, 20/08): fora o
              relatorio de doenca, esta tela era uma pilha de linhas truncadas -
              usos, significado cultural, partes comestiveis - e o texto so
              existia dentro do manual. Agora cada leitura mostra o texto REAL
              aqui, colapsado na primeira frase, e o cabecalho segue abrindo o
              manual (que acrescenta dica, checklist e material do grupo).
              Campo ausente nao vira topico, entao nada renderiza vazio. */}
          {TOPICS.map((tp) => (
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
              {tp.key === 'overview' && !!plant.overview && (
                <VendorSourceCredit
                  provider={plant.sourceProvider}
                  citation={plant.overviewCitation}
                  licenseName={plant.overviewLicense}
                  licenseUrl={plant.overviewLicenseUrl}
                />
              )}
            </View>
          ))}
        </ZoneBand>
        )}

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

        {/* Gancho da especialista (hub do resultado): a pergunta ja sai com o
            contexto da especie, do jeito que BotanistScreen.route.params.context
            espera. */}
        <TouchableOpacity
          style={styles.specialistCta}
          onPress={() =>
            navigation.navigate('Botanist', {
              context: plant.name + ' (' + (plant.scientific || '') + ')',
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
            (a11y, handlers, activeOpacity) - on RN-web an Animated.Value on the
            Touchable's own style would not drive the transform. */}
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

        {/* "Duvidas frequentes" - paridade 120% (video do concorrente,
            20/08): o FAQ fixo dele vira pergunta SUGERIDA que abre a
            especialista ja com a duvida escrita e a especie como contexto. */}
        <SpeciesFaq
          category="crop"
          name={plant.name}
          scientific={plant.scientific}
          accent={meta.accent}
          navigation={navigation}
        />

        <CommunityInviteCard accent={meta.accent} />

        {/* Hub do resultado (video do concorrente): feedback de utilidade no
            fim do scroll. */}
        <HelpfulRow category="crop" context="result" />
        </ResultDepthLayer>
      </ScrollView>

      {/* Hub do resultado (video do concorrente): a barra fixa Nova foto |
          Compartilhar | Salvar substitui o SaveFab; styles.scroll carries
          paddingBottom >= 120 so the bar never covers the last row. "Nova"
          so faz sentido vindo da identificacao - da Colecao, voltar ja e o
          botao de voltar. O bookmark do TopBar permanece. */}
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
  // paddingBottom >= 120: room for the fixed ResultActionBar (doutrina: a bar
  // that hides the last row is the viewport bug in miniature).
  scroll: { padding: 20, paddingBottom: 120 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  sciRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
  commonNames: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  agronomyHub: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 15,
    marginBottom: 12,
  },
  advancedAgronomyCard: {
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
  advancedAgronomyIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advancedAgronomyCopy: { flex: 1 },
  advancedAgronomyTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  advancedAgronomyBody: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  agronomyHubHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  agronomyHubIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agronomyHubCopy: { flex: 1 },
  agronomyHubTitle: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  agronomyHubBody: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  agronomyModules: { gap: 8, marginTop: 13 },
  agronomyModule: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  agronomyModuleIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agronomyModuleText: { flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  // Blocos de leitura da tela principal (video do concorrente, 20/08): o card
  // deixou de ser uma LINHA tocavel e virou bloco - cabecalho (que ainda abre
  // o manual) + texto colapsado embaixo.
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
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  doorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorLabel: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
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
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: 10,
  },
  specialistCtaText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.textSecondary },
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
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
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
