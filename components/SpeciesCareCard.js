import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { colors } from './theme';
import { getSpeciesCare } from './speciesCare';
import { getGroupTopic } from './groupContent';
import { getCareLatitude, subscribeCareRegion } from './careRegion';
import { firstSentence } from './sentences';

// Cuidado por ESPECIE - a exigencia do dono: "a parte de rega tem que ser
// caracteristica de cada planta, fertilizando tambem, tudo e diferente
// dependendo da especie".
//
// O CARD TEM DOIS ESTADOS, E O SEGUNDO E O IMPORTANTE:
//
//   1. A especie esta no USDA -> numeros dela, e o rodape diz o nome da especie
//      com todas as letras, mais a citacao que a licenca do USDA exige.
//   2. A especie NAO esta (o caso da maioria das tropicais ornamentais: o USDA
//      cobre conservacao norte-americana - Plumeria rubra, por exemplo, esta no
//      banco mas sem nenhuma caracteristica) -> cai para o dado do GRUPO que o
//      app ja tinha e DIZ que e do grupo, reusando a mesma frase do cronograma
//      (detail.scheduleGroupNote). Some em silencio so quando nao existe nem
//      especie nem grupo - ai nao ha nada honesto a dizer.
//
// UNIDADE: o USDA publica em Fahrenheit e polegada. Nada aqui mostra numero sem
// unidade, e nada mostra numero americano para quem nao le em americano - a
// conversao para C/cm/mm e feita aqui, com o par imperial entre parenteses so
// no idioma en.
//
// EPOCA DE FLORACAO: o "Bloom Period" do USDA e do hemisferio NORTE. A estacao
// e invertida pela latitude, exatamente como CareSchedule.js faz com o mes; sem
// latitude a linha inteira NAO renderiza, porque "floresce na primavera" sem
// saber de que lado do equador o leitor esta e meio conselho.

/** Fahrenheit -> Celsius, arredondado ao grau. */
export function toCelsius(f) {
  if (typeof f !== 'number' || !isFinite(f)) return null;
  return Math.round(((f - 32) * 5) / 9);
}

/** Polegada -> centimetro. */
export function toCm(inches) {
  if (typeof inches !== 'number' || !isFinite(inches)) return null;
  return Math.round(inches * 2.54);
}

/** Polegada -> milimetro (chuva anual). */
export function toMm(inches) {
  if (typeof inches !== 'number' || !isFinite(inches)) return null;
  return Math.round(inches * 25.4);
}

/**
 * Qual camada este card pode mostrar. Regra unica do fallback, isolada aqui
 * porque e ela que o self-check precisa provar: dado de especie ganha sempre;
 * sem especie, o grupo entra ADMITIDO como grupo; sem os dois, nada.
 *
 * @returns {'species'|'group'|null}
 */
export function careLayer(record, groupAdvice) {
  if (record) return 'species';
  if (groupAdvice) return 'group';
  return null;
}

/**
 * Estacao de floracao corrigida pelo hemisferio.
 *
 * @param {string} season chave do USDA ja normalizada ('spring'...'winter')
 * @param {number|null} latitude
 * @returns {string|null} null sem latitude - nunca um palpite de hemisferio.
 */
export function bloomSeason(season, latitude) {
  const OPPOSITE = { spring: 'autumn', autumn: 'spring', summer: 'winter', winter: 'summer' };
  if (!OPPOSITE[season]) return null;
  if (typeof latitude !== 'number' || !isFinite(latitude)) return null;
  return latitude < 0 ? OPPOSITE[season] : season;
}

const LEVEL_KEY = {
  low: 'detail.levelLow',
  medium: 'detail.levelMedium',
  high: 'detail.levelHigh',
  none: 'detail.levelNone',
};
// Escala propria e nao os waterLow/Medium/High que ja existiam: aqueles sao
// palavras de QUANTIDADE ("Wenig/Viel", "少量/大量") e cabem em rega, mas
// "Trockenheitstoleranz: Viel" nao e alemao. As chaves level* sao adjetivos de
// grau, e os rotulos das tres linhas foram escolhidos com o mesmo genero em
// cada idioma para o adjetivo concordar (pt/es/it/fr/pl/cs: tudo feminino).
//
// "Intolerant" do USDA vira levelNone e nao levelLow de proposito: intolerante
// a sombra nao e tolerar pouco, e nao tolerar - a diferenca entre a planta
// sofrer e a planta morrer.
const SHADE_KEY = {
  tolerant: 'detail.levelHigh',
  intermediate: 'detail.levelMedium',
  intolerant: 'detail.levelNone',
};
const BLOOM_PART_KEY = { early: 'detail.bloomEarly', mid: 'detail.bloomMid', late: 'detail.bloomLate' };

