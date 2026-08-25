import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, FlatList, TouchableOpacity, Linking, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { heroRefs, heroRefCount } from './PlantHero';
import { getGbifPhotos } from './gbifPhotos';
import { canonicalEvidenceKey, evidenceLabelKey, mergeEvidencePhotos } from './evidencePhotos';
import PhotoComparisonModal from './PhotoComparisonModal';
import { colors, control, radius, space, type } from './theme';
import { enrichmentTaxon } from './taxonIdentity';

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
const PHOTO_WIDTH = 254;
const PHOTO_GAP = 12;

// `skipImages`: how many leading reference photos to leave out of the gallery
// because something above already showed them. Defaults to what this entity's
// PlantHero cover consumed - every screen that renders this component renders
// the hero from the SAME entity, so nothing has to be threaded through six call
// sites. Pass it explicitly only for a screen with a different hero.
export default function IdentificationExtras({
  entity,
  accent = colors.accent,
  onPickAlternative,
  skipImages,
  scientific,
  gbifId,
  identityV1,
}) {
  const { t } = useTranslation();
  const [observations, setObservations] = useState([]);
  const [failed, setFailed] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const enrichment = enrichmentTaxon(identityV1, {
    scientificName: scientific || entity?.scientific,
    gbifKey: gbifId ?? entity?.gbifId,
  });
  const resolvedScientific = enrichment?.canonicalName || null;
  const resolvedGbifId = enrichment?.gbifKey || null;

  useEffect(() => {
    let alive = true;
    setObservations([]);
    setFailed(new Set());
    getGbifPhotos(resolvedScientific, resolvedGbifId).then((photos) => {
      if (alive) setObservations(photos);
    });
    return () => {
      alive = false;
    };
  }, [resolvedScientific, resolvedGbifId]);

  if (!entity) return null;

  const { confidence, alternatives, similarImages } = entity;
  const isLowConfidence = typeof confidence === 'number' && confidence < LOW_CONFIDENCE;
  const hasAlternatives = Boolean(alternatives?.length);

  // Only the references the hero did NOT already use (auditoria de diagramacao
  // 20/08: the first two were on screen twice, in every single result). When
  // that leaves nothing, the whole card is gone rather than empty - same
  // fallback rule as every other block here.
  const providerGallery = heroRefs(similarImages).slice(
    typeof skipImages === 'number' ? skipImages : heroRefCount(entity)
  );
  const gallery = mergeEvidencePhotos(providerGallery, observations).filter(
    (photo) => !failed.has(photo.url)
  );
  const hasPhotos = Boolean(similarImages?.length || observations.length);

  // The warning copy must only reference material that is actually on screen.
  // Bird results carry neither reference photos nor (usually) alternatives -
  // telling someone to "compare with the reference photos" under a result that
  // has none reads as a broken app (Fable review finding, 2026-07-29).
  // Deliberately `similarImages` and not `gallery`: when the gallery is empty
  // only because a restored record uses its sole reference as cover, it IS on
  // screen already.
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

      {gallery.length > 0 && (
        <View style={styles.gallerySection}>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryIcon}>
              <Ionicons name="images-outline" size={18} color={colors.info} />
            </View>
            <Text style={styles.galleryTitle} accessibilityRole="header">
              {t('identify.referenceImagesTitle')}
            </Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{gallery.length}</Text>
            </View>
          </View>
          <Text style={styles.hint}>{t('identify.referenceImagesHint')}</Text>
          {!!entity.photoUri && (
            <TouchableOpacity
              style={styles.compareButton}
              onPress={() => setComparisonOpen(true)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={t('identify.comparePhotos')}
            >
              <View style={styles.compareIcon}>
                <Ionicons name="git-compare-outline" size={18} color={colors.info} />
              </View>
              <View style={styles.compareCopy}>
                <Text style={styles.compareTitle}>{t('identify.comparePhotos')}</Text>
                <Text style={styles.compareHint}>{t('identify.comparePhotosHint')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          <FlatList
            horizontal
            data={gallery}
            keyExtractor={(item, index) => canonicalEvidenceKey(item, index)}
            renderItem={({ item: img, index: i }) => (
              <TouchableOpacity
                style={styles.refItem}
                activeOpacity={0.85}
                onPress={() => setSelected({ photo: img, index: i })}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${t(evidenceLabelKey(img))}. ${t('identify.referenceImageLabel', { index: i + 1 })}`}
              >
                <Image
                  source={{ uri: img.url }}
                  style={styles.refImage}
                  resizeMode="cover"
                  onError={() => setFailed((current) => new Set([...current, img.url]))}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.88)']}
                  style={styles.photoShade}
                  pointerEvents="none"
                />
                <View style={styles.kindPill} pointerEvents="none">
                  <Text style={styles.kindText}>{t(evidenceLabelKey(img))}</Text>
                </View>
                <View style={styles.photoCount} pointerEvents="none">
                  <Text style={styles.photoCountText}>{`${i + 1} / ${gallery.length}`}</Text>
                </View>
                {typeof img.similarity === 'number' && (
                  <View style={styles.similarityPill} pointerEvents="none">
                    <Text style={styles.similarity}>{img.similarity}%</Text>
                  </View>
                )}
                {!!img.citation && (
                  <Text style={styles.citation} numberOfLines={1}>{img.citation}</Text>
                )}
                {!!img.licenseName && (
                  <Text style={styles.license} numberOfLines={1}>{img.licenseName}</Text>
                )}
              </TouchableOpacity>
            )}
            showsHorizontalScrollIndicator={false}
            style={styles.imageRow}
            contentContainerStyle={styles.imageContent}
            snapToInterval={PHOTO_WIDTH + PHOTO_GAP}
            decelerationRate="fast"
            disableIntervalMomentum={true}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={3}
            removeClippedSubviews={Platform.OS !== 'web'}
            getItemLayout={(_data, index) => ({
              length: PHOTO_WIDTH + PHOTO_GAP,
              offset: (PHOTO_WIDTH + PHOTO_GAP) * index,
              index,
            })}
          />
        </View>
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
              accessibilityLabel={Number.isFinite(alt.confidence)
                ? `${alt.name}, ${alt.confidence}%`
                : alt.name}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.altName}>{alt.name}</Text>
                {!!alt.scientific && alt.scientific !== alt.name && (
                  <Text style={styles.altSci}>{alt.scientific}</Text>
                )}
              </View>
              {Number.isFinite(alt.confidence) && (
                <Text style={[styles.altConfidence, { color: accent }]}>{alt.confidence}%</Text>
              )}
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      <Modal
        visible={!!selected}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View
            style={styles.modalBody}
            accessibilityViewIsModal={true}
            onAccessibilityEscape={() => setSelected(null)}
          >
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={25} color={colors.white} />
            </TouchableOpacity>
            {!!selected?.photo && (
              <>
                <Image
                  source={{ uri: selected.photo.full || selected.photo.url }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <View style={styles.modalMeta}>
                  <Text style={styles.modalTitle}>
                    {t('identify.referenceImageLabel', { index: selected.index + 1 })}
                  </Text>
                  <Text style={styles.modalKind}>{t(evidenceLabelKey(selected.photo))}</Text>
                  {!!selected.photo.citation && (
                    <Text style={styles.modalCredit}>{selected.photo.citation}</Text>
                  )}
                  {!!selected.photo.licenseName && !!selected.photo.licenseUrl ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(selected.photo.licenseUrl)}
                      accessibilityRole="link"
                    >
                      <Text style={[styles.modalLicense, styles.modalLicenseLink]}>
                        {selected.photo.licenseName}
                      </Text>
                    </TouchableOpacity>
                  ) : !!selected.photo.licenseName ? (
                    <Text style={styles.modalLicense}>{selected.photo.licenseName}</Text>
                  ) : null}
                  {!!selected.photo.sourceUrl && (
                    <TouchableOpacity
                      style={styles.sourceButton}
                      onPress={() => Linking.openURL(selected.photo.sourceUrl)}
                      accessibilityRole="link"
                    >
                      <Ionicons name="open-outline" size={16} color={colors.info} />
                      <Text style={styles.sourceText}>
                        {t('detail.speciesCareSource', {
                          citation: selected.photo.citation || 'GBIF',
                        })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <PhotoComparisonModal
        visible={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        userUri={entity.photoUri}
        photos={gallery}
        onReferenceError={(url) => setFailed((current) => new Set([...current, url]))}
      />
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
  gallerySection: { marginBottom: space.xl },
  galleryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  galleryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info + '20',
  },
  galleryTitle: { ...type.sectionTitle, marginTop: 0, marginBottom: 0, marginLeft: space.sm, flex: 1 },
  countPill: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: space.sm },
  compareButton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.info + '55',
    backgroundColor: colors.info + '12',
  },
  compareIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info + '20',
  },
  compareCopy: { flex: 1 },
  compareTitle: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  compareHint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  imageRow: { marginTop: 2, marginRight: -20 },
  imageContent: { paddingRight: 20 },
  refItem: {
    width: PHOTO_WIDTH,
    height: 176,
    marginRight: PHOTO_GAP,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceElevated,
  },
  photoShade: { ...StyleSheet.absoluteFillObject, top: '42%' },
  photoCount: {
    position: 'absolute',
    right: space.sm,
    top: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  kindPill: {
    position: 'absolute',
    left: space.sm,
    top: space.sm,
    maxWidth: 164,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  kindText: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
  photoCountText: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
  similarityPill: {
    position: 'absolute',
    right: space.sm,
    top: 39,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  similarity: {
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '800',
  },
  citation: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: 25,
    color: colors.white,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  license: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: 9,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9.5,
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
  modalSafe: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  modalBody: { flex: 1, justifyContent: 'center' },
  modalClose: {
    position: 'absolute',
    zIndex: 2,
    right: space.md,
    top: space.sm,
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: control.minTouch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  modalImage: { width: '100%', height: '68%' },
  modalMeta: { paddingHorizontal: space.lg, paddingTop: space.md },
  modalTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  modalKind: { color: colors.info, fontSize: 12, fontWeight: '800', marginTop: 4 },
  modalCredit: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  modalLicense: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  modalLicenseLink: { textDecorationLine: 'underline' },
  sourceButton: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.sm,
  },
  sourceText: { color: colors.info, fontSize: 12.5, fontWeight: '700' },
});
