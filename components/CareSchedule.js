import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import { colors } from './theme';
import { getGroupSchedule } from './scheduleContent';
import { getGroups } from './groupContent';
import { getCareLatitude, subscribeCareRegion } from './careRegion';

// CRONOGRAMA DE CUIDADO POR ESTACAO - paridade 120% (video do concorrente,
// 20/08). O concorrente mostra uma tabela mes a mes de fertilizacao. Esta e a
// mesma ideia levada um passo adiante em duas frentes:
//
//   1. ESTACAO, NAO MES. Uma tabela que diz "adubar de marco a novembro" esta
//      errada para metade do planeta. O corpus ja carregava essa licao
//      (luz.md: "No hemisferio sul, inverte-se"), entao aqui a coluna e a
//      ESTACAO e o destaque de "agora" e derivado do mes MAIS a latitude.
//   2. HONESTIDADE. O cronograma e do GRUPO (suculenta, samambaia, orquidea),
//      nao da especie - e o rodape diz isso com todas as letras. O concorrente
//      apresenta a tabela dele como se fosse da especie na tela.
//
// Sem dado, nada renderiza: sem grupo, sem linhas no {lang}-schedule.json, ou
// grupo sem cronograma sustentado pelo corpus (aves, peixes, insetos, fungos e
// as duas lavouras comerciais, que decidem por CONTAGEM e tensao de solo e nao
// por calendario) -> null.

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// Mes do calendario -> estacao no hemisferio NORTE. Toda fonte do corpus
// (Clemson, RHS, Penn State, Iowa State, UConn, Illinois, USDA) escreve em
// meses do norte, entao esta e a tabela de traducao de volta para estacao.
const NORTHERN = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
];

/**
 * @param {number} month 0-11, como Date#getMonth
 * @param {number|null} latitude
 * @returns {string|null} chave da estacao, ou null quando nao da para saber
 */
export function seasonForMonth(month, latitude) {
  if (typeof month !== 'number' || month < 0 || month > 11) return null;
  if (typeof latitude !== 'number' || !isFinite(latitude)) return null;
  // ponytail: o sinal da latitude basta. Perto do equador nao existe ciclo de
  // quatro estacoes de verdade - se um dia isso incomodar, o degrau seguinte e
  // esconder o destaque entre -10 e +10 de latitude, nao inventar uma quinta
  // estacao.
  return latitude < 0 ? NORTHERN[(month + 6) % 12] : NORTHERN[month];
}

export function currentSeasonActions(rows, season) {
  if (!Array.isArray(rows) || !SEASONS.includes(season)) return [];
  return rows
    .filter((row) => row?.activity && typeof row[season] === 'string' && row[season].trim())
    .map((row) => ({ activity: row.activity, value: row[season].trim() }));
}

