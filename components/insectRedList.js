// O fornecedor documenta uma enum string, enquanto registros enriquecidos ou
// antigos podem guardar o objeto de categoria com `code` e `category`. Aceitar
// somente esses campos impede que descricao inglesa ou um objeto inteiro vire
// filho de React quando o schema externo mudar.

const STATUS_BY_CODE = Object.freeze({
  EX: Object.freeze({ code: 'EX', labelKey: 'detail.iucn.extinct' }),
  EW: Object.freeze({ code: 'EW', labelKey: 'detail.iucn.extinctInTheWild' }),
  RE: Object.freeze({ code: 'RE', labelKey: 'detail.iucn.regionallyExtinct' }),
  CR: Object.freeze({ code: 'CR', labelKey: 'detail.iucn.criticallyEndangered' }),
  EN: Object.freeze({ code: 'EN', labelKey: 'detail.iucn.endangered' }),
  VU: Object.freeze({ code: 'VU', labelKey: 'detail.iucn.vulnerable' }),
  NT: Object.freeze({ code: 'NT', labelKey: 'detail.iucn.nearThreatened' }),
  LC: Object.freeze({ code: 'LC', labelKey: 'detail.iucn.leastConcern' }),
  DD: Object.freeze({ code: 'DD', labelKey: 'detail.iucn.dataDeficient' }),
  NA: Object.freeze({ code: 'NA', labelKey: 'detail.iucn.notApplicable' }),
  NE: Object.freeze({ code: 'NE', labelKey: 'detail.iucn.notEvaluated' }),
});

const ENUM_BY_CODE = Object.freeze({
  EX: 'EXTINCT',
  EW: 'EXTINCT_IN_THE_WILD',
  RE: 'REGIONALLY_EXTINCT',
  CR: 'CRITICALLY_ENDANGERED',
  EN: 'ENDANGERED',
  VU: 'VULNERABLE',
  NT: 'NEAR_THREATENED',
  LC: 'LEAST_CONCERN',
  DD: 'DATA_DEFICIENT',
  NA: 'NOT_APPLICABLE',
  NE: 'NOT_EVALUATED',
});

const CODE_BY_TOKEN = Object.freeze(
  Object.entries(ENUM_BY_CODE).reduce((result, [code, category]) => {
    result[code] = code;
    result[category] = code;
    return result;
  }, {})
);

const INSECT_RED_LIST_I18N_KEYS = Object.freeze(
  Object.values(STATUS_BY_CODE).map((status) => status.labelKey)
);

function cleanToken(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean || clean.length > 64) return null;
  const token = clean.toUpperCase().replace(/[\s-]+/g, '_');
  return /^[A-Z_]+$/.test(token) ? token : null;
}

function statusFromToken(value) {
  const token = cleanToken(value);
  const code = token ? CODE_BY_TOKEN[token] : null;
  return code ? STATUS_BY_CODE[code] : null;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch (error) {
    return false;
  }
}

function ownValue(record, key) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return { present: false, value: null };
  return { present: true, value: record[key] };
}

function normaliseInsectRedList(value) {
  const direct = statusFromToken(value);
  if (direct) return direct;
  if (!isPlainRecord(value)) return null;

  try {
    const declared = ['code', 'category']
      .map((key) => ownValue(value, key))
      .filter((field) => field.present);
    if (!declared.length) return null;

    const statuses = declared.map((field) => statusFromToken(field.value));
    if (statuses.some((status) => !status)) return null;
    if (statuses.some((status) => status.code !== statuses[0].code)) return null;
    return statuses[0];
  } catch (error) {
    // Getter externo ou proxy hostil nao pode derrubar a tela de resultado.
    return null;
  }
}

function insectRedListLabel(value, translate) {
  const status = normaliseInsectRedList(value);
  if (!status || typeof translate !== 'function') return null;

  try {
    const translated = translate(status.labelKey);
    if (typeof translated !== 'string') return null;
    const clean = translated.trim();
    if (!clean || clean === status.labelKey) return null;

    // i18next devolve a propria chave quando falta traducao. Um adaptador mal
    // configurado tambem pode devolver o enum cru; nenhum dos dois e rotulo.
    const raw = clean.toUpperCase();
    if (raw === status.code || raw === ENUM_BY_CODE[status.code]) return null;
    return clean;
  } catch (error) {
    return null;
  }
}

module.exports = {
  INSECT_RED_LIST_I18N_KEYS,
  IUCN_RED_LIST_CODES: Object.freeze(Object.keys(STATUS_BY_CODE)),
  insectRedListLabel,
  normaliseInsectRedList,
};
