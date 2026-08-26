import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AlertModal from './AlertModal';
import PressScale from './PressScale';
import { enrichmentTaxon } from './taxonIdentity';
import { getPetProfile } from './petProfile';
import { getPetSafetyRecord } from './petSafetyCatalog';
import { colors, radius, space } from './theme';

const STATUS_COLORS = Object.freeze({
  toxic: colors.error,
  safe: colors.accentLight,
  unknown: colors.warning,
});

function statusFor(record, animal) {
  return record?.[animal] === 'toxic' || record?.[animal] === 'safe' ? record[animal] : 'unknown';
}

function AnimalStatus({ animal, status, selected, t }) {
  const color = STATUS_COLORS[status];
  return (
    <View style={[styles.animal, selected && { borderColor: `${color}88`, backgroundColor: `${color}12` }]}>
      <View style={[styles.animalIcon, { backgroundColor: `${color}1F` }]}>
        <Ionicons name="paw" size={18} color={color} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.animalName}>{t(`petGuardian.animals.${animal}`)}</Text>
        <Text style={[styles.animalStatus, { color }]}>{t(`petGuardian.status.${status}`)}</Text>
      </View>
      {selected ? <Ionicons name="person" size={13} color={color} /> : null}
    </View>
  );
}

export default function PetGuardianCard({ entity }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState({ dog: false, cat: false });
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const category = entity?.category || entity?.identityV1?.category;

  useFocusEffect(useCallback(() => {
    let alive = true;
    getPetProfile().then((value) => { if (alive) setProfile(value); });
    return () => { alive = false; };
  }, []));

  if (!['plant', 'tree', 'crop'].includes(category)) return null;
  const exact = enrichmentTaxon(entity?.identityV1, {
    scientificName: entity?.scientific,
    gbifKey: entity?.gbifId,
  });
  const record = getPetSafetyRecord(exact?.canonicalName);
  const hasConfiguredPet = profile.dog || profile.cat;
  if (!record && !entity?.toxicity && !hasConfiguredPet) return null;

  const dog = statusFor(record, 'dog');
  const cat = statusFor(record, 'cat');
  const hasRisk = dog === 'toxic' || cat === 'toxic';
  const isEmergency = record?.severity === 'emergency';
  const accent = hasRisk ? colors.error : record?.severity === 'safe' ? colors.accentLight : colors.warning;

  return (
    <View style={[styles.card, { borderColor: `${accent}66` }]} accessibilityLiveRegion="polite">
      <View style={styles.header}>
        <View style={[styles.seal, { backgroundColor: `${accent}20` }]}>
          <Ionicons name="paw" size={22} color={accent} />
          <View style={[styles.sealDot, { backgroundColor: accent }]} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.kicker}>{t('petGuardian.kicker')}</Text>
          <Text style={styles.title}>{t('petGuardian.title')}</Text>
        </View>
        <View style={[styles.verdict, { backgroundColor: `${accent}18` }]}>
          <Text style={[styles.verdictText, { color: accent }]}>
            {t(`petGuardian.severity.${record?.severity || 'unknown'}`)}
          </Text>
        </View>
      </View>

      <Text style={styles.intro}>
        {record
          ? t('petGuardian.exactBody')
          : entity?.toxicity
          ? t('petGuardian.generalWarningBody')
          : t('petGuardian.unknownBody')}
      </Text>

      <View style={styles.animals}>
        <AnimalStatus animal="dog" status={dog} selected={profile.dog} t={t} />
        <AnimalStatus animal="cat" status={cat} selected={profile.cat} t={t} />
      </View>

      {record?.parts ? (
        <View style={styles.factRow}>
          <Ionicons name="leaf-outline" size={17} color={accent} />
          <Text style={styles.factLabel}>{t('petGuardian.toxicParts')}</Text>
          <Text style={styles.factValue}>{t(`petGuardian.parts.${record.parts}`)}</Text>
        </View>
      ) : null}

      {record?.signs?.length ? (
        <View style={styles.signs}>
          <Text style={styles.signsTitle}>{t('petGuardian.signsTitle')}</Text>
          <View style={styles.signGrid}>
            {record.signs.map((sign) => (
              <View key={sign} style={styles.signChip}>
                <View style={[styles.signDot, { backgroundColor: accent }]} />
                <Text style={styles.signText}>{t(`petGuardian.signs.${sign}`)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {hasRisk ? (
        <PressScale>
          <Pressable
            style={[styles.action, isEmergency && styles.actionEmergency]}
            onPress={() => setEmergencyOpen(true)}
            accessibilityRole="button"
          >
            <Ionicons name="medical" size={18} color={colors.white} />
            <Text style={styles.actionText}>{t('petGuardian.contactAction')}</Text>
            <Ionicons name="chevron-forward" size={17} color={colors.white} />
          </Pressable>
        </PressScale>
      ) : null}

      <View style={styles.sourceRow}>
        <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
        <Text style={styles.sourceCopy}>
          {record ? t('petGuardian.sourceExact', { source: record.sourceName }) : t('petGuardian.sourceMissing')}
        </Text>
        {record?.sourceUrl ? (
          <Pressable onPress={() => Linking.openURL(record.sourceUrl)} accessibilityRole="link">
            <Text style={styles.sourceLink}>{t('petGuardian.openSource')}</Text>
          </Pressable>
        ) : null}
      </View>

      <AlertModal
        visible={emergencyOpen}
        title={t('petGuardian.emergencyTitle')}
        message={t('petGuardian.emergencyBody')}
        buttons={[{ text: t('common.ok'), onPress: () => setEmergencyOpen(false) }]}
        onRequestClose={() => setEmergencyOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, padding: space.md, marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  seal: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sealDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, right: 7, bottom: 7, borderWidth: 2, borderColor: colors.card },
  kicker: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 1 },
  verdict: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  verdictText: { fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase' },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: space.sm },
  animals: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  animal: { flex: 1, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9 },
  animalIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  animalName: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  animalStatus: { fontSize: 10.5, lineHeight: 14, fontWeight: '900', marginTop: 1 },
  factRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.sm },
  factLabel: { flex: 1, color: colors.textSecondary, fontSize: 12 },
  factValue: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  signs: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, marginTop: space.xs },
  signsTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  signGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  signChip: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 9 },
  signDot: { width: 5, height: 5, borderRadius: 3 },
  signText: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '700' },
  action: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.error, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: space.md, paddingHorizontal: space.sm },
  actionEmergency: { backgroundColor: '#B93535' },
  actionText: { flex: 1, color: colors.white, fontSize: 12.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  sourceCopy: { flex: 1, color: colors.textMuted, fontSize: 9.5, lineHeight: 14 },
  sourceLink: { color: colors.info, fontSize: 10.5, fontWeight: '800', textDecorationLine: 'underline' },
});
