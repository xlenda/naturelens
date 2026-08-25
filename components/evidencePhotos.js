// A reference image is evidence, not decoration. Keep the strongest semantic
// source first (the vendor match, then the vendor's representative image,
// then licensed field observations) and collapse the same asset when providers
// expose it through resized or tracked URLs.

function normaliseHost(value) {
  return String(value || '').replace(
    /^(https?):\/\/([^/]+)/i,
    (_match, protocol, host) => `${protocol.toLowerCase()}://${host.toLowerCase()}`
  );
}

function normaliseSource(value) {
  return normaliseHost(value).split('#')[0].split('?')[0].replace(/\/$/, '');
}

function normaliseImage(value) {
  const clean = normaliseHost(value).split('#')[0];
  if (!clean) return '';

  // Wikimedia thumbnails encode only the requested rendition after /thumb/.
  // Reducing that path joins the preview and full-size forms of the same file.
  const wiki = clean.match(/^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/(.+?)\/[^/?#]+(?:\?.*)?$/i);
  if (wiki) return `${wiki[1]}/${wiki[2]}`;

  return clean;
}

export function evidenceKeys(photo) {
  if (!photo) return [];
  return [
    photo.sourceUrl ? `source:${normaliseSource(photo.sourceUrl)}` : '',
    photo.full ? `image:${normaliseImage(photo.full)}` : '',
    photo.url ? `image:${normaliseImage(photo.url)}` : '',
  ].filter(Boolean);
}

export function canonicalEvidenceKey(photo, index = 0) {
  return evidenceKeys(photo)[0] || `evidence:${index}`;
}

export function mergeEvidencePhotos(...lists) {
  const seen = new Set();
  const merged = [];

  lists.flat().forEach((photo) => {
    if (!photo?.url) return;
    const keys = evidenceKeys(photo);
    if (keys.some((key) => seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    merged.push(photo);
  });

  return merged;
}

export function evidenceLabelKey(photo) {
  if (photo?.kind === 'similar') return 'identify.evidenceSimilar';
  if (photo?.kind === 'observation') return 'identify.evidenceObservation';
  return 'identify.evidenceRepresentative';
}
