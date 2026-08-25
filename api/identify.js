const { kindwiseIdentify, requireMethod } = require('./_lib/kindwise');
const { fishialIdentify } = require('./_lib/fishial');
const { nyckelIdentify } = require('./_lib/nyckel');
const {
  bioclipBirdIdentify,
  isBioClipConfigured,
} = require('./_lib/bioclipBird');
const { resolveExactBirdLabel } = require('./_lib/birdDossier');
const { perchIdentify } = require('./_lib/perch');
const { translateVendorText, looksLikeProse, normaliseLanguage } = require('./_lib/translate');
const { requireDeviceId } = require('./_lib/supabaseAdmin');
const { checkEntitlement, recordUsage } = require('./_lib/entitlement');
const { checkRateLimit } = require('./_lib/rateLimit');
const { translateEntity } = require('./_lib/translateEntity');
const { buildIdentityV1 } = require('../components/taxonIdentity');

// One handler for every identification category.
//
// This used to be five near-identical files (identify-plant.js,
// identify-insect.js, identify-mushroom.js, identify-crop.js,
// identify-tree.js). They were merged for one hard reason: Vercel's Hobby plan
// refuses any deployment with more than 12 Serverless Functions, each file
// under api/ (outside _lib/) counts as one, and the project was sitting at
// exactly 12 - so adding fish or bird as new files would have broken the
// deploy outright. Merging them freed four slots.
//
// It also removed real duplication: identify-plant.js and identify-tree.js were
// byte-for-byte identical apart from the category string, so every fix had to be
// applied twice (the source of more than one past bug).
//
// Old URLs (/api/identify-plant etc.) still work - vercel.json rewrites them
// onto this handler's ?category= form, so any already-installed PWA or cached
// bundle keeps working instead of 404ing.

// Data Kindwise already returns and the app used to throw away.
//
// Every /identification call asks for `similar_images: true` and gets back a
// ranked list of candidate species, but the mappers below only ever read
// `suggestions[0]` and never touched the images. That meant: when the model's
// first guess was wrong the user just saw a wrong answer and concluded the app
// was bad, with no way to see that the right species was sitting at #2 - and we
// were paying for reference photos nobody ever saw.
//
// Both helpers are null-safe on purpose: the exact response shape differs
// slightly between the Kindwise products, so anything missing degrades to an
// empty list rather than breaking an identification that otherwise worked.

// Runners-up, so a near-miss can be self-corrected by the person holding the
// plant. Capped at 2 - a longer list stops being a hint and becomes a quiz.
function probabilityPercent(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100)
    : null;
}

function vendorProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function joinedNames(values) {
  if (!Array.isArray(values)) return null;
  const names = values.filter((value) => typeof value === 'string' && value.trim());
  return names.length ? names.join(', ') : null;
}

function mapVendorNames(details, fallbackName) {
  const names = Array.isArray(details?.common_names)
    ? details.common_names.filter((value) => typeof value === 'string' && value.trim())
    : [];
  return {
    name: names[0] || fallbackName,
    commonNames: names.length > 1 ? names.slice(1).join(', ') : null,
    synonyms: joinedNames(details?.synonyms),
  };
}

function descriptionEvidence(...descriptions) {
  for (const description of descriptions) {
    if (typeof description === 'string' && description.trim()) {
      return {
        overview: description,
        overviewCitation: null,
        overviewLicense: null,
        overviewLicenseUrl: null,
      };
    }
    if (
      description &&
      typeof description === 'object' &&
      typeof description.value === 'string' &&
      description.value.trim()
    ) {
      return {
        overview: description.value,
        overviewCitation:
          typeof description.citation === 'string' && description.citation.trim()
            ? description.citation
            : null,
        overviewLicense:
          typeof description.license_name === 'string' && description.license_name.trim()
            ? description.license_name
            : null,
        overviewLicenseUrl:
          typeof description.license_url === 'string' && description.license_url.trim()
            ? description.license_url
            : null,
      };
    }
  }
  return {
    overview: null,
    overviewCitation: null,
    overviewLicense: null,
    overviewLicenseUrl: null,
  };
}

function mapAlternatives(suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length < 2) return null;
  const rest = suggestions.slice(1, 3).map((s) => ({
    id: s.id ? String(s.id) : s.name,
    name: (s.details?.common_names && s.details.common_names[0]) || s.name,
    scientific: s.scientific_name || s.name,
    confidence: probabilityPercent(s.probability),
  }));
  return rest.length ? rest : null;
}

// Runners-up for a SOUND result. Separate from mapAlternatives because Perch's
// response shape is its own (score/scientific_name, not probability/details) and
// because two of its entries have to be dropped rather than shown:
//   * FSD50K sound events - offering "Car" as the second-best guess for a bird
//     song is nonsense, and there is no species page behind it;
//   * anything at or below the noise floor - an alternative the model is not
//     actually proposing should not be presented as a candidate.
function mapSoundAlternatives(list) {
  if (!Array.isArray(list) || list.length < 2) return null;
  const rest = list
    .slice(1, 3)
    .filter((p) => p && p.group !== 'noise' && (p.score || 0) > 0)
    .map((p) => ({
      id: p.code ? String(p.code) : p.label,
      name: p.common_name || p.label,
      scientific: p.scientific_name || null,
      confidence: probabilityPercent(p.score),
      group: p.group || null,
    }));
  return rest.length ? rest : null;
}

const MAX_REFERENCE_IMAGES = 10;

