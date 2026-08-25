const WIKI_HOST_BY_LANGUAGE = Object.freeze({
  en: 'en', pt: 'pt', es: 'es', de: 'de', fr: 'fr', it: 'it', nl: 'nl',
  pl: 'pl', sv: 'sv', da: 'da', cs: 'cs', tr: 'tr', ko: 'ko', zh: 'zh',
  'zh-hant': 'zh', hi: 'hi', ar: 'ar',
});

const KINGDOM_BY_CATEGORY = Object.freeze({
  plant: 'Plantae',
  tree: 'Plantae',
  crop: 'Plantae',
  mushroom: 'Fungi',
  sound: 'Animalia',
});

const TERMS = Object.freeze({
  habitat: [
    'habitat', 'habitat e distribuicao', 'distribution', 'occurrence', 'range',
    'distribuicao', 'ocorrencia', 'repartition', 'verbreitung', 'lebensraum',
    'distribucion', 'habitat y distribucion', 'distribuzione', 'verspreiding',
    'wystepowanie', 'zasieg', 'vyskyt', 'rozsireni', 'dagilim', 'yasam alani',
    '서식', '분포', '栖息', '棲息', '分布', 'आवास', 'वितरण', 'موطن', 'انتشار',
  ],
  feeding: [
    'feeding', 'food', 'diet', 'alimentacao', 'dieta', 'regime alimentaire',
    'alimentation', 'nahrung', 'ernahrung', 'alimentazione', 'voeding', 'pokarm',
    'odzywianie', 'potrava', 'vyziva', 'beslenme', '먹이', '食性', '食物',
    'आहार', 'غذاء', 'تغذية',
  ],
  reproduction: [
    'reproduction', 'breeding', 'nesting', 'nidification', 'reproducao',
    'fortpflanzung', 'reproduccion', 'riproduzione', 'voortplanting',
    'rozmnazanie', 'rozmnozovani', 'ureme', '번식', '繁殖', '生殖', 'प्रजनन',
    'تكاثر',
  ],
  lifeCycle: [
    'life cycle', 'lifecycle', 'development', 'ciclo de vida', 'desenvolvimento',
    'cycle de vie', 'lebenszyklus', 'entwicklung', 'ciclo vitale', 'levenscyclus',
    'cykl zyciowy', 'zivotni cyklus', 'yasam dongusu', '생활사', '生命周期',
    '生活史', 'जीवन चक्र', 'دورة الحياة',
  ],
  ecology: [
    'ecology', 'biology and ecology', 'ecology and biology', 'ecologia', 'biologia e ecologia',
    'ecologie', 'okologie', 'ecologia e biologia', 'ecologie en gedrag',
    'ekologia', 'ekologie', 'ekoloji', '생태', '生态', '生態', 'पारिस्थितिकी',
    'بيئة',
  ],
  behavior: [
    'behavior', 'behaviour', 'comportamento', 'comportement', 'verhalten',
    'gedrag', 'zachowanie', 'chovani', 'davranis', '행동', '行為', '行为',
    'व्यवहार', 'سلوك',
  ],
  vocalization: [
    'vocalization', 'vocalisation', 'song and calls', 'songs and calls', 'song',
    'calls', 'vocalizacao', 'canto', 'chant', 'cri', 'gesang', 'ruf',
    'vocalizzazione', 'zang', 'roep', 'spiew', 'glos', 'zpev', 'hlas', 'otus',
    '울음', '소리', '鸣声', '鳴聲', '歌声', 'ध्वनि', 'आवाज़', 'صوت', 'نداء',
  ],
  migration: [
    'migration', 'migratory', 'migracao', 'migracao e deslocamentos', 'zugverhalten',
    'migracion', 'migrazione', 'migratie', 'migracja', 'migrace', 'goc',
    '이동', '迁徙', '遷徙', 'प्रवास', 'هجرة',
  ],
  conservation: [
    'conservation', 'status and conservation', 'conservacao', 'estatuto de conservacao',
    'schutz', 'gefahrdung', 'conservacion', 'conservazione', 'bescherming',
    'ochrona', 'ochrana', 'koruma', '보전', '保护', '保育', 'संरक्षण', 'حفظ',
  ],
  spores: [
    'spore', 'spores', 'sporulation', 'esporo', 'esporos', 'esporulacao',
    'sporen', 'spore print', 'sporata', 'zarodniki', 'vytrusy', 'sporlar',
    '포자', '孢子', 'बीजाणु', 'أبواغ',
  ],
  substrate: [
    'substrate', 'substrato', 'trophic', 'trophic role', 'saprotroph', 'saprophyte',
    'mycorrhiz', 'substrat', 'trophie', 'saprotr', 'podloze', 'substrat',
    '기질', '균근', '基质', '基質', '菌根', 'सब्सट्रेट', 'ركيزة',
  ],
  flowering: [
    'flowering', 'flowering and fruiting', 'phenology', 'floracao', 'florescimento',
    'frutificacao', 'floraison', 'fructification', 'blute', 'bluhen', 'fioritura',
    'bloei', 'kwitnienie', 'kveteni', 'ciceklenme', '개화', '花期', '开花',
    'फूल', 'إزهار',
  ],
  cultivation: [
    'cultivation', 'propagation', 'growing', 'cultivo', 'cultivacao', 'propagacao',
    'culture', 'anbau', 'kultur', 'coltivazione', 'teelt', 'uprawa', 'pestovani',
    'yetistirme', '재배', '栽培', 'खेती', 'زراعة',
  ],
  uses: [
    'uses', 'human uses', 'economic importance', 'usos', 'utilizacoes',
    'importancia economica', 'utilisation', 'usages', 'verwendung', 'nutzung',
    'utilizzi', 'gebruik', 'zastosowanie', 'vyuziti', 'kullanim', '용도', '用途',
    'उपयोग', 'استخدامات',
  ],
});

