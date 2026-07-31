import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { colors } from './theme';

// Three things every detail screen should show and none of them used to.
//
// All of this data was ALREADY in the identification response and was being
// thrown away: the app read only `suggestions[0]` and never touched the
// reference photos it was explicitly asking the API for. The practical effect
// was that a near-miss looked like a flat-out wrong answer, with no way for the
// person holding the actual plant to see that the right species was ranked #2.
//
// Rendered as one component instead of pasted into six screens, so the
// confidence threshold and the copy can only ever be changed in one place.

// Below this, the top result is a guess worth flagging rather than an answer.
// Chosen to be visibly conservative: it is far cheaper to under-claim and be
// trusted than to state a wrong species confidently on a mushroom.
const LOW_CONFIDENCE = 65;

export default function IdentificationExtras({ entity, accent = colors.accent, onPickAlternative }) {
  const { t } = useTranslation();
  if (!entity) return null;

  const { confidence, alternatives, similarImages } = entity;
  const isLowConfidence = typeof confidence === 'number' && confidence < LOW_CONFIDENCE;
  const hasAlternatives = Boolean(alternatives?.length);
  const hasPhotos = Boolean(similarImages?.length);

  // The warning copy must only reference material that is actually on screen.
  // Bird results carry neither reference photos nor (usually) alternatives -
  // telling someone to "compare with the reference photos" under a result that
  // has none reads as a broken app (Fable review finding, 2026-07-29).
  const warnKey = hasAlternatives
    ? 'identify.lowConfidenceWithAlternatives'
    : hasPhotos
    ? 'identify.lowConfidence'
    : 'identify.lowConfidenceBare';

  return (
    <>
      {isLowConfidence && (
        <View style={styles.warnBox}>
          <Ionicons name="alert-circle" size={18} color={colors.warning} />
          <Text style={styles.warnText}>{t(warnKey, { confidence })}</Text>
        </View>
      )}

      {Array.isArray(similarImages) && similarImages.length > 0 && (
        <SectionCard
          icon="images-outline"
          title={t('identify.referenceImagesTitle')}
          color={colors.info}
        >
          <Text style={styles.hint}>{t('identify.referenceImagesHint')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
            {similarImages.map((img, i) => (
              <TouchableOpacity
                key={img.url + i}
                activeOpacity={0.85}
                // Opening the full-size original is also how the photo's own
                // source/citation stays reachable, which matters because these
                // images are licensed third-party content, not ours.
                onPress={() => img.full && Linking.openURL(img.full)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('identify.referenceImageLabel', { index: i + 1 })}
              >
                <Image source={{ uri: img.url }} style={styles.refImage} resizeMode="cover" />
                {typeof img.similarity === 'number' && (
                  <Text style={styles.similarity}>{img.similarity}%</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SectionCard>
      )}

      {Array.isArray(alternatives) && alternatives.length > 0 && (
        <SectionCard
          icon="git-compare-outline"
          title={t('identify.alternativesTitle')}
          color={colors.purple}
        >
          <Text style={styles.hint}>{t('identify.alternativesHint')}</Text>
          {alternatives.map((alt) => (
            <TouchableOpacity
              key={alt.id}
              style={styles.altRow}
              activeOpacity={onPickAlternative ? 0.7 : 1}
              disabled={!onPickAlternative}
              onPress={() => onPickAlternative && onPickAlternative(alt)}
              accessibilityRole={onPickAlternative ? 'button' : 'text'}
              accessibilityLabel={`${alt.name}, ${alt.confidence}%`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.altName}>{alt.name}</Text>
                {!!alt.scientific && alt.scientific !== alt.name && (
                  <Text style={styles.altSci}>{alt.scientific}</Text>
                )}
              </View>
              <Text style={[styles.altConfidence, { color: accent }]}>{alt.confidence}%</Text>
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: colors.warning + '1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning + '44',
    padding: 12,
    marginBottom: 16,
  },
  warnText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  imageRow: { marginTop: 2 },
  refImage: {
    width: 96,
    height: 96,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: colors.surfaceElevated,
  },
  similarity: {
    color: colors.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 3,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  altName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  altSci: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  altConfidence: { fontSize: 14, fontWeight: '800', marginLeft: 12 },
});
