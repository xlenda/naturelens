import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BackChevron from '../components/BackChevron';
import SectionCard from '../components/SectionCard';
import { colors } from '../components/theme';
import { getSpeciesPhoto } from '../components/speciesPhoto';

function StatPill({ icon, label, value, color }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon} size={16} color={color} />
      <View style={{ marginLeft: 8 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function SpeciesDetailScreen({ route }) {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { speciesKey, color } = route.params;

  const name = t(`discover.species.${speciesKey}.name`);
  const sci = t(`discover.species.${speciesKey}.sci`);

  // Foto REAL da especie para o hero, da Wikipedia pelo nome cientifico
  // (cadeia ja pronta e cacheada em speciesPhoto.js). Performance: UMA
  // busca por tela - so a especie visivel - e o cache absorve revisitas.
  const [refPhoto, setRefPhoto] = useState(null);
  useEffect(() => {
    if (!sci) {
      setRefPhoto(null);
      return undefined;
    }
    let alive = true;
    getSpeciesPhoto(sci, i18n.language).then((p) => {
      if (alive) setRefPhoto(p);
    });
    return () => {
      alive = false;
    };
  }, [sci, i18n.language]);
  const light = t(`discover.species.${speciesKey}.light`);
  const water = t(`discover.species.${speciesKey}.water`);
  const difficulty = t(`discover.species.${speciesKey}.difficulty`);
  const overview = t(`discover.species.${speciesKey}.overview`);
  const funFact = t(`discover.species.${speciesKey}.funFact`);

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
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>{name}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {refPhoto?.url ? (
          // Ancora cenica full-bleed (diagramacao-premium, mesmo dispositivo do
          // PlantHero): margem negativa cancela o gutter de 20 do scroll e o
          // gradiente transparente -> background funde a foto na pagina. O nome
          // logo abaixo e a legenda do tile - nunca selo pequeno num card.
          <View style={styles.heroTile}>
            <Image source={{ uri: refPhoto.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', colors.background]}
              style={styles.heroFade}
              pointerEvents="none"
            />
            {/* Foto e da Wikimedia - credito obrigatorio (speciesPhoto.js:
                "Never present a third party's photo as ours"), e o texto
                promete tap, entao o tap abre a fonte de verdade. */}
            {!!refPhoto.sourceUrl && (
              <TouchableOpacity
                style={styles.heroCredit}
                onPress={() => Linking.openURL(refPhoto.sourceUrl)}
                accessibilityRole="link"
                accessibilityLabel={t('fieldGuide.photoCredit')}
              >
                <Text style={styles.heroCreditText}>{t('fieldGuide.photoCredit')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          // Fallback (offline / especie sem Wikipedia): exatamente como hoje,
          // icone no quadrado colorido - a tela nunca nasce quebrada.
          <View style={[styles.heroThumb, { backgroundColor: color + '33' }]}>
            <Ionicons name="leaf" size={40} color={color} />
          </View>
        )}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.sci}>{sci}</Text>

        <View style={styles.statsRow}>
          <StatPill icon="sunny-outline" label={t('discover.speciesLightLabel')} value={light} color={colors.warning} />
          <StatPill icon="water-outline" label={t('discover.speciesWaterLabel')} value={water} color={colors.info} />
        </View>
        <StatPill icon="speedometer-outline" label={t('discover.speciesDifficultyLabel')} value={difficulty} color={color} />

        <SectionCard icon="leaf-outline" title={t('common.overview')} color={color}>
          <Text style={styles.body}>{overview}</Text>
        </SectionCard>

        <SectionCard icon="bulb-outline" title={t('discover.funFactLabel')} color={colors.purple}>
          <Text style={styles.body}>{funFact}</Text>
        </SectionCard>
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
    paddingTop: 8,
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
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, marginHorizontal: 8, textAlign: 'center' },
  scroll: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  heroThumb: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  // Tile do hero: full-bleed via margem negativa que cancela o padding 20 do
  // scroll (mesmo dispositivo do PlantHero - nunca position absolute).
  heroTile: {
    alignSelf: 'stretch',
    marginHorizontal: -20,
    height: 210,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%' },
  heroCredit: { position: 'absolute', bottom: 8, left: 12, right: 12 },
  heroCreditText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, textAlign: 'center' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sci: { fontSize: 14, fontStyle: 'italic', color: colors.textMuted, textAlign: 'center', marginTop: 2, marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
});
