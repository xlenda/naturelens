function cleanText(value, separator = ', ') {
  const values = Array.isArray(value) ? value : [value];
  const clean = values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return clean.length ? [...new Set(clean)].join(separator) : null;
}

function topic(key, label, text, presentation = {}) {
  const cleanLabel = cleanText(label);
  const cleanBody = cleanText(text);
  if (!cleanLabel || !cleanBody) return null;
  return { key, label: cleanLabel, text: cleanBody, ...presentation };
}

function detailText(rows) {
  if (!Array.isArray(rows)) return null;
  const lines = rows.map((row) => {
    const label = cleanText(row?.label);
    const value = cleanText(row?.value);
    return label && value ? `${label}: ${value}` : null;
  }).filter(Boolean);
  return lines.length ? [...new Set(lines)].join('\n') : null;
}

function lookAlikeText(rows) {
  if (!Array.isArray(rows)) return null;
  const lines = rows.map((row) => {
    const fields = [row?.name, row?.description, row?.features]
      .map(cleanText)
      .filter(Boolean);
    return fields.length ? `\u2022 ${fields.join(' \u2014 ')}` : null;
  }).filter(Boolean);
  return lines.length ? [...new Set(lines)].join('\n') : null;
}

// Os builders recebem texto ja localizado. Eles apenas ligam uma porta do
// manual a evidencia existente; nenhum fallback editorial nasce nesta camada.
function buildMushroomTopics({ labels = {}, safetyText, lookAlikes, overview, habitat, curiosity, detailRows } = {}) {
  return [
    topic('safety', labels.safety, safetyText),
    topic('confusas', labels.lookAlikes, lookAlikeText(lookAlikes)),
    topic('overview', labels.overview, overview),
    topic('habitat', labels.habitat, habitat),
    topic('curiosity', labels.curiosity, curiosity),
    topic('details', labels.details, detailText(detailRows)),
  ].filter(Boolean);
}

function buildSoundTopics({ labels = {}, presentation = {}, evidenceLines, overview, habitat, curiosity, detailRows } = {}) {
  return [
    topic('evidence', labels.evidence, cleanText(evidenceLines, '\n'), presentation.evidence),
    topic('overview', labels.overview, overview, presentation.overview),
    topic('habitat', labels.habitat, habitat, presentation.habitat),
    topic('curiosity', labels.curiosity, curiosity, presentation.curiosity),
    topic('details', labels.details, detailText(detailRows), presentation.details),
  ].filter(Boolean);
}

module.exports = {
  buildMushroomTopics,
  buildSoundTopics,
  cleanText,
  detailText,
  lookAlikeText,
};
