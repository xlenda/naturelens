import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getTaxonKey, GBIF_UA } from './gbifTaxonKey';
import { enrichmentTaxon } from './taxonIdentity';

// DESTAQUE DA ESTACAO - paridade 120% (video do concorrente, 20/08).
// O concorrente desenha um grafico de estacao GENERICO, igual para toda
// especie. Aqui o dado e real e por especie: o GBIF publica o histograma de
// ocorrencias por mes (facet=month sobre /occurrence/search), ou seja QUANDO a
// especie foi de fato registrada, mes a mes, somando o mundo inteiro. Gratis,
// sem chave, ja verificado ao vivo neste projeto (o pico da Plumeria bateu com
// a floracao real).
//
// HEMISFERIO (regra dura do app - ele roda no mundo inteiro): nada aqui e
// ancorado no calendario do hemisferio norte. O grafico nao diz "primavera"
// nem "verao" em lugar nenhum - diz MES, que e a mesma coisa nos dois
// hemisferios, e os rotulos saem de toLocaleDateString no idioma do usuario,
// nunca de nome de mes escrito no codigo. A contagem tambem soma o planeta
// todo, entao uma especie dos dois hemisferios aparece com os dois picos; o
// texto de honestidade diz explicitamente que os registros sao "no mundo
// todo", para o usuario do sul nao ler o pico do norte como sendo o dele.
//
// HONESTIDADE (mesma doutrina do resto do app):
//  - amostra pequena MENTE: com menos de 30 registros datados o bloco some
//    inteiro, em vez de desenhar um "pico" que e ruido de 3 observacoes;
//  - o que o grafico mostra e esforco de observacao, nao garantia de floracao
//    ou de atividade - e isso esta escrito na tela, nao so aqui no comentario.
//    O corpus ja registra a licao para fauna: "registrar migratoria sem data e
//    local precisos - perde-se o dado mais valioso: o padrao sazonal e a rota"
//    (CEMAVE, cap. 2 - docs/agronomia/grupos/aves-de-mata-e-migratorias.md), o
//    que e o mesmo que dizer que o padrao sazonal AQUI vem da data de quem
//    registrou, com todo o vies de quem estava em campo naquele mes;
//  - sem match no GBIF, offline ou API fora do ar: nao renderiza nada.
//
// Puro RN (View com altura em px sobre um trilho), zero lib de grafico nova -
// mesma linguagem visual do RangeBar: trilho + preenchimento.

// Abaixo disso o histograma e ruido, nao sazonalidade.
export const MIN_RECORDS = 30;
const BAR_H = 64;

// Mes sem nenhum registro fica com barra 0 (o trilho vazio ja diz "nenhum");
// mes com registro ganha 3px de piso para nao sumir ao lado de um pico grande.
export const barHeight = (count, max) =>
  count === 0 ? 0 : Math.max(3, Math.round((count / max) * BAR_H));

// Resposta do GBIF -> 12 posicoes (janeiro..dezembro). Exportada porque e o
// unico pedaco com armadilha real, e SeasonChart.test.js a exercita contra a
// resposta de verdade da API: as contagens vem ordenadas por VOLUME e nao por
// mes, e um mes sem nenhuma ocorrencia simplesmente NAO APARECE na lista - ler
// isso por indice, e nao pelo campo name, embaralharia o ano inteiro.
export function monthCounts(json) {
  const counts = (json?.facets || []).find((f) => f?.field === 'MONTH')?.counts || [];
  const arr = new Array(12).fill(0);
  counts.forEach((c) => {
    const m = parseInt(c?.name, 10);
    if (m >= 1 && m <= 12) arr[m - 1] = c?.count || 0;
  });
  return arr;
}

export default function SeasonChart({ scientific, gbifId, identityV1, accent = colors.accent }) {
  const { t, i18n } = useTranslation();
  const [months, setMonths] = useState(null);
  const enrichment = enrichmentTaxon(identityV1, {
    scientificName: scientific,
    gbifKey: gbifId,
  });
  const resolvedScientific = enrichment?.canonicalName || null;
  const resolvedGbifId = enrichment?.gbifKey || null;

  useEffect(() => {
    let alive = true;
    // A tela de detalhe pode ser reutilizada para outra especie. Sem limpar
    // aqui, uma falha/offline no segundo lookup deixava o grafico da especie
    // anterior visivel para sempre.
    setMonths(null);
    (async () => {
      const key = await getTaxonKey(resolvedScientific, resolvedGbifId);
      if (!key || !alive) return;
      try {
        const r = await fetch(
          'https://api.gbif.org/v1/occurrence/search?taxonKey=' +
            key +
            '&facet=month&facetLimit=12&limit=0',
          { headers: { 'User-Agent': GBIF_UA } }
        );
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setMonths(monthCounts(d));
      } catch (e) {
        // offline / GBIF fora do ar: bloco nao renderiza
      }
    })();
    return () => {
      alive = false;
    };
  }, [resolvedScientific, resolvedGbifId]);

  if (!months) return null;

  // O portao e a soma dos registros DATADOS (o que o grafico realmente
  // desenha), nao o total de registros da especie: uma especie com 10 mil
  // ocorrencias das quais so 5 tem mes ainda e uma amostra de 5.
  const total = months.reduce((a, b) => a + b, 0);
  if (total < MIN_RECORDS) return null;

  const max = Math.max(...months);
  const current = new Date().getMonth();

  // ponytail: Intl sem ICU completo (Android antigo) pode ignorar as opcoes e
  // devolver a data inteira - qualquer rotulo com mais de 4 caracteres cai
  // para o numero do mes, que e legivel em todo idioma.
  const monthLabel = (m, style) => {
    try {
      const s = new Date(2001, m, 1).toLocaleDateString(i18n.language, { month: style });
      return style === 'narrow' && s.length > 4 ? String(m + 1) : s;
    } catch (e) {
      return String(m + 1);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('detail.seasonChart')}</Text>

      <View style={styles.chart}>
        {months.map((count, m) => (
          <View
            key={m}
            style={styles.col}
            accessible={true}
            // O grafico nao tem numero escrito na tela: sem isso o leitor de
            // tela ouviria so "J F M A M..." e nenhuma informacao.
            accessibilityLabel={monthLabel(m, 'long') + ': ' + count}
          >
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight(count, max),
                    backgroundColor: m === current ? accent : accent + '59',
                  },
                ]}
              />
            </View>
            <Text style={[styles.month, m === current && styles.monthNow]}>
              {monthLabel(m, 'narrow')}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.note}>{t('detail.seasonChartNote')}</Text>
      <Text style={styles.credit}>{t('detail.gbifCredit')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  col: { flex: 1, alignItems: 'center', gap: 5 },
  // Trilho + preenchimento, igual ao RangeBar: a parte vazia do trilho ja diz
  // "poucos registros" sem precisar de linha de base nem de eixo.
  track: {
    width: '100%',
    height: BAR_H,
    borderRadius: 4,
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: { width: '100%', borderRadius: 4 },
  month: { fontSize: 10, color: colors.textMuted },
  monthNow: { color: colors.text, fontWeight: '800' },
  note: { fontSize: 11, color: colors.textMuted, marginTop: 8, lineHeight: 16 },
  credit: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: 'right' },
});
