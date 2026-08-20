import AsyncStorage from '@react-native-async-storage/async-storage';

// Resolve de nome cientifico -> taxonKey do GBIF, com cache permanente.
// Extraido de DistributionMap.js para a paridade 120% (video do concorrente,
// 20/08): SeasonChart precisa exatamente da MESMA chave, e duas copias da
// mesma logica na mesma tela significavam duas coisas ruins - dois formatos de
// cache que podem divergir com o tempo e DUAS chamadas /species/match
// simultaneas por especie (mapa e grafico montam juntos).
//
// O formato da chave de cache nao mudou ('@naturelens_gbif_' + nome em
// minusculas), entao todo cache ja gravado no aparelho do usuario continua
// valendo. Um taxonKey nunca muda, por isso o cache nao expira; 'none' e o
// registro de "esse nome nao casa com nenhum taxon", para nao bater na API de
// novo a cada abertura da tela.
//
// HONESTIDADE: erro de rede / GBIF fora do ar / nome sem match devolvem null
// e NAO gravam cache - quem chama simplesmente nao renderiza o bloco, e a
// proxima abertura tenta de novo. Nunca um valor inventado para "ter o que
// desenhar".
const CACHE_PREFIX = '@naturelens_gbif_';

// O GBIF pede identificacao de quem consome a API.
export const GBIF_UA = 'NatureLens (naturelensapp.cloud)';

// Promessas em voo por chave: o mapa e o grafico de estacao montam no mesmo
// frame e pediriam o mesmo match duas vezes.
const inflight = new Map();

export async function getTaxonKey(scientific) {
  if (!scientific) return null;
  const cacheKey = CACHE_PREFIX + scientific.toLowerCase();

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached !== null) return cached === 'none' ? null : cached;
  } catch (e) {
    // storage indisponivel: segue para a rede
  }

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const pending = (async () => {
    try {
      const r = await fetch(
        'https://api.gbif.org/v1/species/match?name=' + encodeURIComponent(scientific),
        { headers: { 'User-Agent': GBIF_UA } }
      );
      if (!r.ok) return null;
      const d = await r.json();
      const key = d?.usageKey ? String(d.usageKey) : null;
      await AsyncStorage.setItem(cacheKey, key || 'none').catch(() => {});
      return key;
    } catch (e) {
      // offline / GBIF fora do ar: sem cache, tenta de novo na proxima vez
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, pending);
  return pending;
}
