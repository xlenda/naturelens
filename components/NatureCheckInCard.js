import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import PressScale from './PressScale';
import { suggestCheckInPlace } from './deviceLocation';
import { createNatureCheckIn, HABITATS, publicCheckIn } from './natureCheckIn';
import { updateCollectionEntry } from './storage';
import { colors, control, radius, space } from './theme';

function rootNavigator(navigation) {
  let current = navigation;
  while (current?.getParent?.()) current = current.getParent();
  return current;
}

export default function NatureCheckInCard({ entity, accent = colors.accent }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [checkIn, setCheckIn] = useState(entity?.checkIn || null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [draft, setDraft] = useState({ city: '', region: '', country: '', countryCode: '', habitat: 'trail', note: '' });

  useEffect(() => {
    setCheckIn(entity?.checkIn || null);
  }, [entity?.checkIn, entity?.savedId]);

  if (!entity?.savedId) return null;

  const edit = () => {
    setDraft({
      city: checkIn?.city || '', region: checkIn?.region || '', country: checkIn?.country || '',
      countryCode: checkIn?.countryCode || '', habitat: checkIn?.habitat || 'trail', note: checkIn?.note || '',
    });
    setOpen(true);
  };

  const suggest = async () => {
    if (locating) return;
    setLocating(true);
    const place = await suggestCheckInPlace();
    setLocating(false);
    if (place) setDraft((value) => ({ ...value, ...place }));
  };

  const save = async () => {
    if (busy) return;
    const value = createNatureCheckIn(draft);
    if (!value) return;
    setBusy(true);
    const saved = await updateCollectionEntry(entity.savedId, { checkIn: value });
    setBusy(false);
    if (!saved) return;
    setCheckIn(value);
    setOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const saved = await updateCollectionEntry(entity.savedId, { checkIn: null });
    setBusy(false);
    if (!saved) return;
    setCheckIn(null);
    setOpen(false);
  };

  const shareCommunity = () => {
    const place = publicCheckIn(checkIn);
    if (!place) return;
    const draftBody = t('checkIn.communityDraft', {
      name: entity.name || entity.scientific,
      city: place.city,
      country: place.country,
      habitat: t(`checkIn.habitats.${place.habitat}`),
    });
    rootNavigator(navigation)?.navigate('Profile', {
      screen: 'Community',
      params: {
        checkInDraft: {
          body: draftBody,
          category: entity.category,
          city: place.city,
          country: place.country,
        },
      },
    });
  };

  return (
    <View style={[styles.card, checkIn && { borderColor: `${accent}55` }]}>
      <View style={styles.row}>
        <View style={[styles.stamp, { borderColor: accent }]}>
          <Ionicons name={checkIn ? 'location' : 'location-outline'} size={20} color={accent} />
          <View style={[styles.stampLine, { backgroundColor: accent }]} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.kicker}>{t('checkIn.kicker')}</Text>
          <Text style={styles.title}>{checkIn ? `${checkIn.city}, ${checkIn.country}` : t('checkIn.title')}</Text>
          <Text style={styles.body}>
            {checkIn ? t('checkIn.savedBody', { habitat: t(`checkIn.habitats.${checkIn.habitat}`) }) : t('checkIn.body')}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.edit, { borderColor: `${accent}66` }]} onPress={edit} accessibilityRole="button">
          <Ionicons name={checkIn ? 'create-outline' : 'add'} size={17} color={accent} />
          <Text style={[styles.editText, { color: accent }]}>{checkIn ? t('checkIn.editAction') : t('checkIn.addAction')}</Text>
        </Pressable>
        {checkIn ? (
          <Pressable style={styles.community} onPress={shareCommunity} accessibilityRole="button">
            <Ionicons name="people-outline" size={17} color={colors.textSecondary} />
            <Text style={styles.communityText}>{t('checkIn.communityAction')}</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.shade}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t('checkIn.sheetTitle')}</Text>
            <Text style={styles.sheetBody}>{t('checkIn.privacyBody')}</Text>
            {Platform.OS !== 'web' ? (
              <Pressable style={styles.suggest} disabled={locating} onPress={suggest}>
                <Ionicons name="navigate-outline" size={17} color={colors.info} />
                <Text style={styles.suggestText}>{locating ? t('checkIn.locating') : t('checkIn.suggestAction')}</Text>
              </Pressable>
            ) : null}
            <View style={styles.fieldRow}>
              <View style={styles.grow}><Text style={styles.label}>{t('checkIn.city')}</Text><TextInput style={styles.input} value={draft.city} onChangeText={(city) => setDraft((v) => ({ ...v, city }))} maxLength={80} /></View>
              <View style={styles.grow}><Text style={styles.label}>{t('checkIn.country')}</Text><TextInput style={styles.input} value={draft.country} onChangeText={(country) => setDraft((v) => ({ ...v, country }))} maxLength={80} /></View>
            </View>
            <Text style={styles.label}>{t('checkIn.habitat')}</Text>
            <View style={styles.habitats}>
              {HABITATS.map((habitat) => (
                <Pressable key={habitat} style={[styles.habitat, draft.habitat === habitat && { borderColor: accent, backgroundColor: `${accent}18` }]} onPress={() => setDraft((v) => ({ ...v, habitat }))}>
                  <Text style={[styles.habitatText, draft.habitat === habitat && { color: accent }]}>{t(`checkIn.habitats.${habitat}`)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>{t('checkIn.note')}</Text>
            <TextInput style={[styles.input, styles.note]} value={draft.note} onChangeText={(note) => setDraft((v) => ({ ...v, note }))} multiline maxLength={240} placeholder={t('checkIn.noteHint')} placeholderTextColor={colors.textMuted} />
            <View style={styles.sheetActions}>
              {checkIn ? <Pressable style={styles.remove} disabled={busy} onPress={remove}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable> : null}
              <Pressable style={styles.cancel} onPress={() => setOpen(false)}><Text style={styles.cancelText}>{t('common.cancel')}</Text></Pressable>
              <PressScale style={styles.saveWrap}><Pressable style={[styles.save, { backgroundColor: accent }, (!draft.city.trim() || !draft.country.trim()) && styles.disabled]} disabled={busy || !draft.city.trim() || !draft.country.trim()} onPress={save}><Text style={styles.saveText}>{t('common.save')}</Text></Pressable></PressScale>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, grow: { flex: 1 },
  stamp: { width: 48, height: 48, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  stampLine: { position: 'absolute', width: 25, height: 1, bottom: 8, opacity: 0.6 },
  kicker: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 2 },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  edit: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  editText: { fontSize: 12, fontWeight: '900' },
  community: { flex: 1, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  communityText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  shade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000B8' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg, paddingBottom: space.xxl },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: space.md },
  sheetTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sheetBody: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  suggest: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, backgroundColor: `${colors.info}14`, marginTop: space.md },
  suggestText: { color: colors.info, fontSize: 12, fontWeight: '900' },
  fieldRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  label: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '800', marginTop: space.sm, marginBottom: 5 },
  input: { minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: space.sm },
  note: { minHeight: 72, maxHeight: 110, paddingTop: 10, textAlignVertical: 'top' },
  habitats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  habitat: { minHeight: 34, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', paddingHorizontal: 10 },
  habitatText: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '800' },
  sheetActions: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  remove: { width: control.primaryHeight, height: control.primaryHeight, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.error}55`, alignItems: 'center', justifyContent: 'center' },
  cancel: { flex: 1, minHeight: control.primaryHeight, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  saveWrap: { flex: 1.5 }, save: { minHeight: control.primaryHeight, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.white, fontSize: 12.5, fontWeight: '900' }, disabled: { opacity: 0.45 },
});
