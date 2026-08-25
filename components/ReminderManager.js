import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  createLocalReminder,
  isNativeReminderAvailable,
  listLocalReminders,
  removeLocalReminder,
} from './localReminders';
import { getObservationWorkspaceConfig } from './observationWorkspaceConfig';
import { colors, control, radius, shadow, space, type } from './theme';

const CROP_ACTIONS = Object.freeze([
  'observation',
  'stage',
  'rain',
  'irrigation',
  'fertilization',
  'pestSample',
  'diseaseCheck',
  'harvest',
]);
const DAY_OPTIONS = Object.freeze([1, 3, 7, 14, 30]);
const HOUR_OPTIONS = Object.freeze([8, 12, 18, 20]);
const REPEAT_OPTIONS = Object.freeze(['once', 'daily', 'weekly']);
const WEEKDAY_OPTIONS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(value, locale) {
  const date = validDate(value);
  if (!date) return '';
  try {
    return date.toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}

function initialDate(days, hour) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function nextDailyDate(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

function nextWeeklyDate(weekday, hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  const delta = (weekday - now.getDay() + 7) % 7;
  next.setDate(next.getDate() + delta);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
  return next;
}

function reminderDate(repeat, days, hour, weekday) {
  if (repeat === 'daily') return nextDailyDate(hour);
  if (repeat === 'weekly') return nextWeeklyDate(weekday, hour);
  return initialDate(days, hour);
}

function nextOccurrence(reminder, now = new Date()) {
  const first = validDate(reminder?.nextAt);
  if (!first) return null;
  if (first.getTime() > now.getTime()) return first;
  if (reminder?.repeat === 'once') return null;

  const days = reminder?.repeat === 'daily' ? 1 : reminder?.repeat === 'weekly' ? 7 : 0;
  if (!days) return null;
  const next = new Date(first);
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - first.getTime()) / 86400000));
  next.setDate(next.getDate() + (Math.floor(elapsedDays / days) + 1) * days);
  while (next.getTime() <= now.getTime()) next.setDate(next.getDate() + days);
  return next;
}

