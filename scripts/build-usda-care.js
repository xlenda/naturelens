// Destila o USDA PLANTS Database em public/locales/species-care.json.
//
// POR QUE ESTE ARQUIVO EXISTE
// O app dava conselho de cuidado por GRUPO (19 grupos: cacto, samambaia,
// folhagem tropical...). O dono exigiu por ESPECIE - "a parte de rega tem que
// ser caracteristica de cada planta, fertilizando tambem". Esta e a unica fonte
// que encontramos com numero por especie, sem chave, sem limite publicado e com
// uso comercial LIVRE: "Our plant information ... is not copyrighted and is
// free for any use" (PLANTS_Help_Document_2022.pdf), exigindo so a citacao que
// vai no campo _source do arquivo gerado.
//
// POR QUE E BUILD E NAO RUNTIME
// Mesmo modelo dos outros conteudos estaticos do app ({lang}-groups.json,
// {lang}-manual.json): o arquivo sai daqui, e servido pela CDN e custa zero por
// usuario. Chamar o USDA por usuario seria pagar latencia e depender de um
// servico do governo americano estar de pe no meio da tela de resultado.
//
// POR QUE DUAS RODADAS DE REDE
// characteristicSearchFilterResults devolve o banco inteiro em 1,6 MB, mas e um
// indice INVERTIDO (caracteristica -> valor -> lista de plantIds) e nao carrega
// nenhum nome. O nome cientifico so existe em PlantProfile/{id}, um por vez -
// por isso a segunda rodada com pool de concorrencia.
//
// Rode manualmente:  node scripts/build-usda-care.js
// (Fora do deploy de proposito: a saida e um asset commitado e o USDA nao muda
// de semana em semana.)

const fs = require('fs');
const path = require('path');

const API = 'https://plantsservices.sc.egov.usda.gov/api';
const OUT = path.join(__dirname, '..', 'public', 'locales', 'species-care.json');
const CONCURRENCY = 12;

// A citacao que a licenca exige. Viaja DENTRO do arquivo para que o credito
// nunca dependa de alguem lembrar de escrever no componente.
const SOURCE =
  'USDA, NRCS. ' +
  new Date().getFullYear() +
  '. The PLANTS Database (http://plants.usda.gov), National Plant Data Team, Greensboro, NC USA.';

// Caracteristicas categoricas que a tela usa. O valor do USDA vira minusculo e
// serve de sufixo de chave i18n na tela - nunca e mostrado cru.
const CODED = {
  'Moisture Use': 'moisture',
  'Drought Tolerance': 'drought',
  'Fertility Requirement': 'fertility',
  'Shade Tolerance': 'shade',
};

// Caracteristicas numericas. O USDA nao publica o numero: publica a FAIXA em
// que ele cai ("5.1-5.2", "-32 - -28", "12 - 14"). Guardamos a ponta
// conservadora de cada faixa - ver pickBand.
const BANDED = {
  'pH, Minimum': 'phMin',
  'pH, Maximum': 'phMax',
  'Temperature, Minimum (°F)': 'tempMinF',
  'Root Depth, Minimum (inches)': 'rootMinIn',
  'Precipitation, Minimum (inches)': 'rainMinIn',
  'Precipitation, Maximum (inches)': 'rainMaxIn',
};

const SEASON = { spring: 'spring', summer: 'summer', fall: 'autumn', winter: 'winter' };

/**
 * "Early Spring" -> { bloom: 'spring', bloomPart: 'early' }.
 *
 * A estacao fica separada do modificador porque o Bloom Period do USDA e do
 * hemisferio NORTE e a tela precisa poder INVERTER a estacao sem perder o
 * "early/late" - a mesma licao que CareSchedule.js ja aprendeu. "Indeterminate"
 * nao e epoca nenhuma e sai fora.
 */
function parseBloom(display) {
  const words = String(display || '').toLowerCase().split(/\s+/).filter(Boolean);
  const season = SEASON[words[words.length - 1]];
  if (!season) return null;
  const part = ['early', 'mid', 'late'].includes(words[0]) ? words[0] : null;
  return { bloom: season, bloomPart: part };
}

