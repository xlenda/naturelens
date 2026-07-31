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
// Three states, in order of preference:
//
//   1. The user's own photo, side by side with a reference photo of the species.
//      This is the state that matters: seeing your shot next to the real thing
//      is how a person actually confirms an identification, and it turns a flat
//      dark card into the most interesting part of the screen.
//   2. The user's photo alone, when no reference exists for that species.
//   3. A reference photo alone - for a find restored from a backup, or one made
//      by sound, where there never was a user photo.
//
// The reference comes from Wikipedia keyed on the scientific name (see
// speciesPhoto.js). Fish and bird results already did this; plants, insects,
// mushrooms and crops did not, so those screens fell back to an icon on a
// gradient whenever the vendor returned no reference images of its own - which
// is most of the time. Lenda asked for exactly this: "na parte de peixes e aves
// mostra foto também, queria nas plantas".

export default function PlantHero({
  photoUri,
  scientific,
  accent = colors.accent,
  icon = 'leaf',
  height = 220,
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

  // 1. Both photos: yours on the left, the species on the right.
  if (photoUri && reference?.url) {
    return (
      <View style={[styles.hero, styles.split, { height }]}>
        <View style={styles.half}>
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Text style={styles.halfLabel}>{t('common.yourPhoto')}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.half}>
          <Image source={{ uri: reference.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Text style={styles.halfLabel}>{t('common.referencePhoto')}</Text>
        </View>
        {badge}
      </View>
    );
  }

  // 2 & 3. Whichever single photo exists.
  const single = photoUri || reference?.url;
  if (single) {
    return (
      <View style={[styles.hero, { height }]}>
        <Image source={{ uri: single }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
      {badge}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  split: { flexDirection: 'row' },
  half: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  // A hairline of background between the two photos, so they read as two images
  // rather than one badly-stitched panorama.
  divider: { width: 2, height: '100%', backgroundColor: colors.background },
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
