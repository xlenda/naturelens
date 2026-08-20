import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// Real distribution map - the competitor DRAWS its map; ours is science.
// GBIF's public map API renders every recorded occurrence of the species on
// earth: a dark basemap tile (tile.gbif.org) with the density overlay
// (api.gbif.org/v2/map) stacked on top, both free, keyless, verified live.
// The species is resolved to a taxonKey through /v1/species/match by its
// scientific name, and that lookup is cached forever in AsyncStorage - a
// species' key never changes.
//
// Honesty: renders NOTHING when the name doesn't match a GBIF taxon or the
// network fails - a map is either real or absent. The GBIF.org credit is
// their stated attribution requirement for API use.
export default function DistributionMap({ scientific, accent = colors.accent }) {
  const { t } = useTranslation();
  const [taxonKey, setTaxonKey] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!scientific) return undefined;
    (async () => {
      const cacheKey = '@naturelens_gbif_' + scientific.toLowerCase();
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached !== null) {
          if (alive && cached !== 'none') setTaxonKey(cached);
          return;
        }
        const r = await fetch(
          'https://api.gbif.org/v1/species/match?name=' + encodeURIComponent(scientific),
          { headers: { 'User-Agent': 'NatureLens (naturelensapp.cloud)' } }
        );
        if (!r.ok) return;
        const d = await r.json();
        const key = d?.usageKey ? String(d.usageKey) : null;
        await AsyncStorage.setItem(cacheKey, key || 'none').catch(() => {});
        if (alive && key) setTaxonKey(key);
      } catch (e) {
        // offline / GBIF down: section simply doesn't render
      }
    })();
    return () => {
      alive = false;
    };
  }, [scientific]);

  if (!taxonKey) return null;

  const base = 'https://tile.gbif.org/3857/omt/0/0/0@2x.png?style=gbif-dark';
  const density =
    'https://api.gbif.org/v2/map/occurrence/density/0/0/0@2x.png?taxonKey=' +
    taxonKey +
    '&style=greenHeat.point&srs=EPSG:3857';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('detail.distribution')}</Text>
      <View style={styles.mapBox}>
        <Image source={{ uri: base }} style={styles.map} resizeMode="cover" />
        <Image source={{ uri: density }} style={[styles.map, StyleSheet.absoluteFillObject]} resizeMode="cover" />
      </View>
      <Text style={styles.credit}>{t('detail.gbifCredit')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  mapBox: {
    // The z0 web-mercator world tile is square; 2:1 crops the empty poles
    // away and reads as a world map.
    width: '100%',
    aspectRatio: 2,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  map: { width: '100%', height: '100%' },
  credit: { fontSize: 11, color: colors.textMuted, marginTop: 6, textAlign: 'right' },
});
