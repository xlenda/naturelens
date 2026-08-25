import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import SectionCard from '../components/SectionCard';
import AgronomyProfileWizard from '../components/AgronomyProfileWizard';
import FertilizerTablesCard from '../components/FertilizerTablesCard';
import PestManagementTablesCard from '../components/PestManagementTablesCard';
import {
  AGRONOMY_EVENT_TYPES,
  agronomySubjectKey,
  appendAgronomyEvent,
  getAgronomyEvents,
  getAgronomyProfile,
  saveAgronomyProfile,
} from '../components/agronomyStorage';
import {
  CROP_AGRONOMY_MODULES,
  getCropAgronomyProfile,
  getCropAgronomySource,
} from '../components/cropAgronomyRegistry';
import { getFertilizerProfile } from '../components/fertilizerTables';
import { getPestManagementProfile } from '../components/pestManagementTables';
import { getSpeciesGroup } from '../components/speciesGroup';
import { enrichmentTaxon } from '../components/taxonIdentity';
import { AGRONOMY_STATUS, resolveAgronomyWorkspace } from '../components/agronomyRuleCatalog';
import { agronomyLocationLabel } from '../components/agronomyProfileV2';
import { didacticVisualFor } from '../components/didacticVisuals';
import { API_BASE } from '../components/apiBase';
import { getSpeciesDossier } from '../components/speciesDossier';
import { buildSourceGroundedTopics } from '../components/sourceGroundedTopics';
import {
  createSpeciesTopicResourceKey,
  usePublishSpeciesTopics,
} from '../components/speciesTopicResource';
import GlobalAgronomyEvidenceCard from '../components/GlobalAgronomyEvidenceCard';
import {
  globalAgronomyDossierKey,
  globalAgronomyWikipediaSource,
  hasExactCropIdentity,
  selectGlobalAgronomyTopics,
  verifiedGlobalCropDossier,
} from '../components/globalAgronomyEvidence';
import { colors, control, radius, shadow, space, type } from '../components/theme';

const TABS = Object.freeze(['essential', 'learn', 'agronomist']);
const EVENT_TYPE_ORDER = Object.freeze([
  'observation',
  'stage',
  'rain',
  'irrigation',
  'fertilization',
  'pestSample',
  'diseaseCheck',
  'harvest',
]);
const PURPOSE_KEYS = new Set(['grain', 'fresh', 'processing', 'forage', 'seed', 'other']);
const SYSTEM_KEYS = new Set(['rainfed', 'irrigated', 'protected', 'hydroponic', 'other']);
const LEARNING_STEPS = Object.freeze([
  Object.freeze({ key: 'observe', icon: 'eye-outline' }),
  Object.freeze({ key: 'record', icon: 'create-outline' }),
  Object.freeze({ key: 'compare', icon: 'git-compare-outline' }),
  Object.freeze({ key: 'support', icon: 'people-outline' }),
]);
const VISUAL_TOPICS = Object.freeze([
  Object.freeze({ key: 'phenology', icon: 'git-commit-outline', color: colors.accent }),
  Object.freeze({ key: 'soil', icon: 'layers-outline', color: colors.warning }),
  Object.freeze({ key: 'water', icon: 'water-outline', color: colors.info }),
  Object.freeze({ key: 'nutrition', icon: 'flask-outline', color: colors.purple }),
  Object.freeze({ key: 'mip', icon: 'bug-outline', color: colors.error }),
]);
const CROP_DIDACTIC_VISUAL = didacticVisualFor('crop');

