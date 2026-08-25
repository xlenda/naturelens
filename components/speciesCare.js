import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './apiBase';

// Loader da camada de cuidado por ESPECIE (public/locales/species-care.json,
// gerado por scripts/build-usda-care.js a partir do USDA PLANTS Database).
//
// A camada que faltava: {lang}-groups.json responde "cacto rega menos que
// frutifera" - uma afirmacao sobre o TIPO. Este arquivo responde com o numero
// da especie na tela (pH, exigencia de adubo, uso de agua, temperatura minima),
// que foi o que o dono exigiu. Nao tem idioma: sao numeros e codigos, e a
// traducao acontece na tela pelas chaves i18n.
//
// Mesmo contrato dos outros loaders (groupContent.js, manualContent.js):
// memoria -> rede -> AsyncStorage -> null. Nunca lanca, e o null faz o card
// cair pro dado de grupo DIZENDO que e do grupo - nunca um erro na tela.
const CACHE_PREFIX = '@naturelens_species_care_';

let memory = null;

/**
 * Nome cientifico -> chave binomial minuscula, a MESMA regra que
 * scripts/build-usda-care.js usa para escrever as chaves. O que chega da
 * Kindwise costuma ser "Acer rubrum", mas as vezes vem com autor ou com
 * cultivar ("Acer rubrum 'October Glory'") - as duas primeiras palavras sao a
 * unica parte que o arquivo indexa.
 *
 * O portao contra as duas regras sairem de sincronia esta em
 * scripts/check-species-care.js: ele le o arquivo GERADO e prova que toda
 * chave de la sobrevive a esta funcao sem mudar.
 */
export function binomialKey(scientific) {
  const words = String(scientific || '')
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // O contrato de identidade canoniza o sinal de hibrido como token "x".
    // Ele separa genero e epiteto, mas nunca pode virar o epiteto da busca.
    .filter((word, index) => index === 0 || word !== 'x');
  if (words.length < 2) return null;
  return words[0] + ' ' + words[1];
}

async function loadAll() {
  if (memory) return memory;
  try {
    const response = await fetch(`${API_BASE}/locales/species-care.json`);
    if (response.ok) {
      const data = await response.json();
      if (data && data._count) memory = data;
    }
  } catch (e) {
    memory = null;
  }
  return memory;
}

/**
 * Dado de cuidado da especie, ou null quando ela nao esta no banco - o que e o
 * caso da MAIORIA das tropicais ornamentais (o USDA cobre conservacao
 * norte-americana). O null e a resposta esperada, nao uma falha.
 *
 * @param {string} scientific "Acer rubrum"
 * @returns {object|null} { moisture, drought, fertility, shade, phMin, phMax,
 *          tempMinF, rootMinIn, rainMinIn, rainMaxIn, bloom, bloomPart, source }
 */
export async function getSpeciesCare(scientific) {
  const key = binomialKey(scientific);
  if (!key) return null;

  const all = await loadAll();
  if (all && all[key]) {
    const record = { ...all[key], source: all._source };
    // Guarda offline por ESPECIE, e nao o arquivo inteiro como fazem
    // groupContent/manualContent. Diferenca deliberada: na web o AsyncStorage e
    // o localStorage, o arquivo tem ~460 KB (o dobro disso em UTF-16) e estourar
    // a cota do dominio nao quebraria so este card - quebraria a gravacao da
    // COLECAO do usuario, que e o dado insubstituivel do app. O service worker
    // (public/sw.js) ja guarda /locales/*.json inteiro no Cache Storage, que tem
    // cota propria e muito maior; aqui basta o registro que o usuario abriu.
    AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(record)).catch(() => {});
    return record;
  }

  // O AsyncStorage e SO para quando o arquivo nao carregou. Se ele carregou e a
  // especie nao esta la, ela nao esta la - consultar o cache aqui ressuscitaria
  // um registro que a build seguinte tirou de proposito.
  if (all) return null;

  // Sem rede: so a especie ja vista antes volta. Uma especie nunca aberta
  // continua null - offline nao inventa dado.
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    return null;
  }
  return null;
}