const IGNORE_TERMS = Object.freeze([
  'reference', 'references', 'referencias', 'referencias', 'bibliography',
  'bibliografia', 'external links', 'ligacoes externas', 'enlaces externos',
  'liens externes', 'weblinks', 'collegamenti esterni', 'see also', 'ver tambem',
  'gallery', 'galeria', 'taxonomy', 'taxonomia', 'nomenclature', 'nomenclatura',
  'classification', 'classificacao', 'subspecies', 'subespecies', 'synonym',
  'sinonimia', 'commons', 'literature', 'literatura', 'kulturgeschichte',
  'cultural', 'cultura', 'importancia cultural', 'representacoes culturais',
  'popular culture', 'culture populaire', 'cultura popular', 'kultura',
  '각주', '참고 문헌', '参考文献', '參考文獻', '外部链接', '外部連結', 'المراجع',
  'وصلات خارجية', 'सन्दर्भ',
]);

const RULES_BY_CATEGORY = Object.freeze({
  plant: [
    ['phenology', 'flowering'], ['propagation', 'cultivation'], ['uses', 'uses'],
    ['habitat', 'habitat'], ['conservation', 'conservation'],
  ],
  tree: [
    ['phenology', 'flowering'], ['propagation', 'cultivation'], ['uses', 'uses'],
    ['habitat', 'habitat'], ['conservation', 'conservation'],
  ],
  crop: [
    ['phenology', 'flowering'], ['cultivation', 'cultivation'], ['uses', 'uses'], ['habitat', 'habitat'],
    ['conservation', 'conservation'],
  ],
  mushroom: [
    ['reproduction', 'spores'], ['lifeCycle', 'lifeCycle'],
    ['substrate', 'substrate'], ['ecology', 'ecology'], ['habitat', 'habitat'],
    ['conservation', 'conservation'],
  ],
  insect: [
    ['feeding', 'feeding'], ['reproduction', 'reproduction'], ['lifeCycle', 'lifeCycle'],
    ['behavior', 'behavior'], ['ecology', 'ecology'], ['habitat', 'habitat'],
    ['conservation', 'conservation'],
  ],
  fish: [
    ['feeding', 'feeding'], ['reproduction', 'reproduction'], ['lifeCycle', 'lifeCycle'],
    ['behavior', 'behavior'], ['ecology', 'ecology'], ['habitat', 'habitat'],
    ['conservation', 'conservation'],
  ],
  bird: [
    ['vocalization', 'vocalization'], ['migration', 'migration'],
    ['feeding', 'feeding'], ['reproduction', 'reproduction'], ['lifeCycle', 'lifeCycle'],
    ['behavior', 'behavior'], ['ecology', 'ecology'], ['habitat', 'habitat'],
    ['conservation', 'conservation'],
  ],
  sound: [
    ['acousticPattern', 'vocalization'], ['migration', 'migration'],
    ['behavior', 'behavior'], ['ecology', 'ecology'], ['habitat', 'habitat'],
    ['conservation', 'conservation'],
  ],
});

