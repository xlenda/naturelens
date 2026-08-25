import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getTaxonKey } from './gbifTaxonKey';
import { enrichmentTaxon } from './taxonIdentity';

// Real distribution map - the competitor DRAWS its map; ours is science.
// GBIF's public map API renders every recorded occurrence of the species on
// earth: a dark basemap tile (tile.gbif.org) with the density overlay
// (api.gbif.org/v2/map) stacked on top, both free, keyless, verified live.
// The species is resolved to a taxonKey through /v1/species/match by its
// scientific name, and that lookup is cached forever in AsyncStorage - a
// species' key never changes. Esse resolve mora em gbifTaxonKey.js desde a
// paridade 120% (video do concorrente, 20/08), porque o SeasonChart precisa do
// MESMO taxonKey: chave de cache identica, uma unica chamada por especie.
//
// Honesty: renders NOTHING when the name doesn't match a GBIF taxon or the
// network fails - a map is either real or absent. The GBIF.org credit is
// their stated attribution requirement for API use.
export default function DistributionMap({ scientific, gbifId, identityV1, accent = colors.accent }) {
  const { t } = useTranslation();
  const [taxonKey, setTaxonKey] = useState(null);
  const enrichment = enrichmentTaxon(identityV1, {
    scientificName: scientific,
    gbifKey: gbifId,
  });
  const resolvedScientific = enrichment?.canonicalName || null;
  const resolvedGbifId = enrichment?.gbifKey || null;

  useEffect(() => {
    let alive = true;
    // Limpa antes de resolver o proximo: sem isto a especie nova herdava o
    // mapa da anterior enquanto o lookup rodava - e ficava com ele para sempre
    // quando o nome novo nao casava com taxon nenhum (ou sumia).
    setTaxonKey(null);
    // offline / GBIF down / sem match: getTaxonKey devolve null e a secao
    // simplesmente nao renderiza.
    getTaxonKey(resolvedScientific, resolvedGbifId).then((key) => {
      if (alive && key) setTaxonKey(key);
    });
    return () => {
      alive = false;
    };
  }, [resolvedScientific, resolvedGbifId]);

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
