import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import CategoryIcon from './CategoryIcon';
import { getSpeciesPhoto } from './speciesPhoto';

// The hero image on every identification result.
//
// Ancora cenica full-bleed (diagramacao-premium): a hero framed as a card reads
// as "a photo glued on"; premium BLEEDS. Negative horizontal margins cancel the
// screens' 20px gutter (every detail screen uses `scroll: { padding: 20 }`),
// and a transparent -> colors.background gradient over the bottom third melts
// the art into the page instead of ending it at a border.
//
// States, in order of preference:
//
//   1. MOSAIC - the user's photo large on the left (~62%) with two reference
//      photos stacked on the right, plus a "+N" badge when more references
//      exist. Only when there IS a user photo AND >= 2 similar images; every
//      state below is the fallback chain, so no screen can ever render broken.
//   2. The user's own photo, side by side with a reference photo of the species.
//      Seeing your shot next to the real thing is how a person actually
//      confirms an identification.
//   3. The user's photo alone, when no reference exists for that species.
//   4. A reference photo alone - for a find restored from a backup, or one made
//      by sound, where there never was a user photo.
//   5. Icon on a gradient - when there is no photo at all.
//
// `similarImages` is a NEW OPTIONAL prop (the entity's own array, shape
// { url, full?, similarity? } - see IdentificationExtras). Every existing prop
// keeps its exact name and meaning, so current call sites work unchanged.
//
// The reference comes from Wikipedia keyed on the scientific name (see
// speciesPhoto.js). Fish and bird results already did this; plants, insects,
// mushrooms and crops did not, so those screens fell back to an icon on a
// gradient whenever the vendor returned no reference images of its own - which
// is most of the time. Lenda asked for exactly this: "na parte de peixes e aves
// mostra foto também, queria nas plantas".

// The screens' horizontal padding, cancelled so the art reaches both edges.
const GUTTER = 20;

// How many reference photos the mosaic swallows - and which entries count.
//
// Exported because IdentificationExtras renders the SAME array a few hundred
// pixels below: until now every result showed the first two references TWICE,
// once inside the mosaic and once in the "Reference photos" card, in 100% of
// results (auditoria de diagramacao 20/08 - a duplicata custava ~24% da
// viewport). The count lives here, next to the code that consumes it, so the
// two components can never drift apart again.
const MOSAIC_REFS = 2;

// The usable references: an entry without a url renders as a broken square.
export function heroRefs(similarImages) {
  return Array.isArray(similarImages) ? similarImages.filter((s) => s && s.url) : [];
}

// How many of them THIS entity's hero already showed. Zero unless the mosaic
// actually rendered - every other hero state (both-photos, single photo,
// icon-on-gradient) consumes no reference from the array at all.
export function heroRefCount(entity) {
  return entity?.photoUri && heroRefs(entity.similarImages).length >= MOSAIC_REFS
    ? MOSAIC_REFS
    : 0;
}