function cleanRouteEntity(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function optionalAmount(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) return { valid: true, amount: null };
  if (!/^\d+(?:[.,]\d+)?$/.test(clean)) return { valid: false, amount: null };
  const amount = Number(clean.replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 && amount <= 1000000
    ? { valid: true, amount }
    : { valid: false, amount: null };
}

function formatEventDate(value, language) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch (e) {
    return parsed.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function formatAmount(value, language) {
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(value);
  } catch (e) {
    return String(value);
  }
}

function safeWorkspaceResolution(entity, profile) {
  try {
    return resolveAgronomyWorkspace(entity, profile);
  } catch (e) {
    return null;
  }
}

function sourceInstitution(url) {
  if (typeof url !== 'string') return '';
  if (/\.embrapa\.br\//i.test(url) || /\/\/embrapa\.br\//i.test(url)) return 'Embrapa';
  if (/\/\/www\.gov\.br\//i.test(url)) return 'MAPA / gov.br';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function sourceListFromRefs(sourceRefs, includeReference) {
  if (!Array.isArray(sourceRefs)) return [];
  const seen = new Set();
  return sourceRefs
    .filter((reference) => includeReference(reference))
    .map((reference) => getCropAgronomySource(reference?.sourceId))
    .filter((source) => {
      if (!source?.url || !/^https:\/\//.test(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .map((source) => ({ url: source.url, institution: sourceInstitution(source.url) }))
    .filter((source) => source.institution);
}

function SummaryRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function PrimaryAction({ label, icon, onPress, disabled = false, color = colors.accent }) {
  return (
    <TouchableOpacity
      style={[styles.primaryAction, { backgroundColor: color }, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={18} color={colors.background} />
      <Text style={styles.primaryActionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function VisualDiagram({ topic, profile }) {
  if (topic === 'phenology') {
    return (
      <View style={styles.stageTrack}>
        {[0, 1, 2, 3].map((step) => (
          <React.Fragment key={step}>
            <View style={[styles.stageDot, step === 1 && styles.stageDotActive]} />
            {step < 3 ? <View style={styles.stageLine} /> : null}
          </React.Fragment>
        ))}
        {profile?.planting?.stageConfirmed && profile.planting.stage ? (
          <Text style={styles.stageConfirmed} numberOfLines={1}>{profile.planting.stage}</Text>
        ) : null}
      </View>
    );
  }
  if (topic === 'soil') {
    return (
      <View style={styles.soilProfile}>
        <View style={[styles.soilLayer, styles.soilTop]} />
        <View style={[styles.soilLayer, styles.soilMiddle]} />
        <View style={[styles.soilLayer, styles.soilBottom]} />
        <View style={[styles.samplePoint, { left: '28%', top: 8 }]} />
        <View style={[styles.samplePoint, { left: '62%', top: 26 }]} />
        <View style={[styles.samplePoint, { left: '43%', top: 43 }]} />
      </View>
    );
  }
  if (topic === 'nutrition') {
    return (
      <View style={styles.nutrientRow}>
        {['N', 'P', 'K'].map((nutrient) => (
          <View key={nutrient} style={styles.nutrientTile}>
            <Text style={styles.nutrientText}>{nutrient}</Text>
          </View>
        ))}
      </View>
    );
  }
  const icons = topic === 'water'
    ? ['rainy-outline', 'layers-outline', 'leaf-outline', 'checkmark-circle-outline']
    : ['search-outline', 'list-outline', 'analytics-outline', 'checkmark-circle-outline'];
  return (
    <View style={styles.decisionFlow}>
      {icons.map((icon, index) => (
        <React.Fragment key={`${topic}-${icon}`}>
          <View style={styles.decisionNode}>
            <Ionicons name={icon} size={16} color={colors.textSecondary} />
          </View>
          {index < icons.length - 1 ? (
            <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function LearningFallback({ t, profile }) {
  const [openVisual, setOpenVisual] = useState(null);
  return (
    <>
      <SectionCard icon="school-outline" title={t('agronomyWorkspace.learning.title')} color={colors.info}>
        <Text style={styles.body}>{t('agronomyWorkspace.learning.body')}</Text>
        {CROP_DIDACTIC_VISUAL?.image ? (
          <View style={styles.didacticFigure}>
            <Image
              source={CROP_DIDACTIC_VISUAL.image}
              style={styles.didacticImage}
              resizeMode="contain"
              accessible
              accessibilityLabel={t('learning.illustrationAlt', {
                category: t('categories.crop.label'),
              })}
            />
            <View style={styles.didacticCaption}>
              <Text style={styles.didacticCaptionTitle}>{t('learning.generalDiagram')}</Text>
              <Text style={styles.didacticCaptionBody}>{t('learning.generalNote')}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.visualTopics}>
          {VISUAL_TOPICS.map((topic) => {
            const expanded = openVisual === topic.key;
            const title = t(`agronomyWorkspace.learning.visuals.${topic.key}.title`);
            const body = t(`agronomyWorkspace.learning.visuals.${topic.key}.body`);
            return (
              <TouchableOpacity
                key={topic.key}
                style={[styles.visualTopic, expanded && { borderColor: topic.color + '88' }]}
                onPress={() => setOpenVisual(expanded ? null : topic.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={expanded ? `${title}. ${body}` : title}
                accessibilityState={{ expanded }}
              >
                <View style={styles.visualTopicHeader}>
                  <View style={[styles.visualTopicIcon, { backgroundColor: topic.color + '1F' }]}>
                    <Ionicons name={topic.icon} size={19} color={topic.color} />
                  </View>
                  <Text style={styles.visualTopicTitle}>{title}</Text>
                  <Ionicons
                    name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={18}
                    color={expanded ? topic.color : colors.textMuted}
                  />
                </View>
                <VisualDiagram topic={topic.key} profile={profile} />
                {expanded ? (
                  <Text style={styles.visualTopicBody}>{body}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <View
          style={styles.learningFlow}
          accessible
          accessibilityLabel={t('agronomyWorkspace.learning.accessibilityLabel')}
        >
          {LEARNING_STEPS.map((step, index) => (
            <View key={step.key} style={styles.learningStep}>
              <View style={styles.learningRail}>
                <View style={styles.learningIcon}>
                  <Ionicons name={step.icon} size={21} color={colors.info} />
                </View>
                {index < LEARNING_STEPS.length - 1 ? <View style={styles.learningLine} /> : null}
              </View>
              <View style={styles.learningCopy}>
                <Text style={styles.learningTitle}>
                  {t(`agronomyWorkspace.learning.steps.${step.key}.title`)}
                </Text>
                <Text style={styles.learningBody}>
                  {t(`agronomyWorkspace.learning.steps.${step.key}.body`)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </SectionCard>

      <View style={styles.scopeNotice}>
        <Ionicons name="images-outline" size={19} color={colors.info} />
        <View style={styles.scopeCopy}>
          <Text style={styles.scopeTitle}>{t('agronomyWorkspace.learning.genericTitle')}</Text>
          <Text style={styles.scopeBody}>{t('agronomyWorkspace.learning.genericBody')}</Text>
        </View>
      </View>
    </>
  );
}

function EventTimeline({ events, language, t }) {
  if (!Array.isArray(events) || events.length === 0) return null;
  return (
    <SectionCard icon="time-outline" title={t('agronomyWorkspace.timelineTitle')} color={colors.purple}>
      <View style={styles.timeline}>
        {events.map((event, index) => {
          const dateLabel = formatEventDate(event?.occurredAt, language);
          const amountLabel = Number.isFinite(event?.amount)
            ? [formatAmount(event.amount, language), event.unit].filter(Boolean).join(' ')
            : '';
          const typeKnown = EVENT_TYPE_ORDER.includes(event?.type);
          if (!event?.eventId || !typeKnown || !dateLabel) return null;
          return (
            <View
              key={event.eventId}
              style={styles.timelineItem}
              accessible
              accessibilityLabel={[
                t(`agronomyWorkspace.eventTypes.${event.type}`),
                dateLabel,
                event.note,
                amountLabel,
              ].filter(Boolean).join('. ')}
            >
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
                {index < events.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.timelineContent}>
                <View style={styles.timelineHeading}>
                  <Text style={styles.timelineType}>
                    {t(`agronomyWorkspace.eventTypes.${event.type}`)}
                  </Text>
                  <Text style={styles.timelineDate}>{dateLabel}</Text>
                </View>
                {event.note ? <Text style={styles.timelineNote}>{event.note}</Text> : null}
                {amountLabel ? <Text style={styles.timelineAmount}>{amountLabel}</Text> : null}
                {event.stage ? (
                  <Text style={styles.timelineStage}>
                    {t('agronomyWorkspace.eventStage', { stage: event.stage })}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

export default function AgronomyWorkspaceScreen({ route }) {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const entity = cleanRouteEntity(route?.params?.entity);
  const savedId = typeof route?.params?.savedId === 'string' ? route.params.savedId : '';
  const subjectKey = useMemo(() => agronomySubjectKey(entity, savedId), [entity, savedId]);
  const subjectKeyRef = useRef(subjectKey);
  const profileSavingRef = useRef(false);
  const eventSavingRef = useRef(false);

  const [activeTab, setActiveTab] = useState('essential');
  const [profile, setProfile] = useState(undefined);
  const [events, setEvents] = useState(undefined);
  const [wizardVisible, setWizardVisible] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [eventFormVisible, setEventFormVisible] = useState(false);
  const [eventType, setEventType] = useState('observation');
  const [eventNote, setEventNote] = useState('');
  const [eventAmount, setEventAmount] = useState('');
  const [eventUnit, setEventUnit] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const [eventMessage, setEventMessage] = useState(null);
  const [eventError, setEventError] = useState(null);
  const [globalDossierState, setGlobalDossierState] = useState({ key: null, dossier: null });

  useEffect(() => {
    subjectKeyRef.current = subjectKey;
    let alive = true;
    setProfile(undefined);
    setEvents(undefined);
    setProfileMessage(null);
    setEventMessage(null);

    if (!subjectKey) {
      setProfile(null);
      setEvents([]);
      return () => { alive = false; };
    }

    getAgronomyProfile(subjectKey).then(async (storedProfile) => {
      if (!alive) return;
      setProfile(storedProfile);
      if (!storedProfile?.profileId) {
        setEvents([]);
        return;
      }
      const storedEvents = await getAgronomyEvents(storedProfile.profileId);
      if (alive) setEvents(storedEvents);
    });

    return () => { alive = false; };
  }, [subjectKey]);

  const enrichment = useMemo(() => enrichmentTaxon(entity?.identityV1, {
    scientificName: entity?.scientific,
    gbifKey: entity?.gbifId,
  }), [entity]);
  const scientific = enrichment?.canonicalName || null;
  const globalDossierLookupKey = globalAgronomyDossierKey(i18n.language, scientific);
  const globalEvidenceEligible = hasExactCropIdentity(entity, scientific);
  const keyedGlobalDossier = globalDossierLookupKey
    && globalDossierState.key === globalDossierLookupKey
    ? globalDossierState.dossier
    : null;
  const globalDossier = useMemo(
    () => verifiedGlobalCropDossier(entity, scientific, keyedGlobalDossier),
    [entity, scientific, keyedGlobalDossier]
  );
  const cropCoverage = useMemo(() => getCropAgronomyProfile(scientific), [scientific]);
  const workspaceResolution = useMemo(
    () => safeWorkspaceResolution(entity, profile || null),
    [entity, profile]
  );
  const engineGuideResolved = Boolean(
    workspaceResolution?.state === AGRONOMY_STATUS.TECHNICAL_GUIDE
      && workspaceResolution?.context?.identity?.exact === true
      && workspaceResolution?.profileKey
      && workspaceResolution.profileKey === cropCoverage?.key
  );
  // A ficha editorial e a unica excecao sem identityV1: o id precisa casar
  // com o catalogo e healthAssessed=false deixa claro que nao houve foto.
  const editorialCatalog = Boolean(
    entity?.identityV1 === undefined
      && entity?.category === 'crop'
      && entity?.healthAssessed === false
      && entity?.id
      && entity.id === cropCoverage?.catalogId
  );
  const technicalIdentity = engineGuideResolved || editorialCatalog;
  const technicalRouting = Boolean(
    technicalIdentity && cropCoverage?.exposure?.agronomyRouting === 'exact'
  );
  const groupKey = useMemo(() => (
    technicalRouting
      ? getSpeciesGroup({ ...entity, category: 'crop', scientific })
      : null
  ), [entity, scientific, technicalRouting]);
  const currentModules = cropCoverage?.modules?.current || [];
  const fertilizerDeclared = currentModules.includes(CROP_AGRONOMY_MODULES.fertilizerExtraction)
    || currentModules.includes(CROP_AGRONOMY_MODULES.nutrientExcessGuide);
  const pestsDeclared = currentModules.includes(CROP_AGRONOMY_MODULES.pestMonitoring);
  const fertilizerResolution = technicalRouting && fertilizerDeclared
    ? getFertilizerProfile({ scientific, groupKey })
    : null;
  const pestResolution = technicalRouting && pestsDeclared
    ? getPestManagementProfile({ scientific, groupKey })
    : null;
  const hasExactModules = Boolean(fertilizerResolution || pestResolution);
  const officialSources = useMemo(() => {
    if (!technicalRouting) return [];
    return sourceListFromRefs(cropCoverage?.sourceRefs, (reference) => (
      Array.isArray(reference?.supports)
        && reference.supports.some((moduleKey) => currentModules.includes(moduleKey))
    ));
  }, [cropCoverage, currentModules, technicalRouting]);
  const planningSources = useMemo(() => {
    if (!technicalIdentity) return [];
    return sourceListFromRefs(cropCoverage?.sourceRefs, (reference) => (
      Array.isArray(reference?.supports)
        && !reference.supports.some((moduleKey) => currentModules.includes(moduleKey))
    ));
  }, [cropCoverage, currentModules, technicalIdentity]);

  useEffect(() => {
    let alive = true;
    // Esta camada nunca usa a excecao editorial nem o binomio legado. A API
    // precisa confirmar a mesma especie como Plantae no GBIF antes que uma
    // secao mundial possa aparecer no workspace.
    if (
      activeTab !== 'agronomist'
        || !globalEvidenceEligible
        || !globalDossierLookupKey
        || !scientific
    ) {
      return () => { alive = false; };
    }
    getSpeciesDossier({
      apiBase: API_BASE,
      category: 'crop',
      scientific,
      language: i18n.language,
    }).then(
      (dossier) => {
        if (alive) setGlobalDossierState({ key: globalDossierLookupKey, dossier });
      },
      () => {
        if (alive) setGlobalDossierState({ key: globalDossierLookupKey, dossier: null });
      }
    );
    return () => { alive = false; };
  }, [activeTab, globalDossierLookupKey, globalEvidenceEligible, i18n.language, scientific]);

  const globalTopics = useMemo(() => selectGlobalAgronomyTopics({
    entity,
    scientific,
    dossier: globalDossier,
    topics: buildSourceGroundedTopics({ dossier: globalDossier }),
  }), [entity, globalDossier, scientific]);
  const globalWikipediaSource = useMemo(
    () => globalAgronomyWikipediaSource(globalDossier),
    [globalDossier]
  );
  const globalTopicResourceKey = createSpeciesTopicResourceKey({
    category: 'crop',
    language: i18n.language,
    routeKey: route?.key ? `${route.key}:global-agronomy` : null,
    identity: scientific,
  });
  usePublishSpeciesTopics(globalTopicResourceKey, globalTopics);

  const canCreateProfile = Boolean(subjectKey && entity?.category === 'crop');
  const supportedEventTypes = EVENT_TYPE_ORDER.filter((type) => AGRONOMY_EVENT_TYPES.includes(type));
  const amountState = optionalAmount(eventAmount);
  const unitWithoutAmount = eventUnit.trim().length > 0 && amountState.amount === null;
  const amountWithoutUnit = amountState.amount !== null && eventUnit.trim().length === 0;
  const emptyEvent = eventNote.trim().length === 0 && amountState.amount === null;

  const profileRows = useMemo(() => {
    if (!profile) return [];
    const purpose = PURPOSE_KEYS.has(profile.purpose)
      ? t(`agronomyProfile.purposes.${profile.purpose}`)
      : null;
    const system = SYSTEM_KEYS.has(profile.system)
      ? t(`agronomyProfile.systems.${profile.system}`)
      : null;
    return [
      { key: 'purpose', label: t('agronomyProfile.summary.purpose'), value: purpose },
      { key: 'system', label: t('agronomyProfile.summary.system'), value: system },
      {
        key: 'location',
        label: t('agronomyProfile.summary.location'),
        value: agronomyLocationLabel(profile.location) || null,
      },
      { key: 'planting', label: t('agronomyProfile.summary.planting'), value: profile.planting?.date },
      { key: 'stage', label: t('agronomyProfile.summary.stage'), value: profile.planting?.stage },
      { key: 'soil', label: t('agronomyProfile.summary.soil'), value: profile.soil?.description },
      {
        key: 'report',
        label: t('agronomyProfile.summary.report'),
        value: typeof profile.soil?.hasReport === 'boolean'
          ? t(profile.soil.hasReport ? 'common.yes' : 'common.no')
          : null,
      },
    ].filter((row) => row.value);
  }, [profile, t]);
  const profileReady = Boolean(profile?.profileId && profileRows.length === 7);

  function openWizard() {
    if (!canCreateProfile) return;
    setProfileMessage(null);
    setProfileError(null);
    setWizardVisible(true);
  }

  function closeWizard() {
    if (profileSavingRef.current) return;
    setWizardVisible(false);
    setProfileError(null);
  }

  async function handleProfileSave(draft) {
    if (profileSavingRef.current || !canCreateProfile) return;
    profileSavingRef.current = true;
    setProfileSaving(true);
    setProfileError(null);
    const savingForKey = subjectKey;
    const storedProfile = await saveAgronomyProfile({ subjectKey: savingForKey, entity, draft });
    if (!storedProfile) {
      setProfileError('saveFailed');
      setProfileSaving(false);
      profileSavingRef.current = false;
      return;
    }
    const storedEvents = await getAgronomyEvents(storedProfile.profileId);
    if (subjectKeyRef.current === savingForKey) {
      setProfile(storedProfile);
      setEvents(storedEvents);
      setProfileMessage('saved');
      setWizardVisible(false);
    }
    setProfileSaving(false);
    profileSavingRef.current = false;
  }

  function resetEventForm() {
    setEventType('observation');
    setEventNote('');
    setEventAmount('');
    setEventUnit('');
    setEventError(null);
  }

  function cancelEventForm() {
    if (eventSavingRef.current) return;
    resetEventForm();
    setEventFormVisible(false);
  }

  async function saveEvent() {
    if (eventSavingRef.current || !profile?.profileId) return;
    if (!supportedEventTypes.includes(eventType)) {
      setEventError('typeInvalid');
      return;
    }
    if (!amountState.valid) {
      setEventError('amountInvalid');
      return;
    }
    if (unitWithoutAmount) {
      setEventError('unitNeedsValue');
      return;
    }
    if (amountWithoutUnit) {
      setEventError('unitRequired');
      return;
    }
    if (emptyEvent) {
      setEventError('emptyEvent');
      return;
    }

    eventSavingRef.current = true;
    setEventSaving(true);
    setEventError(null);
    setEventMessage(null);
    const profileId = profile.profileId;
    const eventForKey = subjectKey;
    const storedEvent = await appendAgronomyEvent(profileId, {
      type: eventType,
      note: eventNote,
      amount: amountState.amount,
      unit: amountState.amount === null ? '' : eventUnit,
      stage: profile.planting?.stage || '',
    });
    if (!storedEvent) {
      setEventError('saveFailed');
      setEventSaving(false);
      eventSavingRef.current = false;
      return;
    }
    if (subjectKeyRef.current === eventForKey) {
      setEvents((current) => [storedEvent, ...(Array.isArray(current) ? current : [])]);
      resetEventForm();
      setEventFormVisible(false);
      setEventMessage('saved');
    }
    setEventSaving(false);
    eventSavingRef.current = false;
  }

  function openSource(url) {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) return;
    Linking.openURL(url).catch(() => {});
  }

  function openGlobalTopic(key) {
    if (!globalTopics.some((topic) => topic.key === key)) return;
    navigation.navigate('CareTopics', {
      groupKey: null,
      title: entity?.name || scientific,
      accent: colors.accent,
      category: 'crop',
      topics: globalTopics,
      topicResourceKey: globalTopicResourceKey,
      initialKey: key,
    });
  }

  const renderEssential = () => (
    <>
      {profile === undefined ? (
        <View style={styles.loading} accessibilityRole="progressbar">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>{t('agronomyWorkspace.loadingProfile')}</Text>
        </View>
      ) : profileReady ? (
        <SectionCard icon="location-outline" title={t('agronomyWorkspace.contextTitle')} color={colors.accent}>
          <Text style={styles.body}>{t('agronomyWorkspace.contextBody')}</Text>
          <View style={styles.summaryBox}>
            {profileRows.map((row) => (
              <SummaryRow key={row.key} label={row.label} value={row.value} />
            ))}
          </View>
          <PrimaryAction
            label={t('agronomyWorkspace.editProfile')}
            icon="create-outline"
            onPress={openWizard}
          />
        </SectionCard>
      ) : (
        <SectionCard icon="map-outline" title={t('agronomyWorkspace.missingProfileTitle')} color={colors.accent}>
          <Text style={styles.body}>
            {t(canCreateProfile
              ? 'agronomyWorkspace.missingProfileBody'
              : 'agronomyWorkspace.profileUnavailableBody')}
          </Text>
          {canCreateProfile ? (
            <PrimaryAction
              label={t('agronomyWorkspace.createProfile')}
              icon="add-circle-outline"
              onPress={openWizard}
            />
          ) : null}
        </SectionCard>
      )}

      {profileMessage === 'saved' ? (
        <Text style={styles.success} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {t('agronomyWorkspace.profileSaved')}
        </Text>
      ) : null}

      {profileReady ? (
        <SectionCard icon="add-circle-outline" title={t('agronomyWorkspace.observationTitle')} color={colors.info}>
          <Text style={styles.body}>{t('agronomyWorkspace.observationBody')}</Text>
          {!eventFormVisible ? (
            <PrimaryAction
              label={t('agronomyWorkspace.addObservation')}
              icon="add-outline"
              onPress={() => {
                setEventMessage(null);
                setEventFormVisible(true);
              }}
              color={colors.info}
            />
          ) : (
            <View style={styles.eventForm}>
              <Text style={styles.label}>{t('agronomyWorkspace.eventTypeLabel')}</Text>
              <View style={styles.eventTypeGrid} accessibilityRole="radiogroup">
                {supportedEventTypes.map((type) => {
                  const selected = type === eventType;
                  const label = t(`agronomyWorkspace.eventTypes.${type}`);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.eventTypeChoice, selected && styles.eventTypeSelected]}
                      onPress={() => {
                        setEventType(type);
                        setEventError(null);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityLabel={label}
                      accessibilityState={{ checked: selected }}
                    >
                      <View style={[styles.radioDot, selected && styles.radioDotSelected]} />
                      <Text style={[styles.eventTypeText, selected && styles.eventTypeTextSelected]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('agronomyWorkspace.noteLabel')}</Text>
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={eventNote}
                onChangeText={(value) => {
                  setEventNote(value.slice(0, 500));
                  setEventError(null);
                }}
                placeholder={t('agronomyWorkspace.notePlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={500}
                textAlignVertical="top"
                accessibilityLabel={t('agronomyWorkspace.noteLabel')}
              />

              <View style={styles.valueRow}>
                <View style={styles.valueField}>
                  <Text style={styles.label}>{t('agronomyWorkspace.valueLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={eventAmount}
                    onChangeText={(value) => {
                      setEventAmount(value.slice(0, 20));
                      setEventError(null);
                    }}
                    placeholder={t('agronomyWorkspace.valuePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    maxLength={20}
                    accessibilityLabel={t('agronomyWorkspace.valueLabel')}
                  />
                </View>
                <View style={styles.valueField}>
                  <Text style={styles.label}>{t('agronomyWorkspace.unitLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={eventUnit}
                    onChangeText={(value) => {
                      setEventUnit(value.slice(0, 24));
                      setEventError(null);
                    }}
                    placeholder={t('agronomyWorkspace.unitPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    maxLength={24}
                    accessibilityLabel={t('agronomyWorkspace.unitLabel')}
                  />
                </View>
              </View>
              <Text style={styles.optionalHint}>{t('agronomyWorkspace.optionalFieldsHint')}</Text>

              {eventError ? (
                <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                  {t(`agronomyWorkspace.errors.${eventError}`)}
                </Text>
              ) : null}

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={cancelEventForm}
                  disabled={eventSaving}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                  accessibilityState={{ disabled: eventSaving }}
                >
                  <Text style={styles.secondaryActionText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formPrimaryAction, eventSaving && styles.disabled]}
                  onPress={saveEvent}
                  disabled={eventSaving}
                  accessibilityRole="button"
                  accessibilityLabel={t('agronomyWorkspace.saveObservation')}
                  accessibilityState={{ disabled: eventSaving }}
                >
                  {eventSaving ? <ActivityIndicator color={colors.background} size="small" /> : null}
                  <Text style={styles.primaryActionText}>
                    {t(eventSaving
                      ? 'agronomyWorkspace.savingObservation'
                      : 'agronomyWorkspace.saveObservation')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {eventMessage === 'saved' ? (
            <Text style={styles.success} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {t('agronomyWorkspace.observationSaved')}
            </Text>
          ) : null}
        </SectionCard>
      ) : null}

      {events === undefined && profileReady ? (
        <View style={styles.eventsLoading} accessibilityRole="progressbar">
          <ActivityIndicator color={colors.purple} size="small" />
        </View>
      ) : (
        <EventTimeline events={events} language={i18n.language} t={t} />
      )}
    </>
  );

  const renderAgronomist = () => (
    <>
      <SectionCard icon="shield-checkmark-outline" title={t('agronomyWorkspace.technicalStatusTitle')} color={colors.warning}>
        <View style={styles.statusHeader}>
          <View style={[
            styles.statusIcon,
            { backgroundColor: (hasExactModules ? colors.accent : colors.warning) + '1F' },
          ]}>
            <Ionicons
              name={hasExactModules ? 'checkmark-circle-outline' : 'lock-closed-outline'}
              size={22}
              color={hasExactModules ? colors.accent : colors.warning}
            />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>
              {t(hasExactModules
                ? 'agronomyWorkspace.technicalVerifiedTitle'
                : technicalRouting
                  ? 'agronomyWorkspace.noExactModulesTitle'
                  : 'agronomyWorkspace.technicalUnavailableTitle')}
            </Text>
            <Text style={styles.statusBody}>
              {t(hasExactModules
                ? editorialCatalog
                  ? 'agronomyWorkspace.technicalCatalogBody'
                  : 'agronomyWorkspace.technicalVerifiedBody'
                : technicalRouting
                  ? 'agronomyWorkspace.noExactModulesBody'
                  : 'agronomyWorkspace.technicalUnavailableBody')}
            </Text>
          </View>
        </View>
        {scientific ? <Text style={styles.technicalScientific}>{scientific}</Text> : null}
        {hasExactModules ? (
          <View style={styles.moduleChips}>
            {pestResolution ? (
              <View style={styles.moduleChip}>
                <Ionicons name="bug-outline" size={15} color={colors.warning} />
                <Text style={styles.moduleChipText}>{t('agronomyWorkspace.modules.pest')}</Text>
              </View>
            ) : null}
            {fertilizerResolution ? (
              <View style={styles.moduleChip}>
                <Ionicons name="flask-outline" size={15} color={colors.accent} />
                <Text style={styles.moduleChipText}>{t('agronomyWorkspace.modules.fertilizer')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.ruleNotice}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info} />
          <View style={styles.ruleCopy}>
            <Text style={styles.ruleTitle}>{t('agronomyWorkspace.ruleCatalogTitle')}</Text>
            <Text style={styles.ruleBody}>
              {t(editorialCatalog
                ? 'agronomyWorkspace.ruleCatalogCatalogBody'
                : engineGuideResolved
                  ? 'agronomyWorkspace.ruleCatalogGuideBody'
                  : 'agronomyWorkspace.ruleCatalogUnavailableBody')}
            </Text>
          </View>
        </View>
      </SectionCard>

      <GlobalAgronomyEvidenceCard
        topics={globalTopics}
        scientific={scientific}
        source={globalWikipediaSource}
        onOpenTopic={openGlobalTopic}
        onOpenSource={openSource}
      />

      {/* O catalogo atual contem apenas regras de guia. O resolver normaliza o
          contexto, mas nunca eleva UF, estadio livre ou texto do solo a regra
          numerica; os cards abaixo ainda exigem modulo current e resolver
          exato proprio. */}
      {pestResolution ? (
        <PestManagementTablesCard
          scientific={scientific}
          groupKey={groupKey}
          entityName={entity?.name}
        />
      ) : null}
      {fertilizerResolution ? (
        <FertilizerTablesCard
          scientific={scientific}
          groupKey={groupKey}
          entityName={entity?.name}
          accent={colors.accent}
        />
      ) : null}

      {officialSources.length > 0 ? (
        <SectionCard icon="library-outline" title={t('agronomyWorkspace.sourcesTitle')} color={colors.info}>
          <Text style={styles.body}>{t('agronomyWorkspace.sourcesBody')}</Text>
          <View style={styles.sourceList}>
            {officialSources.map((source) => (
              <TouchableOpacity
                key={source.url}
                style={styles.sourceLink}
                onPress={() => openSource(source.url)}
                activeOpacity={0.8}
                accessibilityRole="link"
                accessibilityLabel={t('agronomyWorkspace.openSource', { source: source.institution })}
              >
                <Ionicons name="open-outline" size={17} color={colors.info} />
                <Text style={styles.sourceText}>
                  {t('agronomyWorkspace.officialSource', { institution: source.institution })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {planningSources.length > 0 ? (
        <SectionCard icon="book-outline" title={t('agronomyWorkspace.planningSourcesTitle')} color={colors.purple}>
          <Text style={styles.body}>{t('agronomyWorkspace.planningSourcesBody')}</Text>
          <View style={styles.sourceList}>
            {planningSources.map((source) => (
              <TouchableOpacity
                key={source.url}
                style={styles.sourceLink}
                onPress={() => openSource(source.url)}
                activeOpacity={0.8}
                accessibilityRole="link"
                accessibilityLabel={t('agronomyWorkspace.openSource', { source: source.institution })}
              >
                <Ionicons name="open-outline" size={17} color={colors.purple} />
                <Text style={[styles.sourceText, { color: colors.purple }]}>
                  {t('agronomyWorkspace.officialSource', { institution: source.institution })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NatureScene accent={colors.accent} />
      <TopBar title={t('agronomyWorkspace.title')} onBack={() => navigation.goBack()} />

      <View style={styles.identityBand}>
        <View style={styles.identityIcon}>
          <Ionicons name="leaf-outline" size={22} color={colors.accentLight} />
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.entityName} numberOfLines={1}>
            {entity?.name || t('agronomyWorkspace.unknownCrop')}
          </Text>
          {scientific ? <Text style={styles.entityScientific} numberOfLines={1}>{scientific}</Text> : null}
          {editorialCatalog ? (
            <Text style={styles.catalogBadge}>{t('agronomyWorkspace.catalogBadge')}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={t(`agronomyWorkspace.tabs.${tab}`)}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                {t(`agronomyWorkspace.tabs.${tab}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'essential' ? renderEssential() : null}
        {activeTab === 'learn' ? <LearningFallback t={t} profile={profileReady ? profile : null} /> : null}
        {activeTab === 'agronomist' ? renderAgronomist() : null}
      </ScrollView>

      <Modal
        visible={wizardVisible}
        animationType="slide"
        onRequestClose={closeWizard}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <View
            style={styles.modalContent}
            accessibilityViewIsModal={true}
            onAccessibilityEscape={closeWizard}
          >
            {profileError ? (
              <Text style={styles.modalError} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {t('agronomyWorkspace.errors.saveFailed')}
              </Text>
            ) : null}
            <View style={styles.wizardWrap} pointerEvents={profileSaving ? 'none' : 'auto'}>
              <AgronomyProfileWizard
                initialValue={profile || undefined}
                onSave={handleProfileSave}
                onCancel={closeWizard}
              />
            </View>
            {profileSaving ? (
              <View style={styles.savingOverlay} accessible accessibilityRole="progressbar">
                <ActivityIndicator color={colors.accentLight} />
                <Text style={styles.savingText}>{t('agronomyWorkspace.savingProfile')}</Text>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  identityBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface + 'E6',
  },
  identityIcon: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent + '1F',
  },
  identityCopy: { flex: 1 },
  entityName: { ...type.cardTitle, fontSize: 16 },
  entityScientific: { ...type.caption, fontStyle: 'italic', marginTop: space.xxs },
  catalogBadge: { color: colors.info, fontSize: 11.5, lineHeight: 16, fontWeight: '900', marginTop: space.xxs },
  tabs: {
    flexDirection: 'row',
    gap: space.xs,
    marginHorizontal: space.md,
    marginBottom: space.xs,
    padding: space.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    minHeight: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
  },
  tabSelected: { backgroundColor: colors.accent + '24' },
  tabText: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  tabTextSelected: { color: colors.accentLight },
  scroll: { flex: 1 },
  content: { padding: space.md, paddingBottom: space.xxl },
  body: { ...type.body, marginBottom: space.md },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, gap: space.sm },
  loadingText: { ...type.body },
  eventsLoading: { alignItems: 'center', paddingVertical: space.md },
  summaryBox: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginBottom: space.md,
  },
  summaryRow: { paddingHorizontal: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  summaryLabel: { ...type.caption, color: colors.accentLight, fontWeight: '800', marginBottom: space.xxs },
  summaryValue: { ...type.body, color: colors.text },
  primaryAction: {
    minHeight: control.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
  },
  primaryActionText: { color: colors.background, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  success: { ...type.body, color: colors.success, fontWeight: '800', marginBottom: space.md },
  error: { ...type.body, color: colors.error, fontWeight: '800', marginTop: space.sm },
  eventForm: { marginTop: space.xs },
  label: { ...type.cardTitle, marginBottom: space.xs, marginTop: space.sm },
  eventTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  eventTypeChoice: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  eventTypeSelected: { borderColor: colors.info, backgroundColor: colors.info + '1A' },
  radioDot: { width: 17, height: 17, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.textMuted },
  radioDotSelected: { borderWidth: 5, borderColor: colors.info },
  eventTypeText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  eventTypeTextSelected: { color: colors.text },
  input: {
    minHeight: control.primaryHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  noteInput: { minHeight: 96 },
  valueRow: { flexDirection: 'row', gap: space.sm },
  valueField: { flex: 1 },
  optionalHint: { ...type.caption, marginTop: space.xs },
  formActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  secondaryAction: {
    flex: 1,
    minHeight: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  secondaryActionText: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
  formPrimaryAction: {
    flex: 1.4,
    minHeight: control.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.info,
    paddingHorizontal: space.sm,
  },
  timeline: { marginTop: space.xxs },
  timelineItem: { flexDirection: 'row', alignItems: 'stretch' },
  timelineRail: { width: 28, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: radius.pill, marginTop: 5, backgroundColor: colors.purple },
  timelineLine: { flex: 1, width: 2, minHeight: 34, backgroundColor: colors.purple + '44' },
  timelineContent: { flex: 1, paddingBottom: space.md },
  timelineHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.xs },
  timelineType: { ...type.cardTitle, flex: 1 },
  timelineDate: { ...type.caption, textAlign: 'right' },
  timelineNote: { ...type.body, color: colors.text, marginTop: space.xs },
  timelineAmount: { color: colors.info, fontSize: 13, lineHeight: 18, fontWeight: '900', marginTop: space.xs },
  timelineStage: { ...type.caption, marginTop: space.xxs },
  didacticFigure: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: space.lg,
  },
  didacticImage: { width: '100%', height: 190, backgroundColor: colors.surfaceElevated },
  didacticCaption: { padding: space.sm },
  didacticCaptionTitle: { ...type.cardTitle, color: colors.info, marginBottom: space.xxs },
  didacticCaptionBody: { ...type.caption, color: colors.textSecondary },
  learningFlow: { marginTop: space.xs },
  visualTopics: { gap: space.xs, marginTop: space.md, marginBottom: space.md },
  visualTopic: {
    minHeight: control.minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: space.sm,
  },
  visualTopicHeader: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  visualTopicIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualTopicTitle: { ...type.cardTitle, flex: 1 },
  visualTopicBody: { ...type.body, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  stageTrack: { minHeight: 34, flexDirection: 'row', alignItems: 'center', marginHorizontal: space.xs },
  stageDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.textMuted },
  stageDotActive: { width: 15, height: 15, backgroundColor: colors.accent },
  stageLine: { flex: 1, height: 2, backgroundColor: colors.border },
  stageConfirmed: { maxWidth: 90, color: colors.accentLight, fontSize: 11.5, fontWeight: '900', marginLeft: space.xs },
  soilProfile: { height: 58, overflow: 'hidden', borderRadius: radius.sm, position: 'relative' },
  soilLayer: { flex: 1 },
  soilTop: { backgroundColor: '#665137' },
  soilMiddle: { backgroundColor: '#4E3D2D' },
  soilBottom: { backgroundColor: '#352D27' },
  samplePoint: { position: 'absolute', width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.warning, borderWidth: 1, borderColor: colors.background },
  nutrientRow: { flexDirection: 'row', gap: space.xs },
  nutrientTile: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple + '1F', borderWidth: 1, borderColor: colors.purple + '55' },
  nutrientText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  decisionFlow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  decisionNode: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  learningStep: { flexDirection: 'row', alignItems: 'stretch' },
  learningRail: { width: 52, alignItems: 'center' },
  learningIcon: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.info + '66',
    backgroundColor: colors.info + '14',
  },
  learningLine: { flex: 1, width: 2, minHeight: space.md, backgroundColor: colors.info + '44' },
  learningCopy: { flex: 1, paddingLeft: space.sm, paddingBottom: space.lg },
  learningTitle: { ...type.cardTitle, marginTop: space.xs },
  learningBody: { ...type.body, marginTop: space.xxs },
  scopeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.info + '55',
    borderRadius: radius.md,
    backgroundColor: colors.info + '12',
    padding: space.md,
    marginBottom: space.md,
  },
  scopeCopy: { flex: 1 },
  scopeTitle: { ...type.cardTitle, marginBottom: space.xxs },
  scopeBody: { ...type.body },
  statusHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  statusIcon: { width: control.minTouch, height: control.minTouch, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  statusCopy: { flex: 1 },
  statusTitle: { ...type.cardTitle, marginBottom: space.xxs },
  statusBody: { ...type.body },
  technicalScientific: { ...type.caption, fontStyle: 'italic', marginTop: space.sm },
  moduleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  moduleChip: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
  },
  moduleChipText: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  ruleNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ruleCopy: { flex: 1 },
  ruleTitle: { color: colors.info, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  ruleBody: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  sourceList: { gap: space.xxs },
  sourceLink: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sourceText: { flex: 1, color: colors.info, fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
  modalSafeArea: { flex: 1, backgroundColor: colors.background },
  modalContent: { flex: 1 },
  wizardWrap: { flex: 1 },
  modalError: {
    ...type.body,
    color: colors.error,
    fontWeight: '800',
    marginHorizontal: space.md,
    marginTop: space.sm,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.background + 'DD',
  },
  savingText: { ...type.body, color: colors.text, fontWeight: '800' },
});