const BODY_PATTERNS = Object.freeze({
  habitat: /(?:\b(?:habitat|occur|distribution|distributed|range|native|found|lives?|inhabits?|floresta|mata|campo|agua|marinho|dulcicola|distribuicao|ocorre|habita|nativ|trouve|repartition|verbreitung|lebensraum|vyskyt|dagilim)\b|서식|분포|栖息|棲息|分布|आवास|वितरण|موطن|انتشار)/iu,
  feeding: /(?:\b(?:diet|feeds?|feeding|food|eats?|prey|nectar|pollen|fruit|seed|plankton|aliment|dieta|come|presas?|frutas?|sementes?|plancton|nahrung|ernahrung|alimentation|voeding|pokarm|potrava|beslen)\w*\b|먹이|食性|食物|आहार|غذاء|تغذية)/iu,
  reproduction: /(?:\b(?:reproduc|breed|breeding|nest|egg|eggs|incubat|spawn|clutch|ovos?|ninho|postura|filhotes?|larvas?|fortpflanz|nidification|riproduzione|voortplant|rozmnaz|ureme)\w*\b|번식|繁殖|生殖|卵|प्रजनन|تكاثر)/iu,
  lifeCycle: /(?:\b(?:life cycle|lifespan|life expectancy|metamorph|instar|pupa|pupae|larval stage|vive ate|anos de vida|ciclo de vida|metamorf|crisali|lebenszyklus|levenscyclus|cykl zyciowy|yasam dongusu)\w*\b|생활사|生命周期|生活史|जीवन चक्र|دورة الحياة)/iu,
  ecology: /(?:\b(?:ecolog|symbios|mutualis|pollinat|predator|parasitoid|parasite|ecosystem|cadeia alimentar|papel ecologico|relacao simbiot|okolog|ekolog)\w*\b|생태|生态|生態|पारिस्थितिकी|بيئة)/iu,
  behavior: /(?:\b(?:behavio|comport|territorial|social|solitary|gregarious|nocturnal|diurnal|crepuscular|verhalten|gedrag|zachowanie|chovani|davranis)\w*\b|행동|行為|行为|व्यवहार|سلوك)/iu,
  vocalization: /(?:\b(?:vocal|song|songs|call|calls|sings?|canto|canta|chamado|som emitido|chant|gesang|ruf|zang|roep|spiew|glos|zpev|hlas|otus)\w*\b|울음|소리|鸣|鳴|歌声|ध्वनि|आवाज़|صوت|نداء)/iu,
  migration: /(?:\b(?:migrat|migracao|migratorio|zugverhalten|migracion|migrazione|migratie|migracja|migrace|goc)\w*\b|이동|迁徙|遷徙|प्रवास|هجرة)/iu,
  conservation: /(?:\b(?:conservation|threatened|endangered|vulnerable|population decline|iucn|lista vermelha|ameac|conservacao|gefahrd|bescherming|ochrona|koruma)\w*\b|보전|保护|保育|संरक्षण|حفظ)/iu,
  substrate: /(?:\b(?:substrat|trophic|saprotroph|saprophyt|mycorrhiz|ectomycorrhiz|decompos|lignicol)\w*\b|기질|균근|基质|基質|菌根|सब्सट्रेट|ركيزة)/iu,
  reproductionFungus: /(?:\b(?:spore|spores|sporulat|esporo|esporos|esporul|sporen|zarodnik|vytrus|sporlar)\w*\b|포자|孢子|बीजाणु|أبواغ)/iu,
  phenology: /(?:\b(?:flowering|fruiting|bloom|phenolog|floracao|florescimento|frutificacao|floraison|fructification|blute|fioritura|bloei|kwitnienie|kveteni|ciceklenme)\w*\b|개화|花期|开花|फूल|إزهار)/iu,
  cultivation: /(?:\b(?:cultivat|cultivo|cultivacao|grown commercially|plantio|colheita|anbau|coltivazione|teelt|uprawa|pestovani|yetistirme)\w*\b|재배|栽培|खेती|زراعة)/iu,
  uses: /(?:\b(?:used as|used for|human use|economic importance|utilizad|usado|usada|consum|importancia economica|verwendung|utilisation|utilizzi|gebruik|zastosowanie|vyuziti|kullanim)\w*\b|용도|用途|उपयोग|استخدام)/iu,
});