function ChoiceGroup({ label, options, selected, onSelect, disabled, accent }) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <TouchableOpacity
              key={String(option.value)}
              style={[
                styles.choice,
                active && { borderColor: accent, backgroundColor: accent + '22' },
              ]}
              onPress={() => onSelect(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled }}
              accessibilityLabel={option.label}
            >
              {option.icon ? <Ionicons name={option.icon} size={17} color={active ? accent : colors.textMuted} /> : null}
              <Text style={[styles.choiceText, active && { color: accent }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ReminderManager({ entry, accent = colors.accent, t, i18n }) {
  const isAndroid = Platform.OS === 'android';
  const [available, setAvailable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [days, setDays] = useState(1);
  const [hour, setHour] = useState(8);
  const [repeat, setRepeat] = useState('once');
  const [weekday, setWeekday] = useState(() => new Date().getDay());
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const category = entry?.category;
  const observationConfig = useMemo(
    () => category === 'crop' ? null : getObservationWorkspaceConfig(category),
    [category],
  );
  const actions = useMemo(() => {
    if (category === 'crop') {
      return CROP_ACTIONS.map((key) => ({
        key,
        icon: key === 'irrigation' || key === 'rain' ? 'water-outline' : key === 'pestSample' ? 'bug-outline' : 'clipboard-outline',
        label: t(`agronomyWorkspace.eventTypes.${key}`),
      }));
    }
    return (observationConfig?.eventTypes || []).map((item) => ({
      key: item.key,
      icon: item.icon,
      label: t(item.labelKey),
    }));
  }, [category, observationConfig, t]);

  const actionLabels = useMemo(
    () => Object.fromEntries(actions.map((item) => [item.key, item.label])),
    [actions],
  );
  const draftNextAt = useMemo(
    () => reminderDate(repeat, days, hour, weekday),
    [days, hour, repeat, weekday],
  );

  useEffect(() => {
    if (!actions.some((item) => item.key === actionKey)) setActionKey(actions[0]?.key || '');
  }, [actionKey, actions]);

  useEffect(() => {
    let alive = true;
    if (!isAndroid || !entry?.savedId || !actions.length) {
      setLoading(false);
      return () => { alive = false; };
    }

    setLoading(true);
    Promise.resolve(isNativeReminderAvailable())
      .then(async (supported) => {
        if (!alive) return;
        setAvailable(Boolean(supported));
        if (!supported) return;
        const stored = await listLocalReminders(entry.savedId);
        if (!alive) return;
        setReminders(Array.isArray(stored) ? stored : []);
      })
      .catch(() => {
        if (alive) setFeedback({ tone: 'error', text: t('localReminders.loadError') });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [actions.length, entry?.savedId, isAndroid, t]);

  const upcoming = useMemo(() => reminders
    .map((reminder) => ({ reminder, next: nextOccurrence(reminder) }))
    .filter((item) => item.next)
    .sort((a, b) => a.next.getTime() - b.next.getTime()), [reminders]);

  const closeModal = () => {
    if (busy) return;
    setModalVisible(false);
    setFeedback(null);
  };

  const openModal = () => {
    if (!available || busy) return;
    setActionKey(actions[0]?.key || '');
    setDays(1);
    setHour(8);
    setRepeat('once');
    setWeekday(new Date().getDay());
    setFeedback(null);
    setModalVisible(true);
  };

  const createReminder = async () => {
    if (busy || !entry?.savedId || !actionKey || !available) return;
    // O modal pode ficar aberto ate depois do horario exibido. Recalcular no
    // toque impede enviar um instante vencido e celebrar um agendamento falso.
    const nextAt = reminderDate(repeat, days, hour, weekday);
    const action = actionLabels[actionKey];
    const name = entry.nickname || entry.displayName || entry.name || entry.scientific || t('localReminders.recordFallback');
    setBusy(true);
    setFeedback(null);

    let result = null;
    try {
      result = await createLocalReminder({
        savedId: entry.savedId,
        category,
        actionKey,
        nextAt: nextAt.toISOString(),
        repeat,
        title: t('localReminders.notificationTitle', { name }),
        body: t('localReminders.notificationBody', { name, action }),
      });
    } catch (e) {
      result = null;
    }

    if (result?.ok && result.reminder) {
      let stored = [];
      try {
        stored = await listLocalReminders(entry.savedId);
      } catch (e) {
        stored = [];
      }
      const persisted = Array.isArray(stored)
        ? stored.find((item) => item?.reminderId === result.reminder.reminderId)
        : null;
      if (persisted) {
        const date = formatDate(persisted.nextAt, i18n.language);
        setReminders(stored);
        setBusy(false);
        setModalVisible(false);
        setFeedback({ tone: 'success', text: t('localReminders.scheduledSuccess', { date }) });
        AccessibilityInfo.announceForAccessibility?.(
          t('localReminders.actionAnnouncement', { action, date }),
        );
        return;
      }
    }

    setBusy(false);
    if (result?.status === 'denied') {
      setFeedback({ tone: 'error', text: t('localReminders.permissionDeniedBody') });
    } else if (result?.status === 'unsupported') {
      setAvailable(false);
      setModalVisible(false);
      setFeedback(null);
    } else {
      setFeedback({ tone: 'error', text: t('localReminders.saveError') });
    }
  };

  const removeReminder = async (reminderId) => {
    if (removingId || busy) return;
    setRemovingId(reminderId);
    setFeedback(null);
    let result = null;
    try {
      result = await removeLocalReminder(reminderId);
    } catch (e) {
      result = null;
    }
    setRemovingId(null);
    if (!result?.ok) {
      setFeedback({ tone: 'error', text: t('localReminders.removeError') });
      return;
    }
    setReminders((current) => current.filter((item) => item.reminderId !== reminderId));
    AccessibilityInfo.announceForAccessibility?.(t('localReminders.removedAnnouncement'));
  };

  if (!isAndroid || !entry?.savedId || !actions.length) return null;

  const intervalOptions = DAY_OPTIONS.map((value) => ({
    value,
    label: t(`localReminders.intervals.day${value}`),
  }));
  const timeOptions = HOUR_OPTIONS.map((value) => ({
    value,
    label: t(`localReminders.times.at${String(value).padStart(2, '0')}`),
  }));
  const repeatOptions = REPEAT_OPTIONS.map((value) => ({
    value,
    label: t(`localReminders.repetitions.${value}`),
  }));
  const weekdayOptions = WEEKDAY_OPTIONS.map((key, value) => ({
    value,
    label: t(`localReminders.weekdays.${key}`),
  }));

  return (
    <>
      <View style={[styles.card, { borderColor: accent + '66' }]} testID="local-reminders-card">
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: accent + '22' }]}>
            <Ionicons name="notifications-outline" size={24} color={accent} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.title} accessibilityRole="header">{t('localReminders.title')}</Text>
            <Text style={styles.body}>{t('localReminders.body')}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingRow} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={accent} />
            <Text style={styles.muted}>{t('localReminders.loading')}</Text>
          </View>
        ) : available === false ? (
          <View style={styles.warningBox} accessibilityRole="alert">
            <Ionicons name="information-circle-outline" size={20} color={colors.warning} />
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle}>{t('localReminders.unavailableTitle')}</Text>
              <Text style={styles.warningBody}>{t('localReminders.unavailableBody')}</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{t('localReminders.nextTitle')}</Text>
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: accent }]}
                onPress={openModal}
                disabled={busy || removingId !== null}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy || removingId !== null }}
                accessibilityLabel={t('localReminders.addAction')}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.addButtonText}>{t('localReminders.addAction')}</Text>
              </TouchableOpacity>
            </View>

            {upcoming.length ? upcoming.map(({ reminder, next }) => {
              const deleting = removingId === reminder.reminderId;
              const action = actionLabels[reminder.actionKey];
              if (!action) return null;
              return (
                <View key={reminder.reminderId} style={styles.reminderRow}>
                  <View style={[styles.reminderDot, { backgroundColor: accent + '22' }]}>
                    <Ionicons name="time-outline" size={18} color={accent} />
                  </View>
                  <View style={styles.reminderCopy}>
                    <Text style={styles.reminderAction}>{action}</Text>
                    <Text style={styles.reminderMeta}>
                      {t('localReminders.nextAt', { date: formatDate(next, i18n.language) })}
                    </Text>
                    <Text style={styles.reminderRepeat}>
                      {t(`localReminders.repetitions.${reminder.repeat}`)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeReminder(reminder.reminderId)}
                    disabled={deleting || busy || removingId !== null}
                    accessibilityRole="button"
                    accessibilityState={{ busy: deleting, disabled: deleting || busy || removingId !== null }}
                    accessibilityLabel={t('localReminders.removeAction', { action })}
                  >
                    {deleting
                      ? <ActivityIndicator size="small" color={colors.error} />
                      : <Ionicons name="trash-outline" size={19} color={colors.error} />}
                  </TouchableOpacity>
                </View>
              );
            }) : <Text style={styles.empty}>{t('localReminders.empty')}</Text>}
          </>
        )}

        {!!feedback && (
          <View
            style={[styles.feedback, feedback.tone === 'success' ? styles.successFeedback : styles.errorFeedback]}
            accessibilityRole={feedback.tone === 'error' ? 'alert' : 'text'}
          >
            <Ionicons
              name={feedback.tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={19}
              color={feedback.tone === 'success' ? colors.success : colors.error}
            />
            <Text style={styles.feedbackText}>{feedback.text}</Text>
          </View>
        )}
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modal}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
            accessibilityViewIsModal={true}
            onAccessibilityEscape={closeModal}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCopy}>
                <Text style={styles.modalTitle} accessibilityRole="header">
                  {t('localReminders.modalTitle')}
                </Text>
                <Text style={styles.modalBody}>
                  {t('localReminders.reminderFor', {
                    name: entry.nickname || entry.displayName || entry.name || entry.scientific || t('localReminders.recordFallback'),
                  })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ChoiceGroup
              label={t('localReminders.taskLabel')}
              options={actions.map((item) => ({ value: item.key, label: item.label, icon: item.icon }))}
              selected={actionKey}
              onSelect={setActionKey}
              disabled={busy}
              accent={accent}
            />
            <ChoiceGroup
              label={t('localReminders.repeatLabel')}
              options={repeatOptions}
              selected={repeat}
              onSelect={setRepeat}
              disabled={busy}
              accent={accent}
            />
            {repeat === 'once' && (
              <ChoiceGroup
                label={t('localReminders.startLabel')}
                options={intervalOptions}
                selected={days}
                onSelect={setDays}
                disabled={busy}
                accent={accent}
              />
            )}
            {repeat === 'weekly' && (
              <ChoiceGroup
                label={t('localReminders.weekdayLabel')}
                options={weekdayOptions}
                selected={weekday}
                onSelect={setWeekday}
                disabled={busy}
                accent={accent}
              />
            )}
            <ChoiceGroup
              label={t('localReminders.timeLabel')}
              options={timeOptions}
              selected={hour}
              onSelect={setHour}
              disabled={busy}
              accent={accent}
            />
            <View style={styles.previewBox} accessible accessibilityLabel={t('localReminders.firstAt', {
              date: formatDate(draftNextAt, i18n.language),
            })}>
              <Ionicons name="calendar-outline" size={18} color={accent} />
              <Text style={styles.previewText}>
                {t('localReminders.firstAt', { date: formatDate(draftNextAt, i18n.language) })}
              </Text>
            </View>

            {!!feedback && feedback.tone === 'error' && (
              <View style={[styles.feedback, styles.errorFeedback]} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={19} color={colors.error} />
                <View style={styles.feedbackCopy}>
                  {feedback.text === t('localReminders.permissionDeniedBody') && (
                    <Text style={styles.feedbackTitle}>{t('localReminders.permissionDeniedTitle')}</Text>
                  )}
                  <Text style={styles.feedbackText}>{feedback.text}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: accent }, busy && styles.disabled]}
              onPress={createReminder}
              disabled={busy || !actionKey}
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy || !actionKey }}
              accessibilityLabel={busy ? t('localReminders.saving') : t('localReminders.saveAction')}
            >
              {busy && <ActivityIndicator size="small" color={colors.white} />}
              <Text style={styles.saveButtonText}>
                {busy ? t('localReminders.saving') : t('localReminders.saveAction')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1 },
  title: { ...type.cardTitle },
  body: { ...type.body, marginTop: 3 },
  loadingRow: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  muted: { ...type.caption },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm,
    marginTop: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warning + '66',
    backgroundColor: colors.warning + '12',
  },
  warningCopy: { flex: 1 },
  warningTitle: { ...type.cardTitle, color: colors.warning },
  warningBody: { ...type.body, marginTop: 2 },
  listHeader: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.md,
  },
  listTitle: { ...type.cardTitle, flex: 1 },
  addButton: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  addButtonText: { color: colors.white, fontSize: 12.5, fontWeight: '800' },
  empty: { ...type.body, color: colors.textMuted, paddingVertical: space.sm },
  reminderRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reminderDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  reminderCopy: { flex: 1, paddingVertical: space.sm },
  reminderAction: { fontSize: 13.5, lineHeight: 19, fontWeight: '700', color: colors.text },
  reminderMeta: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  reminderRepeat: { ...type.caption, marginTop: 1 },
  removeButton: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    padding: space.sm,
    marginTop: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  successFeedback: { borderColor: colors.success + '66', backgroundColor: colors.success + '12' },
  errorFeedback: { borderColor: colors.error + '66', backgroundColor: colors.error + '12' },
  feedbackCopy: { flex: 1 },
  feedbackTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: colors.error, marginBottom: 2 },
  feedbackText: { ...type.body, flex: 1, color: colors.text },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    backgroundColor: 'rgba(0,0,0,0.76)',
  },
  modal: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  modalContent: { padding: space.lg },
  modalHeader: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: space.md,
  },
  modalTitleCopy: { flex: 1 },
  modalTitle: { ...type.sectionTitle, marginTop: 0, marginBottom: 2 },
  modalBody: { ...type.body },
  closeButton: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceGroup: { marginTop: space.md },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.textSecondary, marginBottom: space.xs },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  choice: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceText: { fontSize: 12.5, lineHeight: 17, fontWeight: '700', color: colors.textSecondary },
  previewBox: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewText: { ...type.body, flex: 1, color: colors.text },
  saveButton: {
    minHeight: control.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.sm,
    marginTop: space.xl,
    paddingHorizontal: space.md,
  },
  saveButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