export default function PlantHero({
  photoUri,
  scientific,
  accent = colors.accent,
  icon = 'leaf',
  height = 220,
  similarImages,
}) {
  const { t, i18n } = useTranslation();
  const [reference, setReference] = useState(null);

  useEffect(() => {
    if (!scientific) {
      setReference(null);
      return undefined;
    }
    let alive = true;
    getSpeciesPhoto(scientific, i18n.language).then((p) => {
      if (alive) setReference(p);
    });
    return () => {
      alive = false;
    };
  }, [scientific, i18n.language]);

  const badge = (
    <View style={styles.badge}>
      <Ionicons name="scan-outline" size={13} color={colors.white} />
      {/* This said "Identified" as a hardcoded English string, in all 17
          languages, on every result screen in the app. */}
      <Text style={styles.badgeText}>{t('common.identified')}</Text>
    </View>
  );

  // The bottom-third fade of the scenic anchor. pointerEvents none: decoration
  // never steals a touch. Rendered BEFORE the labels/credit/badge so text
  // stays on top of it.
  const fade = (
    <LinearGradient
      colors={['transparent', colors.background]}
      style={styles.fade}
      pointerEvents="none"
    />
  );

  const refs = heroRefs(similarImages);

  // 1. Mosaic: your photo dominant, two references stacked beside it.
  if (photoUri && refs.length >= MOSAIC_REFS) {
    const extra = refs.length - MOSAIC_REFS;
    return (
      <View style={[styles.hero, styles.split, { height }]}>
        <View style={styles.mosaicMain}>
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
        <View style={styles.divider} />
        <View style={styles.mosaicSide}>
          <View style={styles.mosaicCell}>
            <Image source={{ uri: refs[0].url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
          <View style={styles.hDivider} />
          <View style={styles.mosaicCell}>
            <Image source={{ uri: refs[1].url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {extra > 0 && (
              <View style={styles.moreBadge}>
                <Text style={styles.moreText}>{`+${extra}`}</Text>
              </View>
            )}
          </View>
        </View>
        {fade}
        <View style={styles.labelRow} pointerEvents="none">
          <Text style={[styles.halfLabel, styles.labelMain]}>{t('common.yourPhoto')}</Text>
          <View style={styles.labelSideSpacer} />
        </View>
        {badge}
      </View>
    );
  }

  // 2. Both photos: yours on the left, the species on the right.
  if (photoUri && reference?.url) {
    return (
      <View style={[styles.hero, styles.split, { height }]}>
        <View style={styles.half}>
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
        <View style={styles.divider} />
        <View style={styles.half}>
          <Image source={{ uri: reference.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
        {fade}
        <View style={styles.labelRow} pointerEvents="none">
          <Text style={[styles.halfLabel, styles.labelHalf]}>{t('common.yourPhoto')}</Text>
          <View style={styles.labelGap} />
          <Text style={[styles.halfLabel, styles.labelHalf]}>{t('common.referencePhoto')}</Text>
        </View>
        {badge}
      </View>
    );
  }

  // 3 & 4. Whichever single photo exists.
  const single = photoUri || reference?.url;
  if (single) {
    return (
      <View style={[styles.hero, { height }]}>
        <Image source={{ uri: single }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {fade}
        {/* Credit is only owed when the picture is not the user's own. */}
        {!photoUri && reference?.sourceUrl && (
          <TouchableOpacity style={styles.credit} accessibilityRole="link">
            <Text style={styles.creditText}>{t('fieldGuide.photoCredit')}</Text>
          </TouchableOpacity>
        )}
        {badge}
      </View>
    );
  }

  // 5. No photo at all: the gradient-and-icon card of before, now full-bleed.
  return (
    <LinearGradient
      colors={[accent + '55', colors.surfaceElevated, colors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { height }]}
    >
      <View style={[styles.pot, { borderColor: accent + '66' }]}>
        {/* CategoryIcon, not Ionicons: mushroom, tree and bird have no Ionicons
            glyph, so those categories rendered a blank circle here. */}
        <CategoryIcon name={icon} size={height * 0.32} color={accent} />
      </View>
      {fade}
      {badge}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    // Ancora cenica (diagramacao-premium): full-bleed via negative margins
    // that cancel the screens' gutter - never position: absolute. alignSelf
    // stretch (instead of the old width: '100%') lets the negative margins
    // actually widen the box past the parent's padding.
    alignSelf: 'stretch',
    marginHorizontal: -GUTTER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '34%',
  },
  split: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-start' },
  half: { flex: 1, height: '100%' },
  // A hairline of background between photos, so they read as separate images
  // rather than one badly-stitched panorama.
  divider: { width: 2, height: '100%', backgroundColor: colors.background },
  hDivider: { height: 2, backgroundColor: colors.background },
  // Mosaic: user photo ~62%, references stacked in the remaining ~38%.
  mosaicMain: { flex: 62, height: '100%' },
  mosaicSide: { flex: 38, height: '100%' },
  mosaicCell: { flex: 1, overflow: 'hidden' },
  moreBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  moreText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },
  // Labels live on their own layer ABOVE the fade (they used to sit inside the
  // halves, where the fade would wash them out).
  labelRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  labelHalf: { flex: 1 },
  labelGap: { width: 2 },
  labelMain: { flex: 62 },
  labelSideSpacer: { flex: 38 },
  halfLabel: {
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pot: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  credit: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    right: 12,
  },
  creditText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    textAlign: 'center',
  },
});