function fold(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|quot|apos|nbsp);/gi, ' ')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanHeading(value) {
  if (typeof value !== 'string') return null;
  const heading = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
  if (!heading || heading.length > 120 || /[\u0000-\u001f\u007f]/.test(heading)) return null;
  return heading;
}

function containsFoldedTerm(heading, term) {
  const clean = fold(term);
  if (!clean) return false;
  if (!/^[a-z0-9 ]+$/.test(clean)) return heading.includes(clean);
  return (` ${heading} `).includes(` ${clean} `);
}

function includesTerm(heading, termKey) {
  const terms = TERMS[termKey] || [];
  return terms.some((term) => containsFoldedTerm(heading, term));
}

function ignoredHeading(heading) {
  return IGNORE_TERMS.some((term) => containsFoldedTerm(heading, term));
}

function cleanSectionText(value, maxChars = 1800) {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/^={2,6}.*?={2,6}$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
  if (clean.length < 40 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) return null;
  if (clean.length <= maxChars) return clean;

  const clipped = clean.slice(0, maxChars + 1);
  const end = Math.max(
    clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '),
    clipped.lastIndexOf('。'), clipped.lastIndexOf('！'), clipped.lastIndexOf('？')
  );
  return (end >= Math.floor(maxChars * 0.55) ? clipped.slice(0, end + 1) : clean.slice(0, maxChars))
    .trim();
}

function splitExtract(extract) {
  if (typeof extract !== 'string' || !extract.trim()) return [];
  const marker = /^={2,6}\s*(.*?)\s*={2,6}\s*$/gm;
  const sections = [];
  let match;
  let current = null;
  while ((match = marker.exec(extract)) !== null) {
    if (current) current.body = extract.slice(current.start, match.index);
    const heading = cleanHeading(match[1]);
    current = heading ? { heading, start: marker.lastIndex, body: '' } : null;
    if (current) sections.push(current);
  }
  if (current) current.body = extract.slice(current.start);
  return sections;
}

function sentenceMatches(value, pattern, maxSentences = 3) {
  const sentences = String(value || '').match(/[^.!?。！？]+[.!?。！？]?/gu) || [];
  const selected = sentences
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30 && pattern.test(fold(sentence)))
    .slice(0, maxSentences);
  const joined = selected.join(' ').trim().normalize('NFC');
  return joined.length >= 24 && joined.length <= 900 ? joined : null;
}