export default function SpeciesCareCard({
  scientific,
  groupKey,
  entityName,
  hideFertility = false,
  accent = colors.accent,
}) {
  const { t, i18n } = useTranslation();
  const [record, setRecord] = useState(null);
  const [group, setGroup] = useState(null);
  // undefined = latitude ainda resolvendo; null = resolvida SEM latitude. A
  // distincao evita a linha de floracao piscar na tela (mesma razao do
  // CareSchedule).
  const [latitude, setLatitude] = useState(undefined);

  useEffect(() => {
    let alive = true;
    setRecord(null);
    getSpeciesCare(scientific).then((r) => {
      if (alive) setRecord(r);
    });
    return () => {
      alive = false;
    };
  }, [scientific]);

  useEffect(() => {
    let alive = true;
    setGroup(null);
    if (!groupKey) return undefined;
    getGroupTopic(groupKey, 'watering', i18n.language).then((topic) => {
      if (alive) setGroup(topic);
    });
    return () => {
      alive = false;
    };
  }, [groupKey, i18n.language]);

  useEffect(() => {
    let alive = true;
    // A escolha manual resolve o hemisferio no Android sem pedir localizacao e
    // nunca sai do aparelho; automatico continua usando a latitude aproximada
    // apenas quando o navegador realmente a fornece.
    const resolve = () => getCareLatitude().then((value) => {
      if (alive) setLatitude(value);
    });
    resolve();
    const unsubscribe = subscribeCareRegion(resolve);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const groupAdvice = firstSentence(group?.advice?.[0]);
  const layer = careLayer(record, groupAdvice);
  if (!layer) return null;

  // No idioma en o par imperial fica entre parenteses: e o numero que a fonte
  // publicou, e o leitor americano pensa em polegada.
  const isEn = String(i18n.language || '').startsWith('en');
  const dual = (metric, imperial) => (isEn ? `${metric} (${imperial})` : metric);

  const groupCard = () =>
    groupAdvice ? (
      <SectionCard
        icon="layers-outline"
        title={group?.label || t('detail.fundamentals')}
        color={accent}
      >
        <Text style={styles.advice}>{groupAdvice}</Text>
        <Text style={styles.footer}>
          {group?.label
            ? t('detail.groupGuideNote', { group: group.label })
            : t('detail.generalGuideNote')}
        </Text>
      </SectionCard>
    ) : null;

  if (layer === 'group') return groupCard();

  const season = record.bloom ? bloomSeason(record.bloom, latitude ?? null) : null;
  const rainMm =
    typeof record.rainMinIn === 'number' && typeof record.rainMaxIn === 'number'
      ? dual(
          `${toMm(record.rainMinIn)}–${toMm(record.rainMaxIn)} mm`,
          `${record.rainMinIn}–${record.rainMaxIn} in`
        )
      : null;

  const rows = [
    {
      key: 'moisture',
      label: t('detail.usdaMoisture'),
      value: LEVEL_KEY[record.moisture] ? t(LEVEL_KEY[record.moisture]) : null,
      sub: rainMm,
    },
    {
      key: 'drought',
      label: t('detail.usdaDrought'),
      value: LEVEL_KEY[record.drought] ? t(LEVEL_KEY[record.drought]) : null,
    },
    {
      key: 'fertility',
      label: t('detail.usdaFertility'),
      value: LEVEL_KEY[record.fertility] ? t(LEVEL_KEY[record.fertility]) : null,
    },
    {
      key: 'ph',
      label: t('detail.usdaPh'),
      value:
        typeof record.phMin === 'number' && typeof record.phMax === 'number'
          ? `pH ${record.phMin}–${record.phMax}`
          : null,
    },
    {
      key: 'temp',
      label: t('detail.usdaTempMin'),
      value:
        typeof record.tempMinF === 'number'
          ? dual(`${toCelsius(record.tempMinF)} °C`, `${record.tempMinF} °F`)
          : null,
    },
    {
      key: 'shade',
      label: t('detail.usdaShade'),
      value: SHADE_KEY[record.shade] ? t(SHADE_KEY[record.shade]) : null,
    },
    {
      key: 'root',
      label: t('detail.usdaRootDepth'),
      value:
        typeof record.rootMinIn === 'number'
          ? dual(`${toCm(record.rootMinIn)} cm`, `${record.rootMinIn} in`)
          : null,
    },
    {
      key: 'bloom',
      label: t('detail.usdaBloom'),
      // Sem latitude, `season` e null e a linha some inteira - ver o cabecalho.
      value: season
        ? BLOOM_PART_KEY[record.bloomPart]
          ? t(BLOOM_PART_KEY[record.bloomPart], { season: t('detail.season.' + season) })
          : t('detail.season.' + season)
        : null,
    },
  ].filter((r) => r.value && (!hideFertility || r.key !== 'fertility'));

  // Registro que existe mas nao rende linha nenhuma (o unico caso real: so
  // tem floracao, e a latitude nao resolveu) volta pro grupo em vez de sumir -
  // a mesma regra do fallback, aplicada uma camada abaixo.
  if (rows.length === 0) return groupCard();

  return (
    <SectionCard icon="flask-outline" title={t('detail.speciesCareSection')} color={accent}>
      {!!entityName && (
        <Text style={styles.entityScope}>{t('common.identified')}: {entityName}</Text>
      )}
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.row, i > 0 && styles.divider]}>
          <Text style={styles.label} numberOfLines={2}>
            {r.label}
          </Text>
          {/* alignItems flex-end e nao textAlign right: o alinhamento relativo
              espelha sozinho no arabe, mesma solucao do CareConditions. */}
          <View style={styles.valueBox}>
            <Text style={styles.value} numberOfLines={1}>
              {r.value}
            </Text>
            {!!r.sub && (
              <Text style={styles.sub} numberOfLines={1}>
                {r.sub}
              </Text>
            )}
          </View>
        </View>
      ))}

      {/* A linha que separa este card de todo o resto da tela: aqui o numero e
          DA ESPECIE, e diz qual. */}
      <Text style={styles.footer}>{t('detail.speciesCareNote', { species: scientific })}</Text>
      {!!record.source && (
        <Text style={styles.source}>{t('detail.speciesCareSource', { citation: record.source })}</Text>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  entityScope: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  valueBox: { flex: 1, alignItems: 'flex-end' },
  value: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  advice: { fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  footer: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 12,
    fontStyle: 'italic',
  },
  source: { fontSize: 10.5, lineHeight: 15, color: colors.textMuted, marginTop: 6 },
});