function mapReferenceImage(raw, kind) {
  if (!raw) return null;
  const record = typeof raw === 'string' ? { value: raw } : raw;
  const url = record.url_small || record.value || record.url || null;
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  const full = record.url || record.value || url;
  const citation = typeof record.citation === 'string' ? record.citation : null;
  return {
    url,
    full: typeof full === 'string' && /^https?:\/\//i.test(full) ? full : url,
    similarity:
      kind === 'similar' && typeof record.similarity === 'number'
        ? Math.round(record.similarity * 100)
        : null,
    citation,
    sourceUrl: citation && /^https?:\/\//i.test(citation) ? citation : null,
    licenseName: typeof record.license_name === 'string' ? record.license_name : null,
    licenseUrl: typeof record.license_url === 'string' ? record.license_url : null,
    kind,
  };
}

// Kindwise has two complementary evidence sets on the WINNING taxon:
// `similar_images` visually match the submitted photo, while details.images
// are licensed representative photos of that exact species. The old mapper
// kept only four similar images and never requested the representative set,
// which is why a rich provider response became a row of one or two thumbnails.
// They share one list so storage, sync and every category keep the same shape.
function mapSimilarImages(suggestion) {
  const similar = Array.isArray(suggestion?.similar_images) ? suggestion.similar_images : [];
  const detailImages = Array.isArray(suggestion?.details?.images)
    ? suggestion.details.images
    : [];
  const representative = [suggestion?.details?.image, ...detailImages].filter(Boolean);
  const seen = new Set();
  const mapped = [...similar.map((image) => [image, 'similar']), ...representative.map((image) => [image, 'representative'])]
    .map(([image, kind]) => mapReferenceImage(image, kind))
    .filter((image) => {
      if (!image) return false;
      const key = image.full || image.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_REFERENCE_IMAGES);
  return mapped.length ? mapped : null;
}

const PLANT_HOST = 'https://plant.id/api/v3';
const KINDWISE_LANGUAGES = new Set([
  'en', 'de', 'cs', 'es', 'fr', 'it', 'nl', 'pl', 'sv',
  'zh', 'zh-hant', 'da', 'tr', 'hi', 'ar', 'pt', 'ko',
]);
const PLANT_DETAILS =
  'common_names,url,description,images,taxonomy,watering,edible_parts,propagation_methods,synonyms,gbif_id,toxicity,best_watering,best_light_condition,best_soil_type,common_uses,cultural_significance';
const WATERING_LABELS = { 1: 'Low (prefers dry soil)', 2: 'Medium', 3: 'High (prefers moist soil)' };

function kindwiseResultLanguage(language) {
  // Espelha api/_lib/kindwise.js: codigo desconhecido ou com caixa diferente
  // segue em ingles, entao a proveniencia nao pode afirmar outro idioma.
  const value = typeof language === 'string' ? language : '';
  return KINDWISE_LANGUAGES.has(value) ? value : 'en';
}

// Plant.id returns the same response shape for plants and trees (trees are just
// part of its 35,000+ species catalogue), so both categories share this mapper.
function mapPlantLike(data, category, emptyOverview, language) {
  const isPlant = vendorProbability(data?.result?.is_plant?.probability);
  const suggestions = data?.result?.classification?.suggestions;
  const top = suggestions?.[0];

  if (!top) return { notFound: true, isPlant };

  const details = top.details || {};
  const vendorNames = mapVendorNames(details, top.name);
  const description = descriptionEvidence(details.description);
  const watering = details.watering;
  const waterLabels = watering
    ? [watering.min, watering.max]
        .filter((v) => v != null)
        .map((v) => WATERING_LABELS[v] || v)
        .filter((v, i, arr) => arr.indexOf(v) === i)
    : [];

  const entity = {
    category,
    sourceProvider: 'plant.id',
    resultLanguage: kindwiseResultLanguage(language),
    identityV1: buildIdentityV1({
      category,
      provider: 'plant.id',
      providerTaxonId: top.id,
      providerLabel: top.name,
      providerTaxonIdSource: 'result.classification.suggestions[].id',
      providerLabelSource: 'result.classification.suggestions[].name',
      scientificName: top.name,
      scientificNameSource: 'result.classification.suggestions[].name',
      score: top.probability,
      scoreSource: 'result.classification.suggestions[].probability',
      subjectScore: isPlant,
      subjectScoreSource: 'result.is_plant.probability',
      gbifKey: details.gbif_id,
      gbifKeySource: 'result.classification.suggestions[].details.gbif_id',
    }),
    id: top.id ? String(top.id) : top.name,
    name: vendorNames.name,
    scientific: top.name,
    confidence: probabilityPercent(top.probability),
    subjectProbability: isPlant,
    commonNames: vendorNames.commonNames,
    synonyms: vendorNames.synonyms,
    gbifId: details.gbif_id ?? null,
    overview: description.overview || emptyOverview,
    overviewCitation: description.overviewCitation,
    overviewLicense: description.overviewLicense,
    overviewLicenseUrl: description.overviewLicenseUrl,
    // Raw taxonomy for the type layer (cacto rega diferente de frutifera -
    // dono, 20/08): family/order feed the curated family->group table on the
    // client; never shown raw.
    family: details.taxonomy?.family || null,
    ord: details.taxonomy?.order || null,
    water: waterLabels.length ? waterLabels.join(' to ') : null,
    edibleParts: details.edible_parts?.length ? details.edible_parts.join(', ') : null,
    propagationMethods: details.propagation_methods?.length
      ? details.propagation_methods.join(', ')
      : null,
    toxicity: details.toxicity || null,
    bestWatering: details.best_watering || null,
    bestLightCondition: details.best_light_condition || null,
    bestSoilType: details.best_soil_type || null,
    commonUses: details.common_uses || null,
    culturalSignificance: details.cultural_significance || null,
    url: details.url || null,
    alternatives: mapAlternatives(suggestions),
    similarImages: mapSimilarImages(top),
  };

  return { entity, isPlant };
}

const CATEGORIES = {
  plant: {
    errorMessage: 'Something went wrong identifying this plant. Please try again.',
    async run({ res, image, images, language, latitude, longitude, datetime }) {
      const data = await kindwiseIdentify({
        latitude,
        longitude,
        datetime,
        res,
        host: PLANT_HOST,
        apiKeyEnv: 'PLANT_ID_API_KEY',
        details: PLANT_DETAILS,
        image,
        images,
        language,
      });
      if (!data) return null;
      return mapPlantLike(data, 'plant', null, language);
    },
  },

  tree: {
    errorMessage: 'Something went wrong identifying this tree. Please try again.',
    async run({ res, image, images, language, latitude, longitude, datetime }) {
      // Same host/model/key as `plant` on purpose - Plant.id's catalogue already
      // covers trees & shrubs, so no new vendor was needed. Trees are tracked as
      // their own category only so they get their own tab, their own free-use
      // entitlement bucket, and their own detail-screen identity.
      const data = await kindwiseIdentify({
        latitude,
        longitude,
        datetime,
        res,
        host: PLANT_HOST,
        apiKeyEnv: 'PLANT_ID_API_KEY',
        details: PLANT_DETAILS,
        image,
        images,
        language,
      });
      if (!data) return null;
      return mapPlantLike(data, 'tree', null, language);
    },
  },

  insect: {
    errorMessage: 'Something went wrong identifying this insect. Please try again.',
    async run({ res, image, images, language, latitude, longitude, datetime }) {
      const data = await kindwiseIdentify({
        latitude,
        longitude,
        datetime,
        res,
        host: 'https://insect.kindwise.com/api/v1',
        apiKeyEnv: 'INSECT_ID_API_KEY',
        details: 'common_names,url,description,images,taxonomy,synonyms,gbif_id,red_list,danger,danger_description,role',
        image,
        images,
        language,
      });
      if (!data) return null;

      const isInsect = vendorProbability(data?.result?.is_insect?.probability);
      const suggestions = data?.result?.classification?.suggestions;
      const top = suggestions?.[0];
      if (!top) return { notFound: true, isInsect };

      const details = top.details || {};
      const vendorNames = mapVendorNames(details, top.name);
      const description = descriptionEvidence(details.description);
      return {
        entity: {
          category: 'insect',
          sourceProvider: 'insect.id',
          resultLanguage: kindwiseResultLanguage(language),
          identityV1: buildIdentityV1({
            category: 'insect',
            provider: 'insect.id',
            providerTaxonId: top.id,
            providerLabel: top.name,
            providerTaxonIdSource: 'result.classification.suggestions[].id',
            providerLabelSource: 'result.classification.suggestions[].name',
            scientificName: top.name,
            scientificNameSource: 'result.classification.suggestions[].name',
            score: top.probability,
            scoreSource: 'result.classification.suggestions[].probability',
            subjectScore: isInsect,
            subjectScoreSource: 'result.is_insect.probability',
            gbifKey: details.gbif_id,
            gbifKeySource: 'result.classification.suggestions[].details.gbif_id',
          }),
          id: top.id ? String(top.id) : top.name,
          name: vendorNames.name,
          scientific: top.name,
          confidence: probabilityPercent(top.probability),
          subjectProbability: isInsect,
          commonNames: vendorNames.commonNames,
          synonyms: vendorNames.synonyms,
          gbifId: details.gbif_id ?? null,
          overview: description.overview,
          overviewCitation: description.overviewCitation,
          overviewLicense: description.overviewLicense,
          overviewLicenseUrl: description.overviewLicenseUrl,
          // Taxonomia crua para a camada por TIPO (grupo por familia/ordem).
          // Classe e filo separam inseto, aracnideo, gastropode e anelideo na
          // arte didatica; sem eles a tela ensinava antena e asa para aranha.
          taxonClass: details.taxonomy?.class || null,
          taxonPhylum: details.taxonomy?.phylum || null,
          family: details.taxonomy?.family || null,
          ord: details.taxonomy?.order || null,
          danger: details.danger?.length ? details.danger : null,
          dangerDescription: details.danger_description || null,
          role: details.role?.length ? details.role : null,
          redList: details.red_list || null,
          url: details.url || null,
          alternatives: mapAlternatives(suggestions),
          similarImages: mapSimilarImages(top),
        },
        isInsect,
      };
    },
  },

  mushroom: {
    errorMessage: 'Something went wrong identifying this mushroom. Please try again.',
    async run({ res, image, images, language, latitude, longitude, datetime }) {
      const data = await kindwiseIdentify({
        latitude,
        longitude,
        datetime,
        res,
        host: 'https://mushroom.kindwise.com/api/v1',
        apiKeyEnv: 'MUSHROOM_ID_API_KEY',
        details: 'common_names,url,description,images,taxonomy,synonyms,gbif_id,edibility,psychoactive,look_alike',
        image,
        images,
        language,
      });
      if (!data) return null;

      const isMushroom = vendorProbability(data?.result?.is_mushroom?.probability);
      const suggestions = data?.result?.classification?.suggestions;
      const top = suggestions?.[0];
      if (!top) return { notFound: true, isMushroom };

      const details = top.details || {};
      const vendorNames = mapVendorNames(details, top.name);
      const description = descriptionEvidence(details.description);
      const lookAlikeDetails = Array.isArray(details.look_alike)
        ? details.look_alike
            .filter((lookAlike) => lookAlike && typeof lookAlike === 'object')
            .map((lookAlike) => ({ ...lookAlike }))
        : [];
      return {
        entity: {
          category: 'mushroom',
          sourceProvider: 'mushroom.id',
          resultLanguage: kindwiseResultLanguage(language),
          identityV1: buildIdentityV1({
            category: 'mushroom',
            provider: 'mushroom.id',
            providerTaxonId: top.id,
            providerLabel: top.name,
            providerTaxonIdSource: 'result.classification.suggestions[].id',
            providerLabelSource: 'result.classification.suggestions[].name',
            scientificName: top.name,
            scientificNameSource: 'result.classification.suggestions[].name',
            score: top.probability,
            scoreSource: 'result.classification.suggestions[].probability',
            subjectScore: isMushroom,
            subjectScoreSource: 'result.is_mushroom.probability',
            gbifKey: details.gbif_id,
            gbifKeySource: 'result.classification.suggestions[].details.gbif_id',
          }),
          id: top.id ? String(top.id) : top.name,
          name: vendorNames.name,
          scientific: top.name,
          confidence: probabilityPercent(top.probability),
          subjectProbability: isMushroom,
          commonNames: vendorNames.commonNames,
          synonyms: vendorNames.synonyms,
          gbifId: details.gbif_id ?? null,
          overview: description.overview,
          overviewCitation: description.overviewCitation,
          overviewLicense: description.overviewLicense,
          overviewLicenseUrl: description.overviewLicenseUrl,
          // Taxonomia crua para a camada por TIPO (grupo por familia/ordem).
          family: details.taxonomy?.family || null,
          ord: details.taxonomy?.order || null,
          edibility: details.edibility || null,
          psychoactive: typeof details.psychoactive === 'boolean' ? details.psychoactive : null,
          lookAlike: details.look_alike?.length
            ? details.look_alike.map((la) => la.name).filter(Boolean)
            : null,
          lookAlikeDetails: lookAlikeDetails.length ? lookAlikeDetails : null,
          url: details.url || null,
          alternatives: mapAlternatives(suggestions),
          similarImages: mapSimilarImages(top),
        },
        isMushroom,
      };
    },
  },

  crop: {
    errorMessage: 'Something went wrong analyzing this crop. Please try again.',
    async run({ res, image, images, language, latitude, longitude, datetime }) {
      const data = await kindwiseIdentify({
        latitude,
        longitude,
        datetime,
        res,
        host: 'https://crop.kindwise.com/api/v1',
        apiKeyEnv: 'CROP_HEALTH_API_KEY',
        details:
          'common_names,images,taxonomy,gbif_id,wiki_url,wiki_description,description,treatment,symptoms,severity,spreading,type,eppo_code,eppo_regulation_status',
        image,
        images,
        language,
      });
      if (!data) return null;

      const topCrop = data?.result?.crop?.suggestions?.[0];
      // A healthy plant comes back as a "disease" literally named healthy, and
      // the client then drew a report about nothing - the word repeated as
      // title and italic scientific name, next to a raw "Abiotic" pill
      // (auditoria de diagramacao 20/08). Dropped HERE because this is the last
      // point where the name is still the vendor's English (translateEntity
      // runs after) - and dropping it means the screen falls into the healthy
      // card it already has for `disease: null`.
      //
      // Filtrar a lista PROMOVIA a sugestao seguinte: o vendor dizia "sadia" e
      // a planta recebia o laudo do palpite 2, com nome de doenca, gravidade
      // e tratamento. Sadia agora quer dizer NENHUMA doenca - e o palpite
      // descartado e sempre o do topo, o unico que o vendor esta afirmando.
      const diseaseTop = data?.result?.disease?.suggestions?.[0];
      const topDisease = /^healthy\b/i.test((diseaseTop?.name || '').trim())
        ? null
        : diseaseTop;
      if (!topCrop && !topDisease) return { notFound: true };

      const diseaseDetails = topDisease?.details || {};
      const cropDetails = topCrop?.details || {};
      const cropDescription = descriptionEvidence(
        cropDetails.description,
        cropDetails.wiki_description
      );
      const diseaseDescription = descriptionEvidence(
        diseaseDetails.description,
        diseaseDetails.wiki_description
      );
      const cropName = cropDetails.common_names?.[0] || topCrop?.name || 'Unknown crop';
      const otherCropNames = (cropDetails.common_names || []).filter(
        (name) => typeof name === 'string' && name.toLowerCase() !== cropName.toLowerCase()
      );

      return {
        entity: {
          category: 'crop',
          sourceProvider: 'crop.health',
          resultLanguage: kindwiseResultLanguage(language),
          identityV1: buildIdentityV1({
            category: 'crop',
            provider: 'crop.health',
            providerTaxonId: topCrop?.id,
            providerLabel: topCrop?.name,
            providerTaxonIdSource: 'result.crop.suggestions[].id',
            providerLabelSource: 'result.crop.suggestions[].name',
            scientificName: topCrop?.scientific_name,
            scientificNameSource: 'result.crop.suggestions[].scientific_name',
            score: topCrop?.probability,
            scoreSource: 'result.crop.suggestions[].probability',
            gbifKey: cropDetails.gbif_id,
            gbifKeySource: 'result.crop.suggestions[].details.gbif_id',
          }),
          id: topCrop?.id ? String(topCrop.id) : topDisease?.id ? String(topDisease.id) : 'unknown',
          name: cropName,
          scientific: topCrop?.scientific_name || null,
          confidence: probabilityPercent(topCrop?.probability),
          gbifId: cropDetails.gbif_id ?? null,
          overview: cropDescription.overview,
          overviewCitation: cropDescription.overviewCitation,
          overviewLicense: cropDescription.overviewLicense,
          overviewLicenseUrl: cropDescription.overviewLicenseUrl,
          commonNames: otherCropNames.length
            ? otherCropNames.join(', ')
            : null,
          url: cropDetails.wiki_url || cropDetails.url || null,
          alternatives: mapAlternatives(data?.result?.crop?.suggestions),
          similarImages: mapSimilarImages(topCrop),
          // Diferencia um resultado realmente analisado pelo Crop Health de
          // uma ficha aberta pelo catalogo. Sem esta marca, `disease: null`
          // virava "nenhuma doenca detectada" mesmo sem foto enviada.
          healthAssessed: true,
          // Taxonomia crua para a camada por TIPO. Sem ela a tabela de lavoura
          // do speciesGroup (CROP_FAMILY: grainCrop/vegCrop) nunca era
          // alcancada - dois grupos curados existiam sem nenhum caminho ate
          // eles. E a familia da PLANTA, nunca a do patogeno: o manual e sobre
          // o que esta plantado. Null quando o vendor nao manda taxonomia, e
          // ai o cartao de grupo simplesmente nao entra.
          family: cropDetails.taxonomy?.family || null,
          ord: cropDetails.taxonomy?.order || null,
          disease: topDisease
            ? {
                name: topDisease.name,
                scientific: topDisease.scientific_name || null,
                confidence: probabilityPercent(topDisease.probability),
                commonNames: joinedNames(diseaseDetails.common_names),
                gbifId: diseaseDetails.gbif_id ?? null,
                eppoCode: diseaseDetails.eppo_code || null,
                eppoRegulationStatus: diseaseDetails.eppo_regulation_status || null,
                type: diseaseDetails.type || null,
                overview: diseaseDescription.overview,
                overviewCitation: diseaseDescription.overviewCitation,
                overviewLicense: diseaseDescription.overviewLicense,
                overviewLicenseUrl: diseaseDescription.overviewLicenseUrl,
                severity: diseaseDetails.severity || null,
                spreading: diseaseDetails.spreading || null,
                symptoms: diseaseDetails.symptoms
                  ? Object.values(diseaseDetails.symptoms).filter((v) => typeof v === 'string')
                  : null,
                treatment: diseaseDetails.treatment || null,
                url: diseaseDetails.wiki_url || null,
                similarImages: mapSimilarImages(topDisease),
              }
            : null,
        },
      };
    },
  },

  fish: {
    errorMessage: 'Something went wrong identifying this fish. Please try again.',
    async run({ res, image, images, language }) {
      // Fishial.AI ignores the `language` param entirely - it has no localised
      // content, everything comes back in English (see the description note
      // below). Not forwarding it avoids implying otherwise.
      const data = await fishialIdentify({ res, image, images });
      if (!data) return null;

      const top = data?.results?.[0];
      // Fishial ranks candidates too - same reasoning as the Kindwise
      // categories, the runners-up are worth showing rather than discarding.
      const speciesList = top?.species;
      const species = speciesList?.[0];
      if (!species) return { notFound: true };

      // The richest part of the response is `fishangler-data`: a full species
      // record (title, common names, synonyms, genus/species, a reference photo
      // and a real description). Verified live 2026-07-28 - this is why the fish
      // category needs no curated content database the way Rocks would.
      const fa = species['fishangler-data'] || {};
      // Fishial writes only in English, so its description is translated into
      // the reader's language - but ONLY when it is prose, because only prose
      // leads the screen.
      //
      // For most species Fishial sends a diagnostic key ("Dorsal spines
      // (total): 9-10; ...") which the detail screen puts in a secondary card
      // below the fold. Paying to translate that on every identification is
      // paying for text most people never scroll to; it gets a "Translate"
      // button instead (api/translate.js).
      //
      // Awaited, but bounded: translateVendorText resolves null within 12s
      // whatever happens (no key, timeout, provider error), and the caller then
      // keeps the English. A translation failure must never cost someone the
      // identification they just spent a scan on.
      // Decided ONCE, here, on the English original - and sent to the client.
      //
      // The client used to re-run looksLikeProse on whatever text it had, which
      // by then was the TRANSLATION. The detector counts sentences with
      // /[.!?](\s+[A-Z]|$)/ and splits words on whitespace: Korean and Arabic
      // sentences end with a period followed by a non-Latin letter, Chinese uses
      // 。 and has no spaces at all, Hindi ends with ।. Verified on faithful
      // translations of the same paragraph: en and pt read as prose, ko, zh, ar
      // and hi all read as "not prose".
      //
      // So for a Korean reader the translation just paid for was demoted below
      // the fold, English could lead the Overview card, and the reader was
      // offered a SECOND paid translation of it. The drift test between the two
      // copies could never catch this - the copies are byte-identical; the
      // divergence is in what they are fed.
      const vendorIsProse = looksLikeProse(fa.description);
      const translated = vendorIsProse
        ? await translateVendorText(fa.description, language)
        : null;

      return {
        entity: {
          category: 'fish',
          sourceProvider: 'fishial',
          resultLanguage: translated ? normaliseLanguage(language) : 'en',
          identityV1: buildIdentityV1({
            category: 'fish',
            provider: 'fishial',
            providerTaxonId: species['species-id'],
            providerLabel: species.name,
            providerTaxonIdSource: 'results[].species[].species-id',
            providerLabelSource: 'results[].species[].name',
            scientificName: fa.scientificName,
            scientificNameSource: 'results[].species[].fishangler-data.scientificName',
            score: species.accuracy,
            scoreSource: 'results[].species[].accuracy',
            subjectScore: top?.['detection-score'],
            subjectScoreSource: 'results[].detection-score',
          }),
          id: species['species-id'] ? String(species['species-id']) : species.name,
          name: fa.title || species.name,
          // `species.name` e rotulo de exibicao, nao um campo cientifico
          // documentado. Sem fishangler-data.scientificName a identidade exata
          // fica ausente em vez de transformar nome popular em taxon.
          scientific: fa.scientificName || null,
          confidence: probabilityPercent(species.accuracy),
          // Fishial's description is English-only and written in ichthyology
          // register (fin ray counts, vertebrae, diagnostic characters). It is
          // real content, not a placeholder, but it is NOT translated by the
          // vendor for any of the app's other 16 languages.
          overview: translated || fa.description || null,
          // The untranslated original, so the detail screen can offer it as the
          // technical section. Null when there was nothing to translate, or when
          // the translation is the original (English reader) - two identical
          // paragraphs help nobody.
          overviewOriginal: translated ? fa.description : null,
          // Whether `overview` is readable prose or a diagnostic key, judged on
          // the English source. The client cannot re-derive this from a
          // translation - see the comment above.
          overviewIsProse: vendorIsProse,
          // Taxonomia crua para a camada por TIPO. speciesGroup tem 45 familias
          // de agua doce e 63 marinhas mapeadas, mais os proprios grupos de
          // ordem ("ordem antes de familia" para a fauna neotropical) - e o
          // peixe nunca mandava nem uma nem outra, entao esses dois grupos
          // curados eram inalcancaveis. O bloco fishangler-data ja entrega
          // genus/species; family/order sao lidos do mesmo bloco e ficam null
          // quando ele nao os traz, que e o comportamento de hoje.
          family: fa.family || null,
          ord: fa.order || null,
          commonNames: fa.commonNames?.length ? fa.commonNames.join(', ') : null,
          synonyms: fa.scientificNames?.length ? fa.scientificNames.join(', ') : null,
          referencePhoto: fa.photo?.mediaUri || null,
          detectionScore:
            probabilityPercent(top?.['detection-score']),
          url: null,
          alternatives:
            Array.isArray(speciesList) && speciesList.length > 1
              ? speciesList.slice(1, 3).map((s) => ({
                  id: s['species-id'] ? String(s['species-id']) : s.name,
                  name: s['fishangler-data']?.title || s.name,
                  scientific: s['fishangler-data']?.scientificName || null,
                  confidence: probabilityPercent(s.accuracy),
                }))
              : null,
          // Fishial supplies one reference photo per species rather than a set,
          // so reuse the same shape the Kindwise path produces.
          similarImages: fa.photo?.mediaUri
            ? [{ url: fa.photo.mediaUri, full: fa.photo.mediaUri, similarity: null, citation: null }]
            : null,
        },
      };
    },
  },

  sound: {
    errorMessage: 'Something went wrong identifying this sound. Please try again.',
    async run({ res, audio, sampleRate }) {
      const data = await perchIdentify({ res, audio, sampleRate });
      if (!data) return null;

      // The host returns a ranked list already mapped to species names - see
      // docs/perch-host/app.py for the contract.
      const list = Array.isArray(data?.predictions) ? data.predictions : [];
      const top = list[0];
      if (!top || !top.label) return { notFound: true };

      // `confident: false` means the top logit was no higher than what white
      // noise scores on this model (measured: 7.5, vs 12.2+ for every correct
      // answer in docs/perch-host/bench.py). Naming a species from that would be
      // inventing one, so it is reported as "nothing recognisable".
      //
      // The comparison is `!== true`, not `=== false`: an older or rolled-back
      // host that does not send the field at all would otherwise skip this guard
      // entirely and let every noise recording through as a species. Absent
      // evidence of confidence is not confidence.
      if (data.confident !== true) return { notFound: true };

      // The host answers with the raw class index ("4821") when its label CSVs
      // could not be loaded - a deliberate degraded mode rather than a lie. But a
      // number is not a species: accepted here it would render a card titled
      // "4821" and send the app off to look up "4821" on Wikipedia. A real Perch
      // label is either a binomial or an FSD50K event name, never all digits.
      if (!top.scientific_name && /^\d+$/.test(String(top.label).trim())) {
        console.error('identify(sound): host returned a class index, labels not loaded');
        return { notFound: true };
      }

      // 198 of Perch's 14,795 classes come from FSD50K and are sound EVENTS, not
      // species: "Car", "Applause", "Speech". Recording traffic and being told
      // you found a bird is worse than being told nothing, so these are refused
      // with their own reason - the app then says "that is not an animal sound"
      // instead of a generic failure.
      if (top.group === 'noise') return { notFound: true, reason: 'notWildlife' };

      return {
        entity: {
          category: 'sound',
          sourceProvider: 'perch',
          resultLanguage: 'en',
          identityV1: buildIdentityV1({
            category: 'sound',
            provider: 'perch',
            providerTaxonId: top.code,
            providerLabel: top.label,
            providerTaxonIdSource: 'predictions[].code',
            providerLabelSource: 'predictions[].label',
            scientificName: top.scientific_name,
            scientificNameSource: 'predictions[].scientific_name',
            score: top.score,
            scoreSource: 'predictions[].score',
          }),
          id: top.code ? String(top.code) : top.label,
          // Perch's label list has no common-name column, so this is the
          // binomial. The client swaps in the Wikipedia page title, which IS the
          // common name in the user's own language - one lookup it already makes
          // for the photo, so no extra call and no translation table.
          name: top.common_name || top.label,
          scientific: top.scientific_name || null,
          confidence: probabilityPercent(top.score),
          // Perch classifies more than birds: frogs, crickets, grasshoppers and
          // mammals are in the same label space. Passing the group through lets
          // the UI say "frog" instead of mislabelling everything a bird.
          group: top.group || null,
          // Deliberately null, not an English placeholder: the client fills this
          // from Wikipedia's summary in the user's own language, and a hardcoded
          // string here would have shown in English to all 17 locales.
          overview: null,
          origin: null,
          url: null,
          alternatives: mapSoundAlternatives(list),
          similarImages: null,
        },
      };
    },
  },

  bird: {
    errorMessage: 'Something went wrong identifying this bird. Please try again.',
    async run({ res, image, images }) {
      // BioCLIP 2 usa uma lista AviList mundial no host proprio. A integracao
      // fica opt-in: sem endpoint (ou se o host falhar), o Nyckel existente
      // continua sendo o caminho de recuperacao e nenhuma foto e perdida.
      if (isBioClipConfigured()) {
        try {
          const result = await bioclipBirdIdentify({ image, images });
          const top = result?.prediction;
          const exact = result?.identityEvidence?.exact === true;
          // Um top-1 abaixo dos limiares ou sem confirmacao GBIF e apenas um
          // candidato zero-shot. Ele nao substitui o resultado atual nem vira
          // nome principal; seguimos para o fallback Nyckel.
          if (top && exact) {
            const identityV1 = buildIdentityV1({
              category: 'bird',
              provider: 'bioclip-2',
              providerTaxonId: top.birdnetId || String(top.gbifKey),
              providerLabel: top.commonName || top.scientificName,
              providerTaxonIdSource: top.birdnetId
                ? 'birdnet-taxonomy.birdnet_id'
                : 'birdnet-taxonomy.gbif_id',
              providerLabelSource: top.commonName
                ? 'birdnet-taxonomy.common_name'
                : 'birdnet-taxonomy.scientific_name',
              scientificName: top.scientificName,
              scientificNameSource:
                'birdnet-taxonomy.AviList.scientific_name+gbif.species.match',
              gbifKey: top.gbifKey,
              gbifKeySource: 'gbif.species.match.usageKey',
              exactEvidence: true,
              exactEvidenceSource: result.identityEvidence?.source,
              similarity: top.score,
              similaritySource: 'predictions[].score:cosine_similarity',
              topMargin: result.topMargin,
              topMarginSource: 'predictions[0].score-predictions[1].score',
              similarityThreshold: result.thresholds?.minSimilarity,
              marginThreshold: result.thresholds?.minMargin,
              thresholdSetId: result.thresholds?.id,
            });
            if (identityV1.status !== 'exact') {
              throw Object.assign(new Error('BioCLIP identity evidence did not close.'), {
                code: 'identity_not_exact',
              });
            }
            return {
              entity: {
                category: 'bird',
                sourceProvider: 'bioclip-2',
                resultLanguage: 'en',
                identityV1,
                id: top.birdnetId || String(top.gbifKey),
                name: top.commonName || top.scientificName,
                scientific: top.scientificName,
                gbifId: top.gbifKey,
                // Similaridade zero-shot nao e probabilidade calibrada. Ela
                // permanece na proveniencia, nunca no badge de confianca.
                confidence: null,
                modelSimilarity: top.score,
                modelTopMargin: result.topMargin,
                modelRevision: result.modelRevision,
                taxonomyVersion: result.taxonomy?.version || null,
                overview: null,
                origin: null,
                url: null,
                alternatives: result.alternatives?.slice(0, 2).map((candidate) => ({
                  id: candidate.birdnetId || String(candidate.gbifKey),
                  name: candidate.commonName || candidate.scientificName,
                  scientific: candidate.scientificName,
                  confidence: null,
                  similarity: candidate.score,
                })) || null,
                similarImages: null,
              },
            };
          }
        } catch (error) {
          // O erro nao inclui token nem corpo. O fallback preserva o servico
          // atual durante reinicio, cold start ou manutencao do host pesado.
          console.error(`identify(bird): BioCLIP fallback (${error?.code || 'unknown'})`);
        }
      }

      const data = await nyckelIdentify({
        res,
        image,
        images,
        functionId: process.env.NYCKEL_BIRD_FUNCTION_ID?.trim(),
      });
      if (!data) return null;

      // Nyckel returns a flat prediction: { labelName, confidence, labelId }.
      if (!data.labelName) return { notFound: true };

      // O modelo entrega apenas o nome comum ingles. Ele so vira binomio
      // quando esse rotulo casa com um unico taxon Aves no Wikidata e o GBIF
      // confirma nome, classe, nivel e status aceito sem busca aproximada.
      let resolvedTaxon = null;
      try {
        resolvedTaxon = await resolveExactBirdLabel(data.labelName);
      } catch (error) {
        // Enriquecimento fora do ar nao invalida a identificacao visual.
      }

      return {
        entity: {
          category: 'bird',
          sourceProvider: 'nyckel',
          resultLanguage: 'en',
          identityV1: buildIdentityV1({
            category: 'bird',
            provider: 'nyckel',
            providerTaxonId: data.labelId,
            providerLabel: data.labelName,
            providerTaxonIdSource: 'labelId',
            providerLabelSource: 'labelName',
            scientificName: resolvedTaxon?.scientific,
            scientificNameSource: resolvedTaxon
              ? 'wikidata.P225+gbif.species.match'
              : null,
            score: data.confidence,
            scoreSource: 'confidence',
            gbifKey: resolvedTaxon?.gbifKey,
            gbifKeySource: resolvedTaxon ? 'gbif.species.match.usageKey' : null,
          }),
          id: data.labelId ? String(data.labelId) : data.labelName,
          name: data.labelName,
          scientific: resolvedTaxon?.scientific || null,
          gbifId: resolvedTaxon?.gbifKey || null,
          confidence: probabilityPercent(data.confidence),
          // Nyckel sends no description at all. null, not an English sentence:
          // the screen falls back to Wikipedia in the reader language, and a
          // placeholder here would also be SAVED into their collection.
          overview: null,
          origin: null,
          url: null,
        },
      };
    },
  },
};

// A category only exists if it can actually work. Bird accepts the Nyckel
// atual ou o BioCLIP com calibracao completa; sem nenhum deles, a categoria
// responde 400 em vez de publicar uma aba que sempre falha.
function isEnabled(category) {
  if (category === 'bird') {
    return isBioClipConfigured() || Boolean(process.env.NYCKEL_BIRD_FUNCTION_ID?.trim());
  }
  // Sound needs a Perch inference host (the 390 MB model cannot live here).
  if (category === 'sound') return Boolean(process.env.PERCH_ENDPOINT?.trim());
  return true;
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  // Accept the category from the query string (how vercel.json's rewrite of the
  // legacy /api/identify-<category> URLs arrives) or from the request body (how
  // the current client sends it).
  const category = String(req.query?.category || req.body?.category || '').trim();
  const config = CATEGORIES[category];

  if (!config || !isEnabled(category)) {
    res.status(400).json({ error: 'Unknown identification category.' });
    return;
  }

  // Shared across every category (same 'identify' scope) since deviceId is
  // self-issued and free to mint fresh per request - IP is the only signal that
  // isn't trivially reset by a caller trying to bypass the per-category free-use
  // limit at scale. See api/_lib/rateLimit.js.
  const rateLimitOk = await checkRateLimit(req, res, {
    scope: 'identify',
    limit: 30,
    windowSeconds: 600,
  });
  if (!rateLimitOk) return;

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  try {
    const entitlement = await checkEntitlement(res, deviceId, category);
    if (!entitlement.allowed) return;

    const result = await config.run({
      res,
      image: req.body?.image,
      // Multi-angle: the client may send up to 3 photos of the same specimen.
      images: req.body?.images,
      // Sound category only: base64 float32 PCM plus its sample rate.
      audio: req.body?.audio,
      sampleRate: req.body?.sampleRate,
      language: req.body?.language,
      // Roughly where and when the photo was taken. Optional and unvalidated
      // here on purpose - api/_lib/kindwise.js drops anything malformed rather
      // than letting a bad coordinate fail an otherwise good identification.
      // Only the Kindwise categories use them; the other vendors ignore them.
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      datetime: req.body?.datetime,
    });
    // A null result means the vendor helper already wrote an error response.
    if (!result) return;

    // English-only vendor fields (care, toxicity, uses, disease text) get
    // translated server-side in one Haiku call - the owner caught the result
    // screen half in English with the UI in Portuguese. Fails soft: on any
    // error the English original ships. See api/_lib/translateEntity.js.
    if (result.entity) {
      await translateEntity(result.entity, req.body?.language);
    }

    // Only a real identification costs a free use.
    //
    // A notFound result is the vendor saying "there is nothing here" - a silent
    // recording, a photo of a wall, a car engine. Charging for it meant someone's
    // single free sound scan was spent on their first failed attempt, and the
    // second try - the one that would have worked - hit the paywall. That reads
    // as the app cheating them, and it is the worst possible first impression of
    // a category.
    //
    // The vendor call was still made, so this does cost the owner an API credit.
    // That is the right side to absorb it: the alternative is charging a user for
    // an answer they did not get.
    if (!entitlement.subscribed && !result.notFound) {
      await recordUsage(deviceId, category);
    }

    res.status(200).json(result);
  } catch (err) {
    if (!res.headersSent) {
      // `reason` is what the client actually shows - it maps to a translated
      // string. `error` stays for the logs and for anyone calling the API
      // directly, but a user must never be shown this English sentence: the app
      // ships in 17 languages and already has "Falha na identificação / Tente
      // novamente" written in all of them.
      res.status(500).json({ error: config.errorMessage, reason: 'identifyFailed' });
    }
  }
};
