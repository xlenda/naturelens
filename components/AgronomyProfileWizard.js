import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AgronomyCountryPicker, { agronomyCountryName } from './AgronomyCountryPicker';
import { colors, control, radius, shadow, space, type } from './theme';
import {
  AGRONOMY_PROFILE_VERSION,
  BRAZIL_ADMIN1_CODES,
  agronomyLocationLabel,
  migrateAgronomyProfileToV2,
  normalizeAdmin1Code,
  normalizeCountryCode,
  validAgronomyLocationV2,
} from './agronomyProfileV2';

const PURPOSES = ['grain', 'fresh', 'processing', 'forage', 'seed', 'other'];
const SYSTEMS = ['rainfed', 'irrigated', 'protected', 'hydroponic', 'other'];
const STEP_KEYS = ['purpose', 'location', 'planting', 'soil', 'summary'];

const EMPTY_PROFILE = Object.freeze({
  schemaVersion: AGRONOMY_PROFILE_VERSION,
  purpose: '',
  system: '',
  location: Object.freeze({ countryCode: '', admin1Code: '', locality: '' }),
  planting: Object.freeze({ date: '', stage: '', stageConfirmed: false }),
  soil: Object.freeze({ description: '', hasReport: null }),
});

function safeText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function sanitizeInitialValue(value) {
  const migrated = migrateAgronomyProfileToV2(value);
  const source = migrated || EMPTY_PROFILE;
  const location = source.location || {};
  const planting = source.planting || {};
  const soil = source.soil || {};

  // Valores desconhecidos nao entram no formulario: o perfil sempre comeca
  // vazio onde a origem nao respeita o contrato (fail-closed).
  return {
    schemaVersion: AGRONOMY_PROFILE_VERSION,
    purpose: PURPOSES.includes(source.purpose) ? source.purpose : '',
    system: SYSTEMS.includes(source.system) ? source.system : '',
    location: {
      countryCode: normalizeCountryCode(location.countryCode) || '',
      admin1Code: normalizeAdmin1Code(location.admin1Code, location.countryCode) || '',
      locality: safeText(location.locality, 80),
    },
    planting: {
      date: safeText(planting.date, 10),
      stage: safeText(planting.stage, 80),
      stageConfirmed: planting.stageConfirmed === true,
    },
    soil: {
      description: safeText(soil.description, 160),
      hasReport: typeof soil.hasReport === 'boolean' ? soil.hasReport : null,
    },
  };
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validateStep(profile, stepIndex) {
  if (stepIndex === 0) {
    return PURPOSES.includes(profile.purpose) && SYSTEMS.includes(profile.system)
      ? null
      : 'selectPurposeAndSystem';
  }
  if (stepIndex === 1) {
    return validAgronomyLocationV2(profile.location) ? null : 'completeLocation';
  }
  if (stepIndex === 2) {
    if (!isRealIsoDate(profile.planting.date) || profile.planting.stage.trim().length < 1) {
      return 'completePlanting';
    }
    return profile.planting.stageConfirmed ? null : 'confirmStage';
  }
  if (stepIndex === 3) {
    if (profile.soil.description.trim().length < 2) return 'completeSoil';
    return typeof profile.soil.hasReport === 'boolean' ? null : 'chooseReport';
  }
  return [0, 1, 2, 3].every((index) => validateStep(profile, index) === null)
    ? null
    : 'formIncomplete';
}

function createPayload(profile) {
  return {
    schemaVersion: AGRONOMY_PROFILE_VERSION,
    purpose: profile.purpose,
    system: profile.system,
    location: {
      countryCode: profile.location.countryCode.trim().toUpperCase(),
      admin1Code: profile.location.admin1Code.trim().toUpperCase() || null,
      locality: profile.location.locality.trim(),
    },
    planting: {
      date: profile.planting.date,
      stage: profile.planting.stage.trim(),
      stageConfirmed: true,
    },
    soil: {
      description: profile.soil.description.trim(),
      hasReport: profile.soil.hasReport,
    },
  };
}

function ChoiceGroup({ label, options, value, onChange, translationPrefix, t }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceGrid} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = value === option;
          const optionLabel = t(`${translationPrefix}.${option}`);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.choice, selected && styles.choiceSelected]}
              activeOpacity={0.8}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityLabel={optionLabel}
              accessibilityState={{ checked: selected }}
            >
              <View style={[styles.radioDot, selected && styles.radioDotSelected]} />
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {optionLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function BooleanChoice({ label, value, onChange, t }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.booleanRow} accessibilityRole="radiogroup">
        {[true, false].map((option) => {
          const selected = value === option;
          const optionLabel = t(option ? 'common.yes' : 'common.no');
          return (
            <TouchableOpacity
              key={String(option)}
              style={[styles.booleanChoice, selected && styles.choiceSelected]}
              activeOpacity={0.8}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityLabel={optionLabel}
              accessibilityState={{ checked: selected }}
            >
              <View style={[styles.radioDot, selected && styles.radioDotSelected]} />
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {optionLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function AgronomyProfileWizard({ initialValue, onSave, onCancel }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => sanitizeInitialValue(initialValue || EMPTY_PROFILE));
  const [errorKey, setErrorKey] = useState(null);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  useEffect(() => {
    setProfile(sanitizeInitialValue(initialValue || EMPTY_PROFILE));
    setStep(0);
    setErrorKey(null);
    setCountryPickerVisible(false);
  }, [initialValue]);

  const fullError = useMemo(() => validateStep(profile, 4), [profile]);
  const canSave = fullError === null && typeof onSave === 'function';
  const currentKey = STEP_KEYS[step];

  function updateRoot(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
    setErrorKey(null);
  }

  function updateSection(section, key, value) {
    setProfile((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
    setErrorKey(null);
  }

  function goNext() {
    const nextError = validateStep(profile, step);
    if (nextError) {
      setErrorKey(nextError);
      return;
    }
    setErrorKey(null);
    setStep((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  }

  function goBack() {
    setErrorKey(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  function saveProfile() {
    const nextError = validateStep(profile, 4);
    if (nextError || typeof onSave !== 'function') {
      setErrorKey(nextError || 'saveUnavailable');
      return;
    }
    onSave(createPayload(profile));
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('agronomyProfile.eyebrow')}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {t('agronomyProfile.title')}
          </Text>
          <Text style={styles.subtitle}>{t('agronomyProfile.subtitle')}</Text>
        </View>

        <View
          style={styles.progressBlock}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 1,
            max: STEP_KEYS.length,
            now: step + 1,
            text: t('agronomyProfile.stepCounter', { current: step + 1, total: STEP_KEYS.length }),
          }}
        >
          <View style={styles.progressTrack}>
            {STEP_KEYS.map((key, index) => (
              <View
                key={key}
                style={[styles.progressSegment, index <= step && styles.progressSegmentActive]}
              />
            ))}
          </View>
          <Text style={styles.stepCounter}>
            {t('agronomyProfile.stepCounter', { current: step + 1, total: STEP_KEYS.length })}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.stepTitle} accessibilityRole="header">
            {t(`agronomyProfile.steps.${currentKey}.title`)}
          </Text>
          <Text style={styles.stepBody}>{t(`agronomyProfile.steps.${currentKey}.body`)}</Text>

          {step === 0 ? (
            <>
              <ChoiceGroup
                label={t('agronomyProfile.purposeLabel')}
                options={PURPOSES}
                value={profile.purpose}
                onChange={(value) => updateRoot('purpose', value)}
                translationPrefix="agronomyProfile.purposes"
                t={t}
              />
              <ChoiceGroup
                label={t('agronomyProfile.systemLabel')}
                options={SYSTEMS}
                value={profile.system}
                onChange={(value) => updateRoot('system', value)}
                translationPrefix="agronomyProfile.systems"
                t={t}
              />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>{t('agronomyProfile.manualLocationTitle')}</Text>
                <Text style={styles.noticeBody}>{t('agronomyProfile.manualLocationBody')}</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('agronomyProfile.countryCodeLabel')}</Text>
                <TouchableOpacity
                  style={styles.countrySelector}
                  activeOpacity={0.8}
                  onPress={() => setCountryPickerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('agronomyProfile.countryCodeLabel')}
                  accessibilityState={{ expanded: countryPickerVisible }}
                >
                  <View style={styles.countrySelectorCopy}>
                    <Text style={profile.location.countryCode ? styles.countrySelectorText : styles.countryPlaceholder}>
                      {profile.location.countryCode
                        ? agronomyCountryName(profile.location.countryCode, i18n.language)
                        : t('agronomyProfile.countryCodePlaceholder')}
                    </Text>
                    {profile.location.countryCode ? (
                      <Text style={styles.countrySelectorCode}>{profile.location.countryCode}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-down" size={19} color={colors.textMuted} />
                </TouchableOpacity>
                <Text style={styles.hint}>{t('agronomyProfile.countryCodeHint')}</Text>
              </View>
              {profile.location.countryCode === 'BR' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{t('agronomyProfile.admin1CodeLabel')}</Text>
                  <Text style={styles.hint}>{t('agronomyProfile.admin1CodeHint')}</Text>
                  <View style={styles.stateGrid} accessibilityRole="radiogroup">
                    {BRAZIL_ADMIN1_CODES.map((admin1Code) => {
                      const selected = profile.location.admin1Code === admin1Code;
                      const stateCode = admin1Code.slice(3);
                      return (
                        <TouchableOpacity
                          key={admin1Code}
                          style={[styles.stateChoice, selected && styles.stateChoiceSelected]}
                          activeOpacity={0.8}
                          onPress={() => updateSection('location', 'admin1Code', admin1Code)}
                          accessibilityRole="radio"
                          accessibilityLabel={stateCode}
                          accessibilityState={{ checked: selected }}
                        >
                          <Text style={[styles.stateText, selected && styles.choiceTextSelected]}>
                            {stateCode}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{t('agronomyProfile.admin1CodeLabel')}</Text>
                  <TextInput
                    style={styles.input}
                    value={profile.location.admin1Code}
                    onChangeText={(value) => updateSection(
                      'location',
                      'admin1Code',
                      value.toUpperCase().replace(/_/g, '-').replace(/[^A-Z0-9-]/g, '').slice(0, 6)
                    )}
                    placeholder={t('agronomyProfile.admin1CodePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    accessibilityLabel={t('agronomyProfile.admin1CodeLabel')}
                  />
                  <Text style={styles.hint}>{t('agronomyProfile.admin1CodeHint')}</Text>
                </View>
              )}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('agronomyProfile.localityLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={profile.location.locality}
                  onChangeText={(value) => updateSection('location', 'locality', value.slice(0, 80))}
                  placeholder={t('agronomyProfile.localityPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={80}
                  accessibilityLabel={t('agronomyProfile.localityLabel')}
                />
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('agronomyProfile.plantingDateLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={profile.planting.date}
                  onChangeText={(value) => updateSection('planting', 'date', value.slice(0, 10))}
                  placeholder={t('agronomyProfile.plantingDatePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  maxLength={10}
                  accessibilityLabel={t('agronomyProfile.plantingDateLabel')}
                  accessibilityHint={t('agronomyProfile.plantingDateHint')}
                />
                <Text style={styles.hint}>{t('agronomyProfile.plantingDateHint')}</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('agronomyProfile.stageLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={profile.planting.stage}
                  onChangeText={(value) => {
                    updateSection('planting', 'stage', value.slice(0, 80));
                    updateSection('planting', 'stageConfirmed', false);
                  }}
                  placeholder={t('agronomyProfile.stagePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  maxLength={80}
                  accessibilityLabel={t('agronomyProfile.stageLabel')}
                />
              </View>
              <TouchableOpacity
                style={[styles.confirmChoice, profile.planting.stageConfirmed && styles.choiceSelected]}
                activeOpacity={0.8}
                onPress={() => updateSection('planting', 'stageConfirmed', !profile.planting.stageConfirmed)}
                accessibilityRole="checkbox"
                accessibilityLabel={t('agronomyProfile.stageConfirmedLabel')}
                accessibilityState={{ checked: profile.planting.stageConfirmed }}
              >
                <View style={[styles.checkbox, profile.planting.stageConfirmed && styles.checkboxSelected]}>
                  <Text style={styles.checkmark}>{profile.planting.stageConfirmed ? '✓' : ''}</Text>
                </View>
                <Text style={styles.confirmText}>{t('agronomyProfile.stageConfirmedLabel')}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t('agronomyProfile.soilDescriptionLabel')}</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={profile.soil.description}
                  onChangeText={(value) => updateSection('soil', 'description', value.slice(0, 160))}
                  placeholder={t('agronomyProfile.soilDescriptionPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={160}
                  textAlignVertical="top"
                  accessibilityLabel={t('agronomyProfile.soilDescriptionLabel')}
                />
                <Text style={styles.characterCount}>{profile.soil.description.length}/160</Text>
              </View>
              <BooleanChoice
                label={t('agronomyProfile.hasReportLabel')}
                value={profile.soil.hasReport}
                onChange={(value) => updateSection('soil', 'hasReport', value)}
                t={t}
              />
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>{t('agronomyProfile.reportNoticeTitle')}</Text>
                <Text style={styles.noticeBody}>{t('agronomyProfile.reportNoticeBody')}</Text>
              </View>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <View style={styles.summaryCard}>
                <SummaryRow
                  label={t('agronomyProfile.summary.purpose')}
                  value={t(`agronomyProfile.purposes.${profile.purpose}`)}
                />
                <SummaryRow
                  label={t('agronomyProfile.summary.system')}
                  value={t(`agronomyProfile.systems.${profile.system}`)}
                />
                <SummaryRow
                  label={t('agronomyProfile.summary.location')}
                  value={agronomyLocationLabel(profile.location)}
                />
                <SummaryRow
                  label={t('agronomyProfile.summary.planting')}
                  value={profile.planting.date}
                />
                <SummaryRow
                  label={t('agronomyProfile.summary.stage')}
                  value={profile.planting.stage.trim()}
                />
                <SummaryRow
                  label={t('agronomyProfile.summary.soil')}
                  value={profile.soil.description.trim()}
                />
                <SummaryRow
                  label={t('agronomyProfile.summary.report')}
                  value={t(profile.soil.hasReport ? 'common.yes' : 'common.no')}
                />
              </View>
              <View style={[styles.notice, styles.safetyNotice]}>
                <Text style={styles.noticeTitle}>{t('agronomyProfile.noCalculationTitle')}</Text>
                <Text style={styles.noticeBody}>{t('agronomyProfile.noCalculationBody')}</Text>
              </View>
            </>
          ) : null}

          {errorKey ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {t(`agronomyProfile.errors.${errorKey}`)}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.8}
            onPress={step === 0 ? onCancel : goBack}
            disabled={step === 0 && typeof onCancel !== 'function'}
            accessibilityRole="button"
            accessibilityLabel={t(step === 0 ? 'common.cancel' : 'common.goBack')}
            accessibilityState={{ disabled: step === 0 && typeof onCancel !== 'function' }}
          >
            <Text style={styles.secondaryButtonText}>
              {t(step === 0 ? 'common.cancel' : 'common.goBack')}
            </Text>
          </TouchableOpacity>

          {step < STEP_KEYS.length - 1 ? (
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel={t('common.next')}
            >
              <Text style={styles.primaryButtonText}>{t('common.next')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, !canSave && styles.buttonDisabled]}
              activeOpacity={0.8}
              onPress={saveProfile}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel={t('agronomyProfile.save')}
              accessibilityState={{ disabled: !canSave }}
            >
              <Text style={styles.primaryButtonText}>{t('agronomyProfile.save')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      <AgronomyCountryPicker
        visible={countryPickerVisible}
        value={profile.location.countryCode}
        onClose={() => setCountryPickerVisible(false)}
        onSelect={(countryCode) => {
          setProfile((current) => ({
            ...current,
            location: { ...current.location, countryCode, admin1Code: '' },
          }));
          setErrorKey(null);
          setCountryPickerVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: space.md, paddingBottom: space.xxl },
  header: { marginBottom: space.lg },
  eyebrow: {
    ...type.caption,
    color: colors.accentLight,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: space.xxs,
  },
  title: { ...type.screenTitle, marginBottom: space.xs },
  subtitle: { ...type.body, maxWidth: 560 },
  progressBlock: { marginBottom: space.md },
  progressTrack: { flexDirection: 'row', gap: space.xs },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  progressSegmentActive: { backgroundColor: colors.accent },
  stepCounter: { ...type.caption, marginTop: space.xs },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    ...shadow,
  },
  stepTitle: { ...type.sectionTitle, marginTop: 0, marginBottom: space.xxs },
  stepBody: { ...type.body, marginBottom: space.lg },
  fieldGroup: { marginBottom: space.lg },
  label: { ...type.cardTitle, marginBottom: space.xs },
  hint: { ...type.caption, marginBottom: space.xs },
  input: {
    minHeight: control.primaryHeight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  countrySelector: {
    minHeight: control.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  countrySelectorCopy: { flex: 1 },
  countrySelectorText: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  countryPlaceholder: { color: colors.textMuted, fontSize: 15, lineHeight: 20 },
  countrySelectorCode: { ...type.caption, marginTop: 1 },
  multilineInput: { minHeight: 104 },
  characterCount: { ...type.caption, textAlign: 'right', marginTop: space.xxs },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  choice: {
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
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '1F' },
  choiceText: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  choiceTextSelected: { color: colors.text },
  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  stateChoice: {
    minWidth: control.minTouch,
    minHeight: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  stateChoiceSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '1F' },
  stateText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioDotSelected: { borderWidth: 5, borderColor: colors.accentLight },
  booleanRow: { flexDirection: 'row', gap: space.xs },
  booleanChoice: {
    flex: 1,
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
    borderRadius: radius.sm,
    backgroundColor: colors.info + '14',
    padding: space.sm,
    marginBottom: space.lg,
  },
  safetyNotice: { borderLeftColor: colors.warning, backgroundColor: colors.warning + '14' },
  noticeTitle: { ...type.cardTitle, marginBottom: space.xxs },
  noticeBody: { ...type.body },
  confirmChoice: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textMuted,
    borderRadius: 6,
  },
  checkboxSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkmark: { color: colors.background, fontSize: 15, lineHeight: 18, fontWeight: '900' },
  confirmText: { flex: 1, ...type.body, color: colors.text },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
    marginBottom: space.lg,
  },
  summaryRow: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryLabel: { ...type.caption, color: colors.accentLight, fontWeight: '700', marginBottom: space.xxs },
  summaryValue: { ...type.body, color: colors.text },
  error: {
    ...type.body,
    color: colors.error,
    fontWeight: '700',
    marginTop: space.md,
  },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  secondaryButton: {
    flex: 1,
    minHeight: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
  },
  primaryButton: {
    flex: 1.25,
    minHeight: control.primaryHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: space.sm,
  },
  buttonDisabled: { opacity: 0.45 },
  secondaryButtonText: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
  primaryButtonText: { color: colors.background, fontSize: 14, fontWeight: '900' },
});