/**
 * Ponta conservadora da faixa do USDA.
 *
 * A regra e uma so e vale para todos os campos: campo "Minimum" pega a ponta
 * ALTA da faixa, campo "Maximum" pega a ponta BAIXA. Isso estreita a janela
 * declarada em vez de alarga-la - dizer que uma planta tolera -32 F quando o
 * banco so garante a faixa -32 a -28 e prometer resistencia que ninguem mediu,
 * e e o tipo de otimismo que mata a planta do usuario.
 *
 * @returns {number|null} null em "N/A" e em qualquer coisa que nao vire numero.
 */
function pickBand(display, isMaximum) {
  const raw = String(display || '').trim();
  if (!raw || raw === 'N/A') return null;

  // ">=60" e ">=200" nao sao faixa: sao um piso.
  if (raw.startsWith('>=')) {
    const only = Number(raw.slice(2));
    return Number.isFinite(only) ? only : null;
  }

  // Dois formatos convivem no mesmo banco: "3.9-4" (sem espaco) e "-75 - -53"
  // (com espaco, e com sinal negativo dos dois lados). Um split ingenuo em '-'
  // le "3.9-4" como [3.9, -4].
  const parts = raw.includes(' - ') ? raw.split(' - ') : raw.split(/(?<=\d)-/);
  const numbers = parts.map((p) => Number(p.trim())).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return numbers[0];

  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return isMaximum ? lo : hi;
}

/**
 * Nome cientifico do USDA -> chave binomial minuscula.
 *
 * O USDA devolve "<i>Acer rubrum</i> L." - italico no nome, autor fora dele. O
 * mesmo par de linhas roda em components/speciesCare.js do lado do app; o
 * self-check em scripts/check-species-care.js le ESTE arquivo gerado e prova
 * que as duas normalizacoes concordam.
 */
function binomialKey(scientific) {
  const plain = String(scientific || '').replace(/<[^>]*>/g, ' ');
  const words = plain
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Mantem a mesma chave quando outra fonte escreve o hibrido com "x".
    .filter((word, index) => index === 0 || word !== 'x');
  if (words.length < 2) return null;
  return words[0] + ' ' + words[1];
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ' -> ' + response.status);
  return response.json();
}

/** Pool simples: 2268 perfis em serie levariam ~40 minutos. */
async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        out[i] = await worker(items[i]);
      }
    })
  );
  return out;
}

function assertParsing() {
  const eq = (got, want, msg) => {
    if (got !== want) throw new Error(msg + ': expected ' + want + ', got ' + got);
  };
  // Faixa com espaco e negativa dos dois lados.
  eq(pickBand('-32 - -28', false), -28, 'temp band takes the warm end');
  eq(pickBand('-75 - -53', false), -53, 'wide cold band');
  eq(pickBand('-2 - 2', false), 2, 'band crossing zero');
  // Faixa sem espaco, com decimal - o caso que quebra split('-') ingenuo.
  eq(pickBand('3.9-4', false), 4, 'pH minimum takes the high end');
  eq(pickBand('6.7-6.8', true), 6.7, 'pH maximum takes the low end');
  eq(pickBand('12 - 14', false), 14, 'root depth takes the deep end');
  eq(pickBand('>=60', false), 60, 'open-ended floor');
  eq(pickBand('N/A', false), null, 'N/A is absence, not zero');
  eq(pickBand('', false), null, 'empty is absence');
  // Nome.
  eq(binomialKey('<i>Acer rubrum</i> L.'), 'acer rubrum', 'binomial from italics');
  eq(binomialKey('<i>Plumeria rubra</i> L.'), 'plumeria rubra', 'binomial with author');
  eq(binomialKey('<i>Acer</i>'), null, 'genus alone is not a species key');
  // Bloom.
  eq(parseBloom('Early Spring').bloom, 'spring', 'bloom season');
  eq(parseBloom('Early Spring').bloomPart, 'early', 'bloom part');
  eq(parseBloom('Fall').bloom, 'autumn', 'fall maps to the autumn i18n key');
  eq(parseBloom('Late Winter').bloomPart, 'late', 'late winter keeps its part');
  eq(parseBloom('Indeterminate'), null, 'indeterminate is not a season');
}

