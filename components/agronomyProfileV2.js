// O perfil mundial guarda apenas codigos territoriais declarados pelo usuario.
// Idioma e localizacao do aparelho nunca viram pais: ambos podem estar errados
// para o talhao que a pessoa esta descrevendo.

export const AGRONOMY_PROFILE_VERSION = 2;

export const ISO_ALPHA2_CODES = Object.freeze((
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ ' +
  'VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' '));

const ISO_ALPHA2 = new Set(ISO_ALPHA2_CODES);

export const BRAZIL_ADMIN1_CODES = Object.freeze([
  'BR-AC', 'BR-AL', 'BR-AP', 'BR-AM', 'BR-BA', 'BR-CE', 'BR-DF', 'BR-ES', 'BR-GO',
  'BR-MA', 'BR-MT', 'BR-MS', 'BR-MG', 'BR-PA', 'BR-PB', 'BR-PR', 'BR-PE', 'BR-PI',
  'BR-RJ', 'BR-RN', 'BR-RS', 'BR-RO', 'BR-RR', 'BR-SC', 'BR-SP', 'BR-SE', 'BR-TO',
]);

const BRAZIL_ADMIN1_SET = new Set(BRAZIL_ADMIN1_CODES);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function rawCode(value) {
  return cleanText(value, 16).toUpperCase().replace(/_/g, '-');
}

export function normalizeCountryCode(value) {
  const code = rawCode(value);
  return ISO_ALPHA2.has(code) ? code : null;
}

export function normalizeAdmin1Code(value, countryCode) {
  const country = normalizeCountryCode(countryCode);
  const code = rawCode(value);
  if (!country || !new RegExp(`^${country}-[A-Z0-9]{1,3}$`).test(code)) return null;
  return code;
}

export function isSupportedBrazilAdmin1Code(value) {
  return BRAZIL_ADMIN1_SET.has(rawCode(value));
}

// Converte o formato antigo sem completar informacao desconhecida. Um V1 com
// UF invalida permanece incompleto e sera rejeitado pelo storage.
export function migrateAgronomyProfileToV2(value) {
  if (!isRecord(value)) return null;
  const location = isRecord(value.location) ? value.location : {};
  const planting = isRecord(value.planting) ? value.planting : {};
  const soil = isRecord(value.soil) ? value.soil : {};

  let countryCode = '';
  let admin1Code = '';
  let locality = '';

  if (value.schemaVersion === 1) {
    const state = rawCode(location.state);
    if (BRAZIL_ADMIN1_SET.has(`BR-${state}`)) {
      countryCode = 'BR';
      admin1Code = `BR-${state}`;
    }
    locality = cleanText(location.municipality, 80);
  } else if (value.schemaVersion === AGRONOMY_PROFILE_VERSION) {
    countryCode = rawCode(location.countryCode);
    admin1Code = rawCode(location.admin1Code);
    locality = cleanText(location.locality, 80);
  } else {
    return null;
  }

  return {
    schemaVersion: AGRONOMY_PROFILE_VERSION,
    purpose: cleanText(value.purpose, 40),
    system: cleanText(value.system, 40),
    location: { countryCode, admin1Code, locality },
    planting: {
      date: cleanText(planting.date, 10),
      stage: cleanText(planting.stage, 80),
      stageConfirmed: planting.stageConfirmed === true,
    },
    soil: {
      description: cleanText(soil.description, 160),
      hasReport: typeof soil.hasReport === 'boolean' ? soil.hasReport : null,
    },
  };
}

export function validAgronomyLocationV2(location) {
  if (!isRecord(location)) return false;
  const country = normalizeCountryCode(location.countryCode);
  if (!country || cleanText(location.locality, 80).length < 2) return false;

  const rawAdmin = rawCode(location.admin1Code);
  if (!rawAdmin) return true;
  const admin = normalizeAdmin1Code(rawAdmin, country);
  if (!admin) return false;

  // O app ja possui regras por UF. Aceitar BR-ZZ criaria uma regiao com
  // aparencia oficial ao lado delas; para os demais paises, o prefixo ISO
  // coerente e o limite disponivel sem embutir a tabela mundial de subdivisoes.
  return country !== 'BR' || BRAZIL_ADMIN1_SET.has(admin);
}

export function agronomyLocationLabel(location) {
  if (!validAgronomyLocationV2(location)) return '';
  return [
    cleanText(location.locality, 80),
    normalizeAdmin1Code(location.admin1Code, location.countryCode),
    normalizeCountryCode(location.countryCode),
  ].filter(Boolean).join(' · ');
}
