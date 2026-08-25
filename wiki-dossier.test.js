const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  buildWikiSections,
  exactLocalTitle,
  exactWikiPage,
  loadGenericWikiDossier,
  selectExactGbifTaxon,
  splitExtract,
  wikiLanguageLinkUrl,
  wikiQueryUrl,
} = require('./api/_lib/wikiDossier');

test('wiki sections keep only category-specific sourced sections', () => {
  const extract = [
    'A espécie de teste (Amanita exemplo) é um fungo documentado.',
    '',
    '== Distribuição e hábitat ==',
    'Ocorre em florestas temperadas e cresce junto às raízes de árvores.',
    '',
    '== Esporos ==',
    'Os esporos são brancos e se formam nas lâminas maduras.',
    '',
    '== Referências ==',
    'Texto editorial que nunca deve entrar no dossiê.',
  ].join('\n');

  assert.deepEqual(buildWikiSections('mushroom', extract), [
    {
      key: 'reproduction',
      heading: 'Esporos',
      text: 'Os esporos são brancos e se formam nas lâminas maduras.',
    },
    {
      key: 'habitat',
      heading: 'Distribuição e hábitat',
      text: 'Ocorre em florestas temperadas e cresce junto às raízes de árvores.',
    },
  ]);
});

test('sound sections separate a sourced acoustic pattern from documented timing', () => {
  const sections = buildWikiSections('sound', [
    'Animal sonoro (Exemplum sonorus).',
    '== Vocalização ==',
    'O chamado repete três notas curtas. Canta ao amanhecer e durante a noite.',
  ].join('\n'));

  assert.equal(sections[0].key, 'acousticPattern');
  assert.equal(sections[1].key, 'frequencyTiming');
  assert.match(sections[1].text, /amanhecer/);
});

test('article splitting never treats the lead as a fabricated topic', () => {
  const sections = splitExtract('Lead geral.\n\n== Reprodução ==\nPõe ovos uma vez ao ano.');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, 'Reprodução');
  assert.match(sections[0].body, /Põe ovos/);
});

test('wiki identity requires the exact binomial in the resolved local article', () => {
  const valid = {
    query: {
      pages: [{
        title: 'Nome local',
        fullurl: 'https://pt.wikipedia.org/wiki/Nome_local',
        extract: 'O nome local (Exemplum verum) é uma espécie documentada.\n== Habitat ==\nVive em mata.',
      }],
    },
  };
  assert.equal(exactWikiPage(valid, 'Exemplum verum', 'pt').title, 'Nome local');
  assert.equal(exactWikiPage(valid, 'Exemplum falsum', 'pt'), null);
  assert.equal(exactWikiPage({
    query: { pages: [{ ...valid.query.pages[0], fullurl: 'https://attacker.test/wiki/Nome' }] },
  }, 'Exemplum verum', 'pt'), null);
});

test('traditional Chinese uses the local variant without accepting another host', () => {
  const url = new URL(wikiQueryUrl('Corvus corax', 'zh-hant'));
  assert.equal(url.hostname, 'zh.wikipedia.org');
  assert.equal(url.searchParams.get('variant'), 'zh-hant');
  assert.equal(wikiQueryUrl('Corvus corax', 'ja'), null);
});

