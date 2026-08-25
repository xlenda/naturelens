import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import CategoryIcon from './CategoryIcon';
import { getSpeciesPhoto } from './speciesPhoto';

// The thumbnail for any find or species, with one photo-priority chain used
// everywhere ("encha de imagem" doctrine - an icon is the LAST resort, not
// the default):
//
//   1. The user's own photo. It is already on the device, costs nothing, and
//      is the single most affective image the app can show - the collection
//      should look like THEIR album, not a catalogue of icons.
//   2. A real photo of the species, from Wikipedia keyed by scientific name
//      (cached in speciesPhoto.js). Covers finds restored from the cloud,
//      which deliberately travel without the personal photo.
//   3. The category icon on the accent colour - what every card showed before.
//
// The reference fetch only fires when there is no user photo, so a normal
// local collection renders instantly with zero network.
export default function FindThumb({
  photoUri,
  referenceUri,
  referencePhoto,
  similarImages,
  scientific,
  icon,
  accent,
  iconSize = 28,
  style,
}) {
  const { i18n } = useTranslation();
  const [reference, setReference] = useState(null);
  const [failedUris, setFailedUris] = useState([]);
  const vendorReference =
    referenceUri ||
    referencePhoto ||
    (Array.isArray(similarImages) ? similarImages.find((img) => img?.url)?.url : null);
  const directCandidates = [photoUri, vendorReference].filter(Boolean);
  const needsReference =
    !!scientific && directCandidates.every((uri) => failedUris.includes(uri));

  useEffect(() => {
    // A blob URL pode morrer depois de um reload e um arquivo de cache pode ser
    // limpo pelo sistema. Uma troca real de entidade deve tentar seus enderecos
    // novamente; uma falha desta entidade, por outro lado, avanca para a foto
    // de referencia sem deixar um quadrado quebrado na colecao.
    setFailedUris([]);
  }, [photoUri, vendorReference, scientific]);

  useEffect(() => {
    if (!needsReference) {
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
  }, [needsReference, scientific, i18n.language]);

  const uri = [...directCandidates, reference?.url].find(
    (candidate) => candidate && !failedUris.includes(candidate)
  );
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, style]}
        resizeMode="cover"
        onError={() => setFailedUris((current) =>
          current.includes(uri) ? current : [...current, uri]
        )}
      />
    );
  }

  return (
    <View style={[styles.iconBox, { backgroundColor: (accent || '#4E9F6B') + '33' }, style]}>
      <CategoryIcon name={icon} size={iconSize} color={accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#1F2A25' },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
});