async function main() {
  assertParsing();

  process.stdout.write('1/3 baixando o indice invertido do USDA... ');
  const index = await getJson(API + '/characteristicSearchFilterResults');
  process.stdout.write(index.length + ' caracteristicas\n');

  // Indice invertido -> um registro por planta, so com os campos que a tela usa.
  const byId = new Map();
  const put = (id, key, value) => {
    if (value === null || value === undefined) return;
    if (!byId.has(id)) byId.set(id, {});
    byId.get(id)[key] = value;
  };

  const allIds = new Set();
  for (const characteristic of index) {
    for (const filter of characteristic.filters || []) {
      for (const id of filter.plantIds || []) allIds.add(id);
    }
  }

  for (const characteristic of index) {
    const codedKey = CODED[characteristic.name];
    const bandedKey = BANDED[characteristic.name];
    const isBloom = characteristic.name === 'Bloom Period';
    if (!codedKey && !bandedKey && !isBloom) continue;

    const isMaximum = /Maximum/.test(characteristic.name);
    for (const filter of characteristic.filters || []) {
      let value = null;
      let bloom = null;
      if (codedKey) value = String(filter.display).toLowerCase();
      else if (bandedKey) value = pickBand(filter.display, isMaximum);
      else bloom = parseBloom(filter.display);

      for (const id of filter.plantIds || []) {
        if (isBloom) {
          if (bloom) {
            put(id, 'bloom', bloom.bloom);
            put(id, 'bloomPart', bloom.bloomPart);
          }
        } else {
          put(id, codedKey || bandedKey, value);
        }
      }
    }
  }

  const ids = [...allIds];
  process.stdout.write('2/3 resolvendo o nome cientifico de ' + ids.length + ' plantas...\n');

  let done = 0;
  const profiles = await mapPool(ids, CONCURRENCY, async (id) => {
    let profile = null;
    try {
      profile = await getJson(API + '/PlantProfile/' + id);
    } catch (e) {
      profile = null;
    }
    done += 1;
    if (done % 250 === 0) process.stdout.write('    ' + done + '/' + ids.length + '\n');
    return { id, profile };
  });

  // Uma chave binomial pode receber varios registros (a especie, a variedade e
  // a subespecie). Vence quem tem rank Species: o dado da especie e o que a
  // tela promete mostrar, e a variedade so entra quando nao ha especie.
  const out = {};
  const rankOf = {};
  let noName = 0;
  let noProfile = 0;

  for (const { id, profile } of profiles) {
    if (!profile) {
      noProfile += 1;
      continue;
    }
    const key = binomialKey(profile.ScientificName);
    if (!key) {
      noName += 1;
      continue;
    }
    const record = byId.get(id);
    if (!record || Object.keys(record).length === 0) continue;

    const isSpecies = profile.Rank === 'Species';
    if (out[key] && rankOf[key] && !isSpecies) continue;

    out[key] = { sym: profile.Symbol, ...record };
    rankOf[key] = isSpecies;
  }

  const species = Object.keys(out).sort();
  const payload = {
    _source: SOURCE,
    _built: new Date().toISOString().slice(0, 10),
    _count: species.length,
  };
  for (const key of species) payload[key] = out[key];

  fs.writeFileSync(OUT, JSON.stringify(payload) + '\n');

  // Quantas plantas do indice NAO viraram linha, e por que. O numero tem que
  // ser conhecido e nao estimado: e ele que decide se a tela pode prometer
  // "por especie" ou tem que continuar admitindo o grupo.
  const withData = [...byId.keys()].length;
  const size = fs.statSync(OUT).size;
  console.log('3/3 escrito ' + path.relative(process.cwd(), OUT));
  console.log('    plantas no indice do USDA:      ' + ids.length);
  console.log('    com algum campo que usamos:     ' + withData);
  console.log('    perfil nao respondeu:           ' + noProfile);
  console.log('    sem binomial utilizavel:        ' + noName);
  console.log('    ESPECIES NO ARQUIVO:            ' + species.length);
  console.log('    sem dado (indice - arquivo):    ' + (ids.length - species.length));
  console.log('    tamanho:                        ' + (size / 1024).toFixed(1) + ' KB');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