function buildWikiSections(category, extract) {
  const rules = RULES_BY_CATEGORY[category] || [];
  const best = new Map();
  const usableSections = [];

  for (const section of splitExtract(extract)) {
    const heading = fold(section.heading);
    if (!heading || ignoredHeading(heading)) continue;
    const text = cleanSectionText(section.body);
    if (!text) continue;
    usableSections.push({ heading: section.heading, text });
    for (const [key, termKey] of rules) {
      if (!includesTerm(heading, termKey)) continue;
      const current = best.get(key);
      if (!current || text.length > current.text.length) {
        best.set(key, { key, heading: section.heading, text });
      }
      break;
    }
  }

  const bodyPatternKey = (key) => (
    category === 'mushroom' && key === 'reproduction'
      ? 'reproductionFungus'
      : key === 'acousticPattern'
        ? 'vocalization'
        : key === 'propagation'
          ? 'cultivation'
          : key
  );
  for (const [key] of rules) {
    if (best.has(key)) continue;
    const pattern = BODY_PATTERNS[bodyPatternKey(key)];
    if (!pattern) continue;
    let candidate = null;
    for (const section of usableSections) {
      const text = sentenceMatches(section.text, pattern);
      if (text && (!candidate || text.length > candidate.text.length)) {
        candidate = { key, heading: section.heading, text };
      }
    }
    if (candidate) best.set(key, candidate);
  }

  const acoustic = best.get('acousticPattern');
  if (acoustic) {
    const timingPattern = /(?:\d+(?:[.,]\d+)?\s*(?:hz|khz)|\b(?:dawn|dusk|night|morning|nocturnal|diurnal|crepuscular|amanhecer|entardecer|noite|manha|noturno|diurno|madrugada|primavera|verao|outono|inverno|spring|summer|autumn|winter)\b)/iu;
    let timing = null;
    for (const section of usableSections) {
      const text = sentenceMatches(section.text, timingPattern, 2);
      if (text && (!timing || text.length > timing.text.length)) {
        timing = { key: 'frequencyTiming', heading: section.heading, text };
      }
    }
    if (timing) best.set('frequencyTiming', timing);
  }

  return rules
    .map(([key]) => best.get(key))
    .filter(Boolean)
    .concat(best.has('frequencyTiming') ? [best.get('frequencyTiming')] : []);
}

function wikiQueryUrl(scientific, language) {
  const hostLanguage = WIKI_HOST_BY_LANGUAGE[language];
  if (!hostLanguage) return null;
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'extracts|info',
    inprop: 'url',
    explaintext: '1',
    exsectionformat: 'wiki',
    titles: scientific,
  });
  if (language === 'zh-hant') params.set('variant', 'zh-hant');
  return `https://${hostLanguage}.wikipedia.org/w/api.php?${params.toString()}`;
}

function wikiLanguageLinkUrl(scientific, language) {
  const targetLanguage = WIKI_HOST_BY_LANGUAGE[language];
  if (!targetLanguage || targetLanguage === 'en') return null;
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'extracts|info|langlinks',
    inprop: 'url',
    explaintext: '1',
    exintro: '1',
    exsectionformat: 'wiki',
    lllang: targetLanguage,
    lllimit: '1',
    titles: scientific,
  });
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`;
}

function exactWikiPage(payload, scientific, language) {
  const pages = payload?.query?.pages;
  if (!Array.isArray(pages) || pages.length !== 1) return null;
  const page = pages[0];
  const title = cleanHeading(page?.title);
  const extract = typeof page?.extract === 'string' ? page.extract.normalize('NFC') : '';
  const url = typeof page?.fullurl === 'string' ? page.fullurl.trim() : '';
  if (page?.missing || !title || !extract || extract.length > 220000) return null;

  const expectedHost = `${WIKI_HOST_BY_LANGUAGE[language]}.wikipedia.org`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost || !parsed.pathname.startsWith('/wiki/')) {
      return null;
    }
  } catch (error) {
    return null;
  }

  const exact = fold(scientific);
  const lead = fold(extract.slice(0, 1400));
  if (fold(title) !== exact && !lead.includes(exact)) return null;
  return { title, extract, url };
}

function exactLocalTitle(payload, scientific, language) {
  if (!exactWikiPage(payload, scientific, 'en')) return null;
  const pages = payload?.query?.pages;
  const links = pages?.[0]?.langlinks;
  const targetLanguage = WIKI_HOST_BY_LANGUAGE[language];
  if (!Array.isArray(links) || links.length !== 1 || links[0]?.lang !== targetLanguage) return null;
  return cleanHeading(links[0]?.title);
}

async function loadWikipediaSections({ scientific, category, language }, options = {}) {
  const url = wikiQueryUrl(scientific, language);
  if (!url || typeof options.fetchJson !== 'function') return null;
  const requestOptions = options.requestOptions || {};
  const payload = await options.fetchJson(url, requestOptions);
  let page = exactWikiPage(payload, scientific, language);
  const languageLinkUrl = wikiLanguageLinkUrl(scientific, language);
  if (!page && languageLinkUrl) {
    const linkPayload = await options.fetchJson(languageLinkUrl, requestOptions);
    const localTitle = exactLocalTitle(linkPayload, scientific, language);
    if (localTitle) {
      const localPayload = await options.fetchJson(wikiQueryUrl(localTitle, language), requestOptions);
      page = exactWikiPage(localPayload, scientific, language);
    }
  }
  if (!page) return null;
  const sections = buildWikiSections(category, page.extract);
  if (!sections.length) return null;
  return {
    sections,
    source: {
      id: 'wikipedia',
      url: page.url,
      license: 'CC-BY-SA-4.0',
      title: page.title,
    },
  };
}

function gbifMatchUrl(scientific) {
  const params = new URLSearchParams({
    name: scientific,
    rank: 'SPECIES',
    strict: 'true',
    verbose: 'true',
  });
  return `https://api.gbif.org/v1/species/match?${params.toString()}`;
}