export default function CareSchedule({
  groupKey,
  entityName,
  hideFertilizing = false,
  accent = colors.accent,
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState(null);
  const [groupLabel, setGroupLabel] = useState(null);
  // undefined = ainda resolvendo a latitude; null = resolvido SEM latitude
  // (nenhuma coluna destacada, e o rodape explica o porque). A distincao evita
  // que a nota "sem localizacao" pisque enquanto o fix ainda esta chegando.
  const [current, setCurrent] = useState(undefined);

  useEffect(() => {
    let alive = true;
    if (!groupKey) {
      setRows(null);
      return undefined;
    }
    const lang = i18n.language;
    getGroupSchedule(groupKey, lang).then((r) => {
      if (alive) setRows(r);
    });
    getGroups(lang).then((g) => {
      if (alive) setGroupLabel(g?.[groupKey]?.label || null);
    });
    return () => {
      alive = false;
    };
  }, [groupKey, i18n.language]);

  useEffect(() => {
    let alive = true;
    // No APK nao ha permissao de localizacao. A regiao manual conserva a
    // estacao correta sem coletar coordenada; no modo automatico, a web ainda
    // usa a localizacao aproximada existente. Sem nenhum dos dois, nenhuma
    // coluna ganha destaque.
    const resolve = () => getCareLatitude().then((latitude) => {
      if (alive) setCurrent(seasonForMonth(new Date().getMonth(), latitude));
    });
    resolve();
    const unsubscribe = subscribeCareRegion(resolve);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!rows) return null;

  // The dedicated nutrition card owns the fertilizing row on botanical result
  // screens. Keeping it out of this general calendar avoids showing the same
  // group guidance twice in Expert mode while preserving every other task.
  const visibleRows = hideFertilizing
    ? rows.filter((row) => row?.activityKey !== 'fertilizing')
    : rows;
  if (visibleRows.length === 0) return null;

  const notes = visibleRows.filter((r) => r && r.note);
  const actionsNow = currentSeasonActions(visibleRows, current);

  return (
    <SectionCard icon="calendar-outline" title={t('detail.scheduleSection')} color={accent}>
      {!!entityName && (
        <Text style={styles.entityScope}>{t('common.identified')}: {entityName}</Text>
      )}
      {actionsNow.length > 0 && (
        <View style={[styles.nowBlock, { borderColor: accent + '55', backgroundColor: accent + '12' }]}>
          <Text style={[styles.nowTitle, { color: accent }]}>
            {t('detail.season.' + current)} · {t('detail.scheduleNow')}
          </Text>
          {actionsNow.map((action) => (
            <View key={action.activity} style={styles.nowRow}>
              <Text style={styles.nowActivity}>{action.activity}</Text>
              <Text style={styles.nowValue}>{action.value}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.table}>
        <View style={styles.headRow}>
          <Text style={[styles.cell, styles.activityCell, styles.headText]} numberOfLines={2}>
            {t('detail.scheduleActivity')}
          </Text>
          {SEASONS.map((s) => {
            const now = s === current;
            return (
              <View
                key={s}
                style={[styles.cell, styles.seasonCell, now && { backgroundColor: accent + '26' }]}
              >
                <Text style={[styles.headText, now && { color: accent }]} numberOfLines={2}>
                  {t('detail.season.' + s)}
                </Text>
                {now && <Text style={[styles.nowText, { color: accent }]}>{t('detail.scheduleNow')}</Text>}
              </View>
            );
          })}
        </View>

        {visibleRows.map((row, i) => (
          <View key={row.activity || i} style={styles.row}>
            <Text style={[styles.cell, styles.activityCell, styles.activityText]}>{row.activity}</Text>
            {SEASONS.map((s) => {
              const now = s === current;
              return (
                <Text
                  key={s}
                  style={[
                    styles.cell,
                    styles.seasonCell,
                    styles.valueText,
                    now && { backgroundColor: accent + '14', color: colors.text },
                  ]}
                >
                  {row[s] ? row[s] : '—'}
                </Text>
              );
            })}
          </View>
        ))}
      </View>

      {notes.map((row, i) => (
        <Text key={row.activity || i} style={styles.note}>
          <Text style={styles.noteLabel}>{row.activity}: </Text>
          {row.note}
        </Text>
      ))}

      {/* Rodape - a linha que o concorrente nao escreve. */}
      <Text style={styles.footer}>
        {groupLabel
          ? t('detail.scheduleGroupNote', { group: groupLabel })
          : t('detail.scheduleGroupNoteShort')}
      </Text>
      {current === null && <Text style={styles.footer}>{t('detail.scheduleNoLocation')}</Text>}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  entityScope: {
    color: colors.text,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  nowBlock: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  nowTitle: { fontSize: 11, fontWeight: '800', marginBottom: 7 },
  nowRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  nowActivity: { flex: 1, fontSize: 11.5, fontWeight: '700', color: colors.text },
  nowValue: { flex: 1.4, fontSize: 11.5, lineHeight: 15, color: colors.textSecondary },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cell: {
    paddingVertical: 7,
    paddingHorizontal: 5,
  },
  activityCell: {
    flex: 1.15,
  },
  seasonCell: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  headText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  nowText: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  activityText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  valueText: {
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 10,
  },
  noteLabel: {
    fontWeight: '700',
    color: colors.textSecondary,
  },
  footer: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 12,
    fontStyle: 'italic',
  },
});

/**
 * Uma checagem rodavel para a UNICA logica de verdade deste arquivo: a
 * derivacao da estacao a partir do mes E do hemisferio.
 *
 *   node -e "import('./components/CareSchedule.js').then(m => console.log(m.selfCheck()))"
 */
export function selfCheck() {
  const eq = (got, want, msg) => {
    if (got !== want) throw new Error(`${msg}: expected ${want}, got ${got}`);
  };

  // Norte: janeiro e inverno, julho e verao.
  eq(seasonForMonth(0, 40), 'winter', 'jan north');
  eq(seasonForMonth(6, 40), 'summer', 'jul north');
  eq(seasonForMonth(3, 51.5), 'spring', 'apr north');
  eq(seasonForMonth(9, 51.5), 'autumn', 'oct north');

  // Sul: exatamente invertido - o bug que a regra do hemisferio existe para
  // impedir (adubar "de marco a novembro" no Brasil e conselho errado).
  eq(seasonForMonth(0, -23.5), 'summer', 'jan south');
  eq(seasonForMonth(6, -23.5), 'winter', 'jul south');
  eq(seasonForMonth(3, -33.9), 'autumn', 'apr south');
  eq(seasonForMonth(9, -33.9), 'spring', 'oct south');

  // Todo mes do norte tem o oposto exato no sul.
  const opposite = { spring: 'autumn', autumn: 'spring', summer: 'winter', winter: 'summer' };
  for (let m = 0; m < 12; m += 1) {
    eq(seasonForMonth(m, -10), opposite[seasonForMonth(m, 10)], 'mirror month ' + m);
  }

  // Sem latitude, nenhuma estacao - nunca um palpite.
  eq(seasonForMonth(5, null), null, 'no latitude');
  eq(seasonForMonth(5, undefined), null, 'undefined latitude');
  eq(seasonForMonth(5, NaN), null, 'NaN latitude');
  eq(seasonForMonth(null, 40), null, 'no month');
  eq(seasonForMonth(12, 40), null, 'month out of range');

  return 'CareSchedule: all checks passed';
}
