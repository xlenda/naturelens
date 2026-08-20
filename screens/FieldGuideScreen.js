import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import SectionCard from '../components/SectionCard';
import CategoryIcon from '../components/CategoryIcon';
import { colors } from '../components/theme';
import { getSpeciesDetail } from '../components/speciesDetails';
import { getSpeciesPhoto } from '../components/speciesPhoto';
import { CATEGORIES } from '../components/categories';

// Which scan tab the "go identify one" CTA opens, keyed by the icon the entry
// arrived with (the icon doubles as the collection's category marker). Before
// the books shipped only fish and birds ever reached this screen, so the CTA
// was a bird/fish ternary; insect, fungi, crop and sound chapters land here
// now too and must not all be sent to the Fish camera. Sounds only has a tab
// when the category is enabled (web) - registered here conditionally so we
// never navigate to a route that does not exist.
const CTA_TAB_BY_ICON = {
  bird: CATEGORIES.bird.tabLabel,
  'bug-outline': CATEGORIES.insect.tabLabel,
  'mushroom-outline': CATEGORIES.mushroom.tabLabel,
  'nutrition-outline': CATEGORIES.crop.tabLabel,
  ...(CATEGORIES.sound.enabled ? { 'mic-outline': CATEGORIES.sound.tabLabel } : null),
};

// Field-guide entry for a species in a Discover collection (fish, birds).
//
// Deliberately NOT gated behind a subscription, unlike the herb details: the
// herb content is a deep 98-entry reference that took real curation and is part
// of what people pay for. These twenty entries exist to make the Discover tab
// feel alive to a brand-new visitor - putting them behind a paywall would gate
// the very thing meant to show the app is worth paying for.

export default function FieldGuideScreen({ route }) {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { speciesId, name, sci, color = colors.accent, icon } = route.params;

  const [detail, setDetail] = useState(undefined); // undefined = loading
  // Real photograph, fetched on demand and never stored on the device.
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    let alive = true;
    getSpeciesDetail(i18n.language, speciesId).then((d) => {
      if (alive) setDetail(d);
    });
    // Keyed on the SCIENTIFIC name because that is identical in every language.
    getSpeciesPhoto(sci, i18n.language).then((p) => {
      if (alive) setPhoto(p);
    });
    return () => {
      alive = false;
    };
  }, [i18n.language, speciesId, sci]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Photo when we have one, the category icon otherwise - never an
            empty grey box. */}
        {photo ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => photo.sourceUrl && Linking.openURL(photo.sourceUrl)}
            accessibilityRole="imagebutton"
            accessibilityLabel={name}
          >
            <Image source={{ uri: photo.url }} style={styles.heroPhoto} resizeMode="cover" />
            <Text style={styles.photoCredit}>{t('fieldGuide.photoCredit')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.heroIcon, { backgroundColor: color + '22' }]}>
            <CategoryIcon name={icon || 'leaf-outline'} size={30} color={color} />
          </View>
        )}

        <Text style={styles.name}>{name}</Text>
        {!!sci && <Text style={styles.sci}>{sci}</Text>}

        {detail === undefined && (
          <View style={styles.loading}>
            <ActivityIndicator color={color} />
          </View>
        )}

        {detail === null && (
          <Text style={styles.error}>{t('discover.herbDetailsLoadError')}</Text>
        )}

        {detail && (
          <>
            <SectionCard icon="document-text-outline" title={t('common.overview')} color={color}>
              <Text style={styles.body}>{detail.overview}</Text>
            </SectionCard>

            {!!detail.habitat && (
              <SectionCard icon="earth-outline" title={t('fieldGuide.habitat')} color={colors.info}>
                <Text style={styles.body}>{detail.habitat}</Text>
              </SectionCard>
            )}

            {!!detail.curiosity && (
              <SectionCard icon="sparkles-outline" title={t('fieldGuide.curiosity')} color={colors.warning}>
                <Text style={styles.body}>{detail.curiosity}</Text>
              </SectionCard>
            )}
          </>
        )}

        {/* Nudge back into the product: reading about a species is exactly the
            moment someone is most likely to want to go find one. */}
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: color }]}
          activeOpacity={0.85}
          onPress={() => navigation.getParent()?.getParent()?.navigate(CTA_TAB_BY_ICON[icon] || CATEGORIES.fish.tabLabel)}
          accessibilityRole="button"
          accessibilityLabel={t('fieldGuide.identifyCta')}
        >
          <Ionicons name="scan" size={18} color={colors.white} />
          <Text style={styles.ctaText}>{t('fieldGuide.identifyCta')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  heroPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: 6,
    backgroundColor: colors.surfaceElevated,
  },
  photoCredit: {
    color: colors.textMuted,
    fontSize: 10.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  sci: {
    color: colors.textMuted,
    fontSize: 14.5,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 22,
  },
  loading: { paddingVertical: 40 },
  error: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 30 },
  body: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 22 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 15,
    paddingVertical: 16,
    marginTop: 24,
  },
  ctaText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