test('an exact English article can resolve a local common-name title without returning English prose', async () => {
  const scientific = 'Coffea arabica';
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (calls.length === 1) return { query: { pages: [{ title: scientific, missing: true }] } };
    if (calls.length === 2) {
      return {
        query: {
          pages: [{
            title: scientific,
            fullurl: 'https://en.wikipedia.org/wiki/Coffea_arabica',
            extract: `${scientific} is a documented species.`,
            langlinks: [{ lang: 'pt', title: 'CafÃ©-arÃ¡bica' }],
          }],
        },
      };
    }
    return {
      query: {
        pages: [{
          title: 'CafÃ©-arÃ¡bica',
          fullurl: 'https://pt.wikipedia.org/wiki/Caf%C3%A9-ar%C3%A1bica',
          extract: [
            `${scientific} Ã© uma espÃ©cie cultivada.`,
            '== Cultivo ==',
            'A planta Ã© cultivada em regiÃµes de altitude elevada e clima ameno.',
          ].join('\n'),
        }],
      },
    };
  };

  const dossier = await loadGenericWikiDossier({ scientific, category: 'crop', language: 'pt' }, {
    fetchJson: async (url) => {
      if (url.startsWith('https://api.gbif.org/')) {
        return {
          usageKey: 2895315,
          canonicalName: scientific,
          species: scientific,
          speciesKey: 2895315,
          rank: 'SPECIES',
          status: 'ACCEPTED',
          matchType: 'EXACT',
          confidence: 100,
          kingdom: 'Plantae',
          family: 'Rubiaceae',
          genus: 'Coffea',
        };
      }
      return fetchJson(url);
    },
  });

  assert.deepEqual(dossier.wikiSections.map((section) => section.key), ['cultivation']);
  assert.equal(dossier.sources[1].url, 'https://pt.wikipedia.org/wiki/Caf%C3%A9-ar%C3%A1bica');
  assert.equal(calls.length, 3);
  assert.equal(calls[1], wikiLanguageLinkUrl(scientific, 'pt'));
  assert.equal(new URL(calls[2]).hostname, 'pt.wikipedia.org');
});

test('language-link resolution rejects an unproven English species or wrong target language', () => {
  const valid = {
    query: {
      pages: [{
        title: 'Species exemplaris',
        fullurl: 'https://en.wikipedia.org/wiki/Species_exemplaris',
        extract: 'Species exemplaris is a documented species.',
        langlinks: [{ lang: 'pt', title: 'EspÃ©cie exemplar' }],
      }],
    },
  };
  assert.equal(exactLocalTitle(valid, 'Species exemplaris', 'pt'), 'EspÃ©cie exemplar');
  assert.equal(exactLocalTitle(valid, 'Species falsaria', 'pt'), null);
  assert.equal(exactLocalTitle(valid, 'Species exemplaris', 'es'), null);
  assert.equal(wikiLanguageLinkUrl('Species exemplaris', 'en'), null);
});

test('generic GBIF proof is exact and category-bound', () => {
  const plant = {
    usageKey: 1,
    canonicalName: 'Coffea arabica',
    scientificName: 'Coffea arabica',
    species: 'Coffea arabica',
    speciesKey: 1,
    rank: 'SPECIES',
    status: 'ACCEPTED',
    matchType: 'EXACT',
    confidence: 100,
    kingdom: 'Plantae',
    family: 'Rubiaceae',
    genus: 'Coffea',
  };
  assert.equal(selectExactGbifTaxon(plant, 'Coffea arabica', 'crop').taxonomy.family, 'Rubiaceae');
  assert.equal(selectExactGbifTaxon(plant, 'Coffea arabica', 'mushroom'), null);
  assert.equal(selectExactGbifTaxon({ ...plant, matchType: 'FUZZY' }, 'Coffea arabica', 'crop'), null);
});

test('generic dossier binds local wiki text to the same exact GBIF species', async () => {
  const scientific = 'Coffea arabica';
  const fetchJson = async (url) => {
    if (url.startsWith('https://api.gbif.org/')) {
      return {
        usageKey: 2895315,
        canonicalName: scientific,
        species: scientific,
        speciesKey: 2895315,
        rank: 'SPECIES',
        status: 'ACCEPTED',
        matchType: 'EXACT',
        confidence: 100,
        kingdom: 'Plantae',
        family: 'Rubiaceae',
        genus: 'Coffea',
      };
    }
    return {
      query: {
        pages: [{
          title: scientific,
          fullurl: 'https://pt.wikipedia.org/wiki/Coffea_arabica',
          extract: `${scientific} é uma planta cultivada.\n== Cultivo ==\nA espécie é cultivada em regiões de altitude elevada.`,
        }],
      },
    };
  };

  const dossier = await loadGenericWikiDossier({ scientific, category: 'crop', language: 'pt' }, {
    fetchJson,
  });
  assert.equal(dossier.scientific, scientific);
  assert.equal(dossier.taxonomy.family, 'Rubiaceae');
  assert.deepEqual(dossier.wikiSections, [{
    key: 'cultivation',
    heading: 'Cultivo',
    text: 'A espécie é cultivada em regiões de altitude elevada.',
  }]);
  assert.equal(dossier.partial, false);
  assert.deepEqual(dossier.sources.map((source) => source.id), ['gbif', 'wikipedia']);
});
