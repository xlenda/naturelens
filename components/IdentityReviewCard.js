import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import PressScale from './PressScale';
import { createIdentityReview } from './identityReview';
import { updateCollectionEntry } from './storage';
import { retakeResult } from './resultRetake';
import { colors, control, radius, space } from './theme';

export default function IdentityReviewCard({ entity, alternatives, accent = colors.accent }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const [review, setReview] = useState(entity?.identityReview || null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => Array.isArray(alternatives) ? alternatives.slice(0, 2) : [], [alternatives]);
  if (!entity?.savedId) return null;

  const persist = async (decision, alternative) => {
    if (busy) return;
    const next = createIdentityReview(entity, decision, alternative);
    if (!next) return;
    setBusy(true);
    const saved = await updateCollectionEntry(entity.savedId, { identityReview: next });
    setBusy(false);
    if (!saved) return;
    setReview(next);
    setOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const retake = () => retakeResult({
    navigation,
    category: entity.category,
    fromIdentify: route.params?.fromIdentify === true,
  });

  const reviewed = review?.decision === 'confirmed' || review?.decision === 'alternative';
  return (
    <View style={[styles.card, reviewed && { borderColor: `${accent}66` }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={review?.decision === 'confirmed' ? 'checkmark' : review?.decision === 'alternative' ? 'git-compare' : 'finger-print'} size={20} color={accent} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.kicker}>{t('identityReview.kicker')}</Text>
          <Text style={styles.title}>
            {review?.decision === 'confirmed'
              ? t('identityReview.confirmedTitle')
              : review?.decision === 'alternative'
              ? t('identityReview.correctedTitle')
              : t('identityReview.title')}
          </Text>
          <Text style={styles.body}>
            {review?.decision === 'alternative'
              ? t('identityReview.correctedBody', { name: review.finalChoice?.name })
              : review?.decision === 'confirmed'
              ? t('identityReview.confirmedBody')
              : t('identityReview.body')}
          </Text>
        </View>
      </View>

      {review?.requiresRecapture ? (
        <PressScale>
          <Pressable style={[styles.primary, { backgroundColor: accent }]} onPress={retake} accessibilityRole="button">
            <Ionicons name="camera" size={17} color={colors.white} />
            <Text style={styles.primaryText}>{t('identityReview.retakeAction')}</Text>
          </Pressable>
        </PressScale>
      ) : (
        <View style={styles.actions}>
          <Pressable style={styles.confirm} disabled={busy} onPress={() => persist('confirmed')} accessibilityRole="button">
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentLight} />
            <Text style={styles.confirmText}>{t('identityReview.yesAction')}</Text>
          </Pressable>
          <Pressable style={styles.change} disabled={busy} onPress={() => setOpen(true)} accessibilityRole="button">
            <Text style={styles.changeText}>{t('identityReview.changeAction')}</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.shade}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t('identityReview.sheetTitle')}</Text>
            <Text style={styles.sheetBody}>{t('identityReview.sheetBody')}</Text>
            <Pressable style={styles.candidate} onPress={() => persist('confirmed')}>
              <View style={[styles.rank, { backgroundColor: `${accent}20` }]}><Text style={[styles.rankText, { color: accent }]}>1</Text></View>
              <View style={styles.grow}><Text style={styles.candidateName}>{entity.name || entity.scientific}</Text><Text style={styles.candidateSci}>{entity.scientific}</Text></View>
              <Ionicons name="checkmark-circle-outline" size={21} color={accent} />
            </Pressable>
            {candidates.map((candidate, index) => (
              <Pressable key={candidate.id || candidate.scientific || index} style={styles.candidate} onPress={() => persist('alternative', candidate)}>
                <View style={styles.rank}><Text style={styles.rankText}>{index + 2}</Text></View>
                <View style={styles.grow}><Text style={styles.candidateName}>{candidate.name}</Text><Text style={styles.candidateSci}>{candidate.scientific}</Text></View>
                {Number.isFinite(candidate.confidence) ? <Text style={styles.score}>{candidate.confidence}%</Text> : null}
              </Pressable>
            ))}
            {!candidates.length ? <Text style={styles.empty}>{t('identityReview.noAlternatives')}</Text> : null}
            <Pressable style={styles.cancel} onPress={() => setOpen(false)}><Text style={styles.cancelText}>{t('common.cancel')}</Text></Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.xl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, grow: { flex: 1 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 2 },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  actions: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  confirm: { flex: 1.4, minHeight: 44, borderRadius: radius.md, backgroundColor: `${colors.accent}18`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmText: { color: colors.accentLight, fontSize: 12, fontWeight: '900' },
  change: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  changeText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  primary: { minHeight: 46, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: space.md },
  primaryText: { color: colors.white, fontSize: 12.5, fontWeight: '900' },
  shade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000B8' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg, paddingBottom: space.xxl },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: space.md },
  sheetTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  sheetBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: space.sm },
  candidate: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  candidateName: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  candidateSci: { color: colors.textMuted, fontSize: 11, lineHeight: 15, fontStyle: 'italic', marginTop: 1 },
  score: { color: colors.textSecondary, fontSize: 12, fontWeight: '900' },
  empty: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: space.lg },
  cancel: { minHeight: control.primaryHeight, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
});
