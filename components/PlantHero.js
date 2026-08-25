import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import CategoryIcon from './CategoryIcon';
import { getSpeciesPhoto } from './speciesPhoto';
import { enrichmentTaxon } from './taxonIdentity';

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
//   1. The user's own photo as the full-width field observation.
//   2. A reference photo alone - for a find restored from a backup, or one made
//      by sound, where there never was a user photo.
//   3. Icon on a gradient - when there is no photo at all.
//
// Reference photos used to be squeezed into the hero as a 62/38 mosaic. That
// made the observation smaller and consumed the first two references before
// the evidence section, leaving only tiny leftovers below. They now belong to
// the large, swipeable comparison gallery; the hero owns one clear subject.
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

// The usable references: an entry without a url renders as a broken square.
export function heroRefs(similarImages) {
  return Array.isArray(similarImages) ? similarImages.filter((s) => s && s.url) : [];
}

// A live result keeps every vendor photo for the gallery because the hero is
// the person's own observation. A restored record without that local photo
// uses the first vendor image as its cover, so only that one is skipped below.
export function heroRefCount(entity) {
  const count = heroRefs(entity?.similarImages).length;
  if (entity?.photoUri) return 0;
  return count > 0 ? 1 : 0;
}

export default function PlantHero({
  photoUri,
  scientific,
  identityV1,
  accent = colors.accent,
  icon = 'leaf',
  height = 164,
  similarImages,
  showIdentifiedBadge = true,
}) {
  const { t, i18n } = useTranslation();
  const [reference, setReference] = useState(null);
  const [failedReferenceUrl, setFailedReferenceUrl] = useState(null);
  const refs = heroRefs(similarImages);
  const vendorReference = refs.find((item) => item.url !== failedReferenceUrl) || null;
  const enrichmentScientific = enrichmentTaxon(identityV1, {
    scientificName: scientific,
  })?.canonicalName || null;

  useEffect(() => {
    // A busca enciclopedica e fallback, nao uma chamada paralela obrigatoria.
    // Com referencia do fornecedor ela so gastava rede e nunca era exibida.
    if (!enrichmentScientific || vendorReference) {
      setReference(null);
      return undefined;
    }
    let alive = true;
    getSpeciesPhoto(enrichmentScientific, i18n.language).then((p) => {
      if (alive) setReference(p);
    });
    return () => {
      alive = false;
    };
  }, [enrichmentScientific, i18n.language, vendorReference?.url]);

  useEffect(() => {
    setFailedReferenceUrl(null);
  }, [similarImages]);

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

  // A referencia devolvida junto da identificacao pertence ao mesmo registro
  // taxonomico que venceu a foto. Ela tem prioridade sobre uma nova busca por
  // nome na Wikipedia, que e apenas o fallback para resultados antigos.
  const preferredReference = vendorReference?.url
    ? {
        url: vendorReference.url,
        credit: [vendorReference.citation, vendorReference.licenseName].filter(Boolean).join(' · '),
        sourceUrl:
          vendorReference.sourceUrl ||
          (/^https?:\/\//.test(vendorReference.citation || '') ? vendorReference.citation : null) ||
          vendorReference.licenseUrl ||
          null,
      }
    : reference
    ? {
        ...reference,
        credit: [reference.imageCreator, reference.imageLicense].filter(Boolean).join(' · '),
        sourceUrl: reference.imageSourceUrl || reference.sourceUrl || null,
      }
    : null;

  // The live observation stays whole; references are compared at readable
  // size immediately below. Restored records fall back to one reference here.
  const single = photoUri || preferredReference?.url;
  if (single) {
    return (
      <View style={[styles.hero, { height }]}>
        <Image
          source={{ uri: single }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => {
            if (!photoUri && vendorReference?.url) setFailedReferenceUrl(vendorReference.url);
          }}
        />
        {fade}
        {/* Credit is only owed when the picture is not the user's own. */}
        {!photoUri && !!preferredReference?.credit && preferredReference?.sourceUrl && (
          <TouchableOpacity
            style={styles.credit}
            accessibilityRole="link"
            onPress={() => preferredReference.sourceUrl && Linking.openURL(preferredReference.sourceUrl)}
          >
            <Text style={styles.creditText} numberOfLines={1}>
              {t('detail.speciesCareSource', { citation: preferredReference.credit })}
            </Text>
          </TouchableOpacity>
        )}
        {!photoUri && !!preferredReference?.credit && !preferredReference?.sourceUrl && (
          <Text style={styles.creditTextOverlay} numberOfLines={1}>
            {preferredReference.credit}
          </Text>
        )}
        {!photoUri && !preferredReference?.credit && preferredReference?.sourceUrl && (
          <TouchableOpacity
            style={styles.credit}
            accessibilityRole="link"
            onPress={() => Linking.openURL(preferredReference.sourceUrl)}
          >
            <Text style={styles.creditText}>{t('fieldGuide.photoCredit')}</Text>
          </TouchableOpacity>
        )}
        {!!photoUri && <Text style={styles.singleLabel}>{t('common.yourPhoto')}</Text>}
        {showIdentifiedBadge && badge}
      </View>
    );
  }

  // 3. No photo at all: the gradient-and-icon card of before, now full-bleed.
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
      {showIdentifiedBadge && badge}
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
  singleLabel: {
    position: 'absolute',
    left: 14,
    bottom: 10,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
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
  creditTextOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
