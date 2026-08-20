import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from './theme';

// REGUA DE FAIXA - o primeiro componente de DADO VISUAL do app (auditoria de
// diagramacao 20/08: todo numero real do vendor virava ou texto corrido ou um
// icone repetido N vezes; nada mostrava a POSICAO do valor DENTRO de uma
// escala, que e a unica coisa que um medidor precisa dizer).
//
// Trilho horizontal com 3 TIPOS de zona - ideal / aceitavel / inadequado -
// espelhados em torno da faixa da especie (bad | ok | IDEAL | ok | bad: 3 cores,
// 5 segmentos), marcador na faixa, ticks nas pontas e legenda de 3 bolinhas.
// Puro RN: View com flexDirection row e largura em %, zero SVG, zero lib nova.
//
// HONESTIDADE (a mesma regra do resto do manual): o unico dado real que entra e
// [idealMin, idealMax] - a faixa da especie. A margem "aceitavel" NAO e um
// numero inventado sobre a especie: e derivada mecanicamente da largura da
// propria faixa (metade dela de cada lado), do mesmo jeito para toda especie.
//
// FALLBACK: sem escala real (min/max) ou sem faixa real o componente devolve
// null - o bloco nao renderiza, nunca um card vazio. Uma escala inventada para
// "poder desenhar alguma coisa" seria exatamente o fato inventado que a
// doutrina proibe.
//
// props: { min, max, idealMin, idealMax, unit?, labels?: {ideal, ok, bad}, accent? }

// ponytail: faixa pontual (idealMin === idealMax, largura 0) nao tem de onde
// tirar a metade, entao ganha um ombro fixo de 10% do trilho. Se algum dia uma
// escala precisar de tolerancia propria, isso vira uma prop okPad.
const PAD_FALLBACK = 0.1;
// Faixa pontual nao tem largura para desenhar. Ganha uma largura MINIMA DE
// RENDER de 4% do trilho, centrada no valor - isso e tinta, nao dado: o
// marcador continua fincado no valor exato.
const MIN_IDEAL_W = 0.04;
const KINDS = ['ideal', 'ok', 'bad'];

const finite = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// "2" e nao "2.0"; "7.5" continua "7.5". Sem unidade, sufixo vazio.
function fmt(v, unit) {
  const n = Math.round(v * 10) / 10;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}${unit}`;
}

export default function RangeBar({
  min,
  max,
  idealMin,
  idealMax,
  unit = '',
  labels = {},
  accent = colors.accent,
}) {
  const a = finite(min);
  const b = finite(max);
  const p1 = finite(idealMin);
  const p2 = finite(idealMax);
  // So um dos dois lados da faixa basta: vira uma faixa pontual.
  const lo0 = p1 != null ? p1 : p2;
  const hi0 = p2 != null ? p2 : p1;
  if (a == null || b == null || b <= a || lo0 == null || hi0 == null) return null;

  const span = b - a;
  const clamp = (v) => Math.min(b, Math.max(a, v));
  const pct = (v) => ((clamp(v) - a) / span) * 100;

  // O ombro sai da faixa CRUA, antes de qualquer corte no trilho. Cortar
  // primeiro encolhia a tolerancia justamente nas pontas da escala: uma
  // especie no passo 1 de 3 ficava com meio ombro e o "inadequado" comecava em
  // 1.75 em vez de 2 - a regua dizia mais do que o dado.
  const rawLo = Math.min(lo0, hi0);
  const rawHi = Math.max(lo0, hi0);
  const pad = (rawHi - rawLo) / 2 || span * PAD_FALLBACK;
  const grow = rawHi === rawLo ? (span * MIN_IDEAL_W) / 2 : 0;
  const lo = rawLo - grow;
  const hi = rawHi + grow;

  // Fronteiras em ordem; cada par consecutivo e um segmento. Tudo passa por
  // clamp(), entao uma faixa colada na ponta simplesmente zera o segmento de
  // fora em vez de estourar o trilho.
  const stops = [a, lo - pad, lo, hi, hi + pad, b];
  const kinds = ['bad', 'ok', 'ideal', 'ok', 'bad'];
  const zoneColor = { ideal: accent, ok: colors.warning + 'AA', bad: colors.error + '4D' };

  const segments = kinds
    .map((kind, i) => ({ kind, w: Math.max(0, pct(stops[i + 1]) - pct(stops[i])) }))
    .filter((s) => s.w > 0);

  // Bolinha de uma zona que nao aparece no trilho seria legenda mentindo
  // (numa escala de 3 passos com a especie no meio nao existe zona inadequada).
  const widthOf = (kind) => segments.reduce((sum, s) => (s.kind === kind ? sum + s.w : sum), 0);
  const legend = KINDS.filter((k) => labels[k] && widthOf(k) > 0.5);

  return (
    <View>
      {/* Decoracao pura: o valor ja esta escrito em texto acima do trilho. */}
      <View style={styles.trackWrap} accessibilityElementsHidden={true}>
        <View style={styles.track}>
          {segments.map((s, i) => (
            <View key={i} style={{ width: `${s.w}%`, backgroundColor: zoneColor[s.kind] }} />
          ))}
        </View>
        {/* No meio do que se VE da faixa: uma faixa que estoura a ponta da
            escala fincaria o marcador fora do trilho. */}
        <View
          style={[styles.marker, { left: `${pct((clamp(lo) + clamp(hi)) / 2)}%` }]}
          pointerEvents="none"
        />
      </View>

      <View style={styles.ticks}>
        <Text style={styles.tick}>{fmt(a, unit)}</Text>
        <Text style={styles.tick}>{fmt(b, unit)}</Text>
      </View>

      {legend.length > 0 && (
        <View style={styles.legend}>
          {legend.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: zoneColor[k] }]} />
              <Text style={styles.legendText}>{labels[k]}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // O marcador sobe 4px acima do trilho, entao o wrapper reserva a folga em vez
  // de deixar ele encostar no que vem por cima.
  trackWrap: { paddingVertical: 5 },
  track: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  marker: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: 20,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  tick: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.textMuted },
});
