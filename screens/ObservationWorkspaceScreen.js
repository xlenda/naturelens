import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import * as Haptics from 'expo-haptics';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import SectionCard from '../components/SectionCard';
import CategoryIcon from '../components/CategoryIcon';
import { CATEGORIES } from '../components/categories';
import {
  appendObservationEvent,
  getObservationEvents,
  getObservationProfile,
  observationSubjectKey,
  saveObservationProfile,
} from '../components/observationStorage';
import { getObservationWorkspaceConfig } from '../components/observationWorkspaceConfig';
import { colors, control, radius, shadow, space, type } from '../components/theme';

const TABS = Object.freeze(['essential', 'learn', 'field']);
const PROFILE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'context', type: 'enum', required: true }),
  Object.freeze({ key: 'placeNote', type: 'text', maxLength: 80 }),
  Object.freeze({ key: 'baselineNote', type: 'text', maxLength: 280 }),
]);

function cleanEntity(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function colorFor(token, accent) {
  if (token === 'info') return colors.info;
  if (token === 'warning') return colors.warning;
  if (token === 'purple') return colors.purple;
  if (token === 'error') return colors.error;
  return accent || colors.accent;
}

function formatDate(value, language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch (e) {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function optionalCount(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) return { valid: true, value: null };
  if (!/^\d+$/.test(clean)) return { valid: false, value: null };
  const parsed = Number(clean);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1000000
    ? { valid: true, value: parsed }
    : { valid: false, value: null };
}

function optionalMeasure(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) return { valid: true, value: null };
  if (!/^-?\d+(?:[.,]\d+)?$/.test(clean)) return { valid: false, value: null };
  const parsed = Number(clean.replace(',', '.'));
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1000000
    ? { valid: true, value: parsed }
    : { valid: false, value: null };
}

function VisualDiagram({ diagram, color }) {
  if (diagram === 'layers') {
    return (
      <View style={styles.layersDiagram} accessible={false}>
        <View style={[styles.layer, { backgroundColor: color + '55' }]} />
        <View style={[styles.layer, { backgroundColor: color + '36' }]} />
        <View style={[styles.layer, { backgroundColor: color + '20' }]} />
        <View style={[styles.layerMarker, { borderColor: color }]} />
      </View>
    );
  }

  if (diagram === 'grid') {
    return (
      <View style={styles.gridDiagram} accessible={false}>
        {Array.from({ length: 9 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.gridCell,
              index === 4 && { borderColor: color, backgroundColor: color + '2A' },
            ]}
          />
        ))}
      </View>
    );
  }

  if (diagram === 'waveform') {
    const heights = [12, 22, 34, 18, 42, 29, 16, 36, 24, 12, 31, 18];
    return (
      <View style={styles.waveform} accessible={false}>
        {heights.map((height, index) => (
          <View key={index} style={[styles.waveBar, { height, backgroundColor: color }]} />
        ))}
      </View>
    );
  }

  if (diagram === 'count') {
    return (
      <View style={styles.countDiagram} accessible={false}>
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={[styles.countDot, { backgroundColor: color + (index < 3 ? 'CC' : '35') }]} />
        ))}
      </View>
    );
  }

  if (diagram === 'compare') {
    return (
      <View style={styles.compareDiagram} accessible={false}>
        <View style={[styles.compareFrame, { borderColor: color + '77' }]}>
          <Ionicons name="camera-outline" size={19} color={color} />
        </View>
        <Ionicons name="arrow-forward" size={17} color={colors.textMuted} />
        <View style={[styles.compareFrame, { borderColor: color }]}>
          <Ionicons name="camera" size={19} color={color} />
        </View>
      </View>
    );
  }

  if (diagram === 'anatomy') {
    return (
      <View style={styles.anatomyDiagram} accessible={false}>
        <View style={[styles.anatomyPart, styles.anatomyPartSmall, { borderColor: color }]} />
        <View style={[styles.anatomyLine, { backgroundColor: color + '88' }]} />
        <View style={[styles.anatomyPart, { borderColor: color }]} />
        <View style={[styles.anatomyLine, { backgroundColor: color + '88' }]} />
        <View style={[styles.anatomyPart, styles.anatomyPartSmall, { borderColor: color }]} />
      </View>
    );
  }

  if (diagram === 'timeline') {
    return (
      <View style={styles.miniTimeline} accessible={false}>
        {[0, 1, 2].map((index) => (
          <React.Fragment key={index}>
            <View style={[styles.timelineNode, { borderColor: color, backgroundColor: index === 2 ? color : colors.surface }]} />
            {index < 2 ? <View style={[styles.timelineConnector, { backgroundColor: color + '66' }]} /> : null}
          </React.Fragment>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.flowDiagram} accessible={false}>
      {['eye-outline', 'create-outline', 'git-compare-outline', 'checkmark-circle-outline'].map((icon, index) => (
        <React.Fragment key={icon}>
          <View style={[styles.flowNode, { borderColor: color + '77' }]}>
            <Ionicons name={icon} size={16} color={color} />
          </View>
          {index < 3 ? <Ionicons name="chevron-forward" size={13} color={colors.textMuted} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function IdentityHeader({ entity, category, accent, t }) {
  const meta = CATEGORIES[category];
  const name = entity?.displayName || entity?.name || entity?.scientific;
  return (
    <View style={[styles.identityCard, { borderColor: accent + '55' }]}>
      <View style={[styles.identityIcon, { backgroundColor: accent + '22' }]}>
        <CategoryIcon name={meta?.icon || 'eye-outline'} size={25} color={accent} />
      </View>
      <View style={styles.identityCopy}>
        <Text style={styles.categoryLabel}>{t(`categories.${category}.label`)}</Text>
        {name ? <Text style={styles.identityName} numberOfLines={2}>{name}</Text> : null}
        {entity?.scientific ? <Text style={styles.scientific} numberOfLines={1}>{entity.scientific}</Text> : null}
      </View>
    </View>
  );
}

export default function ObservationWorkspaceScreen({ route }) {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const entity = cleanEntity(route?.params?.entity);
  const savedId = typeof route?.params?.savedId === 'string' ? route.params.savedId : '';
  const category = typeof entity?.category === 'string' ? entity.category : '';
  const config = useMemo(() => getObservationWorkspaceConfig(category), [category]);
  const subjectKey = useMemo(() => observationSubjectKey(entity, savedId), [entity, savedId]);
  const accent = CATEGORIES[category]?.accent || colors.accent;

  const [activeTab, setActiveTab] = useState('essential');
  const [profile, setProfile] = useState(undefined);
  const [events, setEvents] = useState(undefined);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileContext, setProfileContext] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [baselineNote, setBaselineNote] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventType, setEventType] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [eventCount, setEventCount] = useState('');
  const [eventMeasure, setEventMeasure] = useState('');
  const [eventUnit, setEventUnit] = useState('');
  const [eventBusy, setEventBusy] = useState(false);
  const [eventMessage, setEventMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [openVisual, setOpenVisual] = useState(null);

  useEffect(() => {
    let alive = true;
    setProfile(undefined);
    setEvents(undefined);
    if (!subjectKey || !config) {
      setProfile(null);
      setEvents([]);
      return () => { alive = false; };
    }
    getObservationProfile(subjectKey).then(async (storedProfile) => {
      if (!alive) return;
      const allowedContexts = new Set((config.contexts || []).map((option) => option.key));
      const storedContext = allowedContexts.has(storedProfile?.fields?.context)
        ? storedProfile.fields.context
        : '';
      setProfile(storedProfile);
      setProfileContext(storedContext);
      setPlaceNote(storedProfile?.fields?.placeNote || '');
      setBaselineNote(storedProfile?.fields?.baselineNote || '');
      if (!storedProfile?.profileId) {
        setEvents([]);
        return;
      }
      const storedEvents = await getObservationEvents(storedProfile.profileId);
      if (alive) setEvents(storedEvents);
    });
    return () => { alive = false; };
  }, [config, subjectKey]);

  useEffect(() => {
    const availableTypes = config?.eventTypes || [];
    if (!availableTypes.some((typeOption) => typeOption.key === eventType)) {
      setEventType(availableTypes[0]?.key || '');
      setEventFormOpen(false);
      setEventNote('');
      setEventCount('');
      setEventMeasure('');
      setEventUnit('');
      setFormError('');
    }
  }, [config, eventType]);

  const contextOptions = Array.isArray(config?.contexts) ? config.contexts : [];
  const eventTypes = Array.isArray(config?.eventTypes) ? config.eventTypes : [];
  const unitOptions = Array.isArray(config?.units) ? config.units : [];
  const visualTopics = Array.isArray(config?.visualTopics) ? config.visualTopics : [];
  const profileReady = Boolean(
    profile?.profileId
    && contextOptions.some((option) => option.key === profile?.fields?.context)
  );
  const countState = optionalCount(eventCount);
  const measureState = optionalMeasure(eventMeasure);
  const recordedTypes = useMemo(
    () => new Set((events || []).map((event) => event?.type).filter(Boolean)),
    [events]
  );
  const doneTypes = eventTypes.filter((type) => recordedTypes.has(type.key)).length;

  const startProfileEdit = () => {
    setProfileContext(profileReady ? profile.fields.context : '');
    setPlaceNote(profile?.fields?.placeNote || '');
    setBaselineNote(profile?.fields?.baselineNote || '');
    setProfileMessage('');
    setEditingProfile(true);
  };

  const cancelProfileEdit = () => {
    setProfileContext(profileReady ? profile.fields.context : '');
    setPlaceNote(profile?.fields?.placeNote || '');
    setBaselineNote(profile?.fields?.baselineNote || '');
    setEditingProfile(false);
  };

  const persistProfile = async () => {
    if (!subjectKey || !config || !profileContext || profileBusy) return;
    setProfileBusy(true);
    setProfileMessage('');
    const definitions = PROFILE_DEFINITIONS.map((definition) => (
      definition.key === 'context'
        ? { ...definition, options: contextOptions.map((option) => option.key) }
        : definition
    ));
    let stored = null;
    try {
      stored = await saveObservationProfile(subjectKey, category, {
        schemaVersion: 1,
        definitions,
        fields: {
          context: profileContext,
          placeNote,
          baselineNote,
        },
      });
    } catch (e) {
      stored = null;
    }
    setProfileBusy(false);
    if (!stored) {
      setProfileMessage('saveFailed');
      return;
    }
    setProfile(stored);
    setEditingProfile(false);
    setProfileMessage('saved');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const resetEventForm = () => {
    setEventNote('');
    setEventCount('');
    setEventMeasure('');
    setEventUnit('');
    setFormError('');
  };

  const persistEvent = async () => {
    if (!profileReady || !eventType || eventBusy) return;
    setFormError('');
    setEventMessage('');
    if (config.allowsCount && !countState.valid) {
      setFormError('invalidCount');
      return;
    }
    if (config.allowsMeasure && !measureState.valid) {
      setFormError('invalidMeasure');
      return;
    }
    if (config.allowsMeasure && measureState.value !== null && !eventUnit) {
      setFormError('unitRequired');
      return;
    }
    const storedCount = config.allowsCount ? countState.value : null;
    const storedMeasure = config.allowsMeasure ? measureState.value : null;
    if (!eventNote.trim() && storedCount === null && storedMeasure === null) {
      setFormError('emptyEvent');
      return;
    }
    setEventBusy(true);
    let stored = null;
    try {
      stored = await appendObservationEvent(profile.profileId, category, {
        type: eventType,
        note: eventNote,
        count: storedCount,
        measure: storedMeasure,
        unit: storedMeasure === null ? null : eventUnit,
      });
    } catch (e) {
      stored = null;
    }
    setEventBusy(false);
    if (!stored) {
      setFormError('saveFailed');
      return;
    }
    setEvents((current) => [stored, ...(current || [])]);
    resetEventForm();
    setEventFormOpen(false);
    setEventMessage('saved');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (!entity || !config || !subjectKey) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <NatureScene accent={accent} />
        <TopBar title={t('observationWorkspace.title')} onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Ionicons name="eye-off-outline" size={34} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('observationWorkspace.unavailableTitle')}</Text>
          <Text style={styles.emptyBody}>{t('observationWorkspace.unavailableBody')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const loading = profile === undefined || events === undefined;
  const contextLabel = profileReady
    ? t(`observationWorkspace.contexts.${category}.${profile.fields.context}`)
    : '';

  const renderProfile = () => (
    <SectionCard icon="compass-outline" title={t('observationWorkspace.setupTitle')} color={accent}>
      {editingProfile || !profileReady ? (
        <>
          <Text style={styles.body}>{t('observationWorkspace.setupBody')}</Text>
          <Text style={styles.fieldLabel}>{t('observationWorkspace.contextLabel')}</Text>
          <View style={styles.choiceGrid} accessibilityRole="radiogroup">
            {contextOptions.map((option) => {
              const selected = profileContext === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.choice, selected && { borderColor: accent, backgroundColor: accent + '18' }]}
                  onPress={() => setProfileContext(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                >
                  <Ionicons name={option.icon || 'location-outline'} size={18} color={selected ? accent : colors.textMuted} />
                  <Text style={[styles.choiceText, selected && { color: colors.text }]}>
                    {t(`observationWorkspace.contexts.${category}.${option.key}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>{t('observationWorkspace.placeLabel')}</Text>
          <TextInput
            style={styles.input}
            value={placeNote}
            onChangeText={setPlaceNote}
            maxLength={80}
            placeholder={t('observationWorkspace.placePlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.fieldLabel}>{t('observationWorkspace.baselineLabel')}</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={baselineNote}
            onChangeText={setBaselineNote}
            maxLength={280}
            multiline
            textAlignVertical="top"
            placeholder={t('observationWorkspace.baselinePlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.actionRow}>
            {profileReady ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={cancelProfileEdit} disabled={profileBusy}>
                <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: accent }, (!profileContext || profileBusy) && styles.disabled]}
              onPress={persistProfile}
              disabled={!profileContext || profileBusy}
              accessibilityRole="button"
              accessibilityState={{ busy: profileBusy, disabled: !profileContext || profileBusy }}
            >
              {profileBusy ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="checkmark" size={18} color={colors.white} />}
              <Text style={styles.primaryText}>{t('observationWorkspace.saveProfile')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={styles.profileSummary}>
            <Text style={[styles.profileContext, { color: accent }]}>{contextLabel}</Text>
            {profile.fields?.placeNote ? <Text style={styles.profileValue}>{profile.fields.placeNote}</Text> : null}
            {profile.fields?.baselineNote ? <Text style={styles.profileNote}>{profile.fields.baselineNote}</Text> : null}
          </View>
          <TouchableOpacity style={styles.outlineButton} onPress={startProfileEdit} accessibilityRole="button">
            <Ionicons name="create-outline" size={17} color={accent} />
            <Text style={[styles.outlineText, { color: accent }]}>{t('observationWorkspace.editProfile')}</Text>
          </TouchableOpacity>
        </>
      )}
      {profileMessage ? (
        <Text style={profileMessage === 'saved' ? styles.successText : styles.errorText} accessibilityRole="alert">
          {t(`observationWorkspace.${profileMessage === 'saved' ? 'profileSaved' : 'saveFailed'}`)}
        </Text>
      ) : null}
    </SectionCard>
  );

  const renderEventForm = () => (
    <SectionCard icon="add-circle-outline" title={t('observationWorkspace.addEvent')} color={colors.info}>
      <Text style={styles.fieldLabel}>{t('observationWorkspace.eventTypeLabel')}</Text>
      <View style={styles.choiceGrid} accessibilityRole="radiogroup">
        {eventTypes.map((typeOption) => {
          const selected = eventType === typeOption.key;
          return (
            <TouchableOpacity
              key={typeOption.key}
              style={[styles.choice, selected && { borderColor: colors.info, backgroundColor: colors.info + '18' }]}
              onPress={() => setEventType(typeOption.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Ionicons name={typeOption.icon || 'eye-outline'} size={18} color={selected ? colors.info : colors.textMuted} />
              <Text style={[styles.choiceText, selected && { color: colors.text }]}>
                {t(`observationWorkspace.eventTypes.${category}.${typeOption.key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>{t('observationWorkspace.noteLabel')}</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={eventNote}
        onChangeText={setEventNote}
        maxLength={500}
        multiline
        textAlignVertical="top"
        placeholder={t('observationWorkspace.notePlaceholder')}
        placeholderTextColor={colors.textMuted}
      />
      {config.allowsCount ? (
        <>
          <Text style={styles.fieldLabel}>{t('observationWorkspace.countLabel')}</Text>
          <TextInput
            style={styles.input}
            value={eventCount}
            onChangeText={setEventCount}
            inputMode="numeric"
            keyboardType="number-pad"
            placeholder={t('observationWorkspace.optionalLabel')}
            placeholderTextColor={colors.textMuted}
          />
        </>
      ) : null}
      {config.allowsMeasure ? (
        <>
          <Text style={styles.fieldLabel}>{t('observationWorkspace.measureLabel')}</Text>
          <TextInput
            style={styles.input}
            value={eventMeasure}
            onChangeText={setEventMeasure}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder={t('observationWorkspace.optionalLabel')}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.fieldLabel}>{t('observationWorkspace.unitLabel')}</Text>
          <View style={styles.unitRow}>
            {unitOptions.map((unit) => {
              const value = unit.value || unit.key;
              const selected = eventUnit === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.unitChip, selected && { borderColor: colors.info, backgroundColor: colors.info + '18' }]}
                  onPress={() => setEventUnit(selected ? '' : value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.unitText, selected && { color: colors.info }]}>
                    {unit.labelKey ? t(unit.labelKey) : value}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}
      {formError ? <Text style={styles.errorText} accessibilityRole="alert">{t(`observationWorkspace.${formError}`)}</Text> : null}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => { resetEventForm(); setEventFormOpen(false); }}
          disabled={eventBusy}
        >
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.info }, eventBusy && styles.disabled]}
          onPress={persistEvent}
          disabled={eventBusy}
          accessibilityRole="button"
          accessibilityState={{ busy: eventBusy, disabled: eventBusy }}
        >
          {eventBusy ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="save-outline" size={18} color={colors.white} />}
          <Text style={styles.primaryText}>{t('observationWorkspace.saveEvent')}</Text>
        </TouchableOpacity>
      </View>
    </SectionCard>
  );

  const renderTimeline = () => {
    if (!events?.length) {
      return (
        <View style={styles.timelineEmpty}>
          <Ionicons name="time-outline" size={26} color={colors.textMuted} />
          <Text style={styles.emptyBody}>{t('observationWorkspace.timelineEmpty')}</Text>
        </View>
      );
    }
    return (
      <SectionCard icon="time-outline" title={t('observationWorkspace.timelineTitle')} color={colors.purple}>
        {events.map((event, index) => {
          const amount = Number.isFinite(event?.measure) ? `${event.measure} ${event.unit || ''}`.trim() : '';
          const count = Number.isFinite(event?.count) ? String(event.count) : '';
          return (
            <View key={event.eventId} style={styles.timelineItem}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, { backgroundColor: accent }]} />
                {index < events.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: accent + '44' }]} /> : null}
              </View>
              <View style={styles.timelineCopy}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineType}>
                    {t(`observationWorkspace.eventTypes.${category}.${event.type}`)}
                  </Text>
                  <Text style={styles.timelineDate}>{formatDate(event.occurredAt, i18n.language)}</Text>
                </View>
                {event.note ? <Text style={styles.timelineNote}>{event.note}</Text> : null}
                {count || amount ? (
                  <View style={styles.measureRow}>
                    {count ? <Text style={[styles.measureChip, { color: accent }]}>{t('observationWorkspace.countLabel')}: {count}</Text> : null}
                    {amount ? <Text style={[styles.measureChip, { color: accent }]}>{amount}</Text> : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </SectionCard>
    );
  };

  const renderEssential = () => (
    <>
      {renderProfile()}
      {profileReady ? (
        eventFormOpen ? renderEventForm() : (
          <TouchableOpacity
            style={[styles.addEventButton, { borderColor: accent }]}
            onPress={() => { setEventMessage(''); setEventFormOpen(true); }}
            accessibilityRole="button"
          >
            <View style={[styles.addEventIcon, { backgroundColor: accent + '22' }]}>
              <Ionicons name="add" size={22} color={accent} />
            </View>
            <Text style={styles.addEventText}>{t('observationWorkspace.addEvent')}</Text>
            <Ionicons name="chevron-forward" size={18} color={accent} />
          </TouchableOpacity>
        )
      ) : null}
      {eventMessage ? <Text style={styles.successText}>{t('observationWorkspace.eventSaved')}</Text> : null}
      {renderTimeline()}
      <View style={styles.localNotice}>
        <Ionicons name="phone-portrait-outline" size={18} color={colors.info} />
        <Text style={styles.localNoticeText}>{t('observationWorkspace.localOnly')}</Text>
      </View>
    </>
  );

  const renderLearn = () => (
    <>
      <SectionCard icon="school-outline" title={t('observationWorkspace.learningTitle')} color={colors.info}>
        <Text style={styles.body}>{t('observationWorkspace.learningBody')}</Text>
        <View style={styles.visualList}>
          {visualTopics.map((topic) => {
            const expanded = openVisual === topic.key;
            const color = colorFor(topic.colorToken, accent);
            const title = t(`observationWorkspace.visuals.${category}.${topic.key}.title`);
            return (
              <TouchableOpacity
                key={topic.key}
                style={[styles.visualCard, expanded && { borderColor: color + '99' }]}
                onPress={() => setOpenVisual(expanded ? null : topic.key)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ expanded }}
              >
                <View style={styles.visualHeader}>
                  <View style={[styles.visualIcon, { backgroundColor: color + '20' }]}>
                    <Ionicons name={topic.icon || 'eye-outline'} size={19} color={color} />
                  </View>
                  <Text style={styles.visualTitle}>{title}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={expanded ? color : colors.textMuted} />
                </View>
                <VisualDiagram diagram={topic.diagram} color={color} />
                {expanded ? (
                  <Text style={styles.visualBody}>
                    {t(`observationWorkspace.visuals.${category}.${topic.key}.body`)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>
      <View style={styles.scopeNotice}>
        <Ionicons name="eye-outline" size={19} color={colors.info} />
        <Text style={styles.scopeText}>{t('observationWorkspace.generalDiagram')}</Text>
      </View>
      {category === 'mushroom' ? (
        <View style={styles.dangerNotice}>
          <Ionicons name="warning-outline" size={20} color={colors.error} />
          <Text style={styles.dangerText}>{t('observationWorkspace.mushroomSafety')}</Text>
        </View>
      ) : null}
    </>
  );

  const renderField = () => (
    <>
      <SectionCard icon="analytics-outline" title={t('observationWorkspace.fieldTitle')} color={accent}>
        <Text style={styles.body}>{t('observationWorkspace.fieldBody')}</Text>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {t('observationWorkspace.progressLabel', { done: doneTypes, total: eventTypes.length })}
          </Text>
          <Text style={[styles.progressCount, { color: accent }]}>{doneTypes}/{eventTypes.length}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: eventTypes.length ? `${Math.round((doneTypes / eventTypes.length) * 100)}%` : '0%',
                backgroundColor: accent,
              },
            ]}
          />
        </View>
        <View style={styles.evidenceList}>
          {eventTypes.map((typeOption) => {
            const recorded = recordedTypes.has(typeOption.key);
            return (
              <View key={typeOption.key} style={styles.evidenceRow}>
                <View style={[styles.evidenceStatus, recorded && { backgroundColor: accent + '22' }]}>
                  <Ionicons name={recorded ? 'checkmark' : 'ellipse-outline'} size={16} color={recorded ? accent : colors.textMuted} />
                </View>
                <Text style={styles.evidenceName}>
                  {t(`observationWorkspace.eventTypes.${category}.${typeOption.key}`)}
                </Text>
                <Text style={recorded ? styles.recorded : styles.missing}>
                  {t(`observationWorkspace.${recorded ? 'recordedLabel' : 'missingLabel'}`)}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.evidenceNote}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} />
          <Text style={styles.evidenceNoteText}>{t('observationWorkspace.evidenceNote')}</Text>
        </View>
      </SectionCard>
      {profileReady ? (
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: accent }]}
          onPress={() => { setActiveTab('essential'); setEventFormOpen(true); }}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={19} color={colors.white} />
          <Text style={styles.primaryText}>{t('observationWorkspace.addEvent')}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <NatureScene accent={accent} />
      <TopBar title={t('observationWorkspace.title')} onBack={() => navigation.goBack()} />
      <IdentityHeader entity={entity} category={category} accent={accent} t={t} />
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, selected && { backgroundColor: accent + '22' }]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && { color: accent }]}>
                {t(`observationWorkspace.tabs.${tab}`)}
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
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.body}>{t('observationWorkspace.loading')}</Text>
          </View>
        ) : null}
        {!loading && activeTab === 'essential' ? renderEssential() : null}
        {!loading && activeTab === 'learn' ? renderLearn() : null}
        {!loading && activeTab === 'field' ? renderField() : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: space.md, paddingBottom: space.xxl },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyTitle: { ...type.cardTitle, textAlign: 'center' },
  emptyBody: { ...type.body, textAlign: 'center' },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, gap: space.sm },
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.md,
    marginBottom: space.sm, padding: space.sm, borderWidth: 1, borderRadius: radius.md,
    backgroundColor: colors.surface, ...shadow,
  },
  identityIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1 },
  categoryLabel: { ...type.caption, fontWeight: '800', textTransform: 'uppercase' },
  identityName: { ...type.cardTitle, fontSize: 17, lineHeight: 22, marginTop: 2 },
  scientific: { ...type.caption, fontStyle: 'italic', marginTop: 2 },
  tabs: { flexDirection: 'row', gap: space.xs, marginHorizontal: space.md, marginBottom: space.xs, padding: space.xxs, borderRadius: radius.md, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: control.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: space.xxs },
  tabText: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  body: { ...type.body, marginBottom: space.sm },
  fieldLabel: { ...type.cardTitle, marginTop: space.sm, marginBottom: space.xs },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  choice: { flexBasis: '47%', flexGrow: 1, minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  choiceText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  input: { minHeight: control.primaryHeight, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, color: colors.text, fontSize: 14, lineHeight: 20, paddingHorizontal: space.sm, paddingVertical: space.sm },
  multilineInput: { minHeight: 92 },
  actionRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  primaryButton: { flex: 1, minHeight: control.primaryHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: radius.sm, paddingHorizontal: space.md },
  primaryText: { color: colors.white, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: control.primaryHeight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  secondaryText: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  successText: { ...type.body, color: colors.success, fontWeight: '800', marginTop: space.sm },
  errorText: { ...type.body, color: colors.error, fontWeight: '800', marginTop: space.sm },
  profileSummary: { padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surface, marginBottom: space.sm },
  profileContext: { ...type.cardTitle, marginBottom: space.xs },
  profileValue: { ...type.body, color: colors.text },
  profileNote: { ...type.caption, color: colors.textSecondary, marginTop: space.xs },
  outlineButton: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  outlineText: { fontSize: 13.5, fontWeight: '800' },
  addEventButton: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.card, padding: space.sm, marginBottom: space.md, ...shadow },
  addEventIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  addEventText: { ...type.cardTitle, flex: 1 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  unitChip: { minHeight: control.minTouch, minWidth: control.minTouch, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: space.sm },
  unitText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '800' },
  timelineEmpty: { alignItems: 'center', gap: space.xs, padding: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, marginBottom: space.md },
  timelineItem: { flexDirection: 'row', alignItems: 'stretch' },
  timelineRail: { width: 28, alignItems: 'center' },
  timelineDot: { width: 11, height: 11, borderRadius: radius.pill, marginTop: 5 },
  timelineLine: { flex: 1, width: 2, minHeight: 42 },
  timelineCopy: { flex: 1, paddingBottom: space.md },
  timelineHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  timelineType: { ...type.cardTitle, flex: 1 },
  timelineDate: { ...type.caption, textAlign: 'right' },
  timelineNote: { ...type.body, color: colors.text, marginTop: space.xs },
  measureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  measureChip: { fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  localNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.info + '12', borderWidth: 1, borderColor: colors.info + '44' },
  localNoticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  visualList: { gap: space.xs, marginTop: space.sm },
  visualCard: { minHeight: control.minTouch, padding: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  visualHeader: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  visualIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  visualTitle: { ...type.cardTitle, flex: 1 },
  visualBody: { ...type.body, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  layersDiagram: { height: 54, overflow: 'hidden', borderRadius: radius.sm, position: 'relative' },
  layer: { flex: 1 },
  layerMarker: { position: 'absolute', left: '47%', top: 7, width: 12, height: 35, borderLeftWidth: 2, borderBottomWidth: 2, borderRadius: 6 },
  gridDiagram: { flexDirection: 'row', flexWrap: 'wrap', width: 108, gap: 4, alignSelf: 'center', marginVertical: space.xs },
  gridCell: { width: 32, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  waveform: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  waveBar: { width: 4, borderRadius: radius.pill, opacity: 0.82 },
  countDiagram: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  countDot: { width: 22, height: 22, borderRadius: radius.pill },
  compareDiagram: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  compareFrame: { width: 60, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  anatomyDiagram: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  anatomyPart: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: 2, backgroundColor: colors.surfaceElevated },
  anatomyPartSmall: { width: 22, height: 22 },
  anatomyLine: { width: 25, height: 2 },
  miniTimeline: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timelineNode: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2 },
  timelineConnector: { width: 52, height: 2 },
  flowDiagram: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  flowNode: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  scopeNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderWidth: 1, borderColor: colors.info + '55', borderRadius: radius.md, backgroundColor: colors.info + '12', padding: space.md },
  scopeText: { ...type.body, flex: 1 },
  dangerNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderWidth: 1, borderColor: colors.error + '66', borderRadius: radius.md, backgroundColor: colors.error + '12', padding: space.md, marginTop: space.md },
  dangerText: { ...type.body, color: colors.text, flex: 1 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  progressLabel: { ...type.cardTitle, flex: 1 },
  progressCount: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, marginTop: space.xs, marginBottom: space.md },
  progressFill: { height: '100%', borderRadius: radius.pill },
  evidenceList: { gap: space.xs },
  evidenceRow: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xxs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  evidenceStatus: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  evidenceName: { ...type.body, color: colors.text, flex: 1 },
  recorded: { ...type.caption, color: colors.success, fontWeight: '800' },
  missing: { ...type.caption },
  evidenceNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, marginTop: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  evidenceNoteText: { ...type.caption, color: colors.textSecondary, flex: 1 },
});