function cleanRank(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().normalize('NFC');
  return clean && clean.length <= 100 && /^[\p{L}\p{M}.'\u2019 -]+$/u.test(clean)
    ? clean
    : null;
}

function selectExactGbifTaxon(payload, scientific, category) {
  const expectedKingdom = KINGDOM_BY_CATEGORY[category];
  const usageKey = Number(payload?.usageKey);
  const exact = expectedKingdom
    && Number.isInteger(usageKey)
    && usageKey > 0
    && payload.canonicalName === scientific
    && payload.species === scientific
    && Number(payload.speciesKey) === usageKey
    && String(payload.rank).toUpperCase() === 'SPECIES'
    && String(payload.status).toUpperCase() === 'ACCEPTED'
    && String(payload.matchType).toUpperCase() === 'EXACT'
    && Number.isFinite(payload.confidence)
    && payload.confidence >= 95
    && payload.kingdom === expectedKingdom;
  if (!exact) return null;
  const taxonomy = { sourceId: 'gbif', species: scientific, kingdom: expectedKingdom };
  for (const [from, to] of [
    ['phylum', 'phylum'], ['class', 'className'], ['order', 'order'],
    ['family', 'family'], ['genus', 'genus'],
  ]) {
    const value = cleanRank(payload[from]);
    if (value) taxonomy[to] = value;
  }
  return { usageKey, taxonomy };
}

async function loadGenericWikiDossier({ scientific, category, language }, options = {}) {
  if (!KINGDOM_BY_CATEGORY[category] || typeof options.fetchJson !== 'function') return null;
  const requestOptions = options.requestOptions || {};
  const [gbifResult, wikiResult] = await Promise.allSettled([
    options.fetchJson(gbifMatchUrl(scientific), requestOptions),
    loadWikipediaSections({ scientific, category, language }, options),
  ]);
  if (gbifResult.status !== 'fulfilled') throw gbifResult.reason;
  const exact = selectExactGbifTaxon(gbifResult.value, scientific, category);
  if (!exact) return null;
  const wiki = wikiResult.status === 'fulfilled' ? wikiResult.value : null;
  return {
    scientific,
    taxonomy: exact.taxonomy,
    wikiSections: wiki?.sections || [],
    sources: [
      {
        id: 'gbif',
        url: `https://www.gbif.org/species/${exact.usageKey}`,
        license: 'CC-BY-4.0',
      },
      ...(wiki ? [wiki.source] : []),
    ],
    partial: !wiki,
  };
}

module.exports = {
  buildWikiSections,
  exactLocalTitle,
  exactWikiPage,
  gbifMatchUrl,
  loadGenericWikiDossier,
  loadWikipediaSections,
  selectExactGbifTaxon,
  splitExtract,
  wikiLanguageLinkUrl,
  wikiQueryUrl,
};
