import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '../components/theme';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import HelpfulRow from '../components/HelpfulRow';
import RangeBar from '../components/RangeBar';
import ExpandableText from '../components/ExpandableText';
import { splitSentences } from '../components/sentences';
import { getTopicManual, manualKeyFor } from '../components/manualContent';
import { getGroupTopic } from '../components/groupContent';

// The species MANUAL, diagrammed like the competitor's (studied frame by
// frame from the owner's 6-minute video) instead of "um monte de texto em
// abas" - his exact complaint about v1. Every tab now has the same editorial
// skeleton the competitor repeats: illustration band -> Needs block (icon +
// real short value + range ruler when the data is structured) -> lightbulb tip ->
// the vendor's real text as a lead sentence plus scannable bullet points ->
// per-tab feedback. Honesty split: the VALUES and the ADVICE text are the
// vendor's real, translated data; the illustration and the one-line tip are
// our own editorial chrome (generic to the TOPIC, never claims about the
// species).
//
// params: { title, accent, category, topics:[{key,label,text,shortValue?,level?}], initialKey }
//   level: 1..3 watering intensity (real data - the raw Kindwise watering
//   field). Drawn as the RangeBar ruler since 20/08 - it replaced the 3-drop
//   gauge, which encoded the same number with no scale around it.

const TOPIC_META = {
  watering: { icon: 'water', tip: 'detail.tipWatering', art: require('../assets/topics/watering.jpg') },
  light: { icon: 'sunny', tip: 'detail.tipLight', art: require('../assets/topics/light.jpg') },
  soil: { icon: 'layers', tip: 'detail.tipSoil', art: require('../assets/topics/soil.jpg') },
  safety: { icon: 'shield-half', tip: 'detail.tipSafety', art: require('../assets/topics/safety.jpg') },
  uses: { icon: 'flask', tip: 'detail.tipUses', art: require('../assets/topics/uses.jpg') },
  cultural: { icon: 'book', tip: 'detail.tipCultural', art: require('../assets/topics/cultural.jpg') },
  edible: { icon: 'restaurant', tip: 'detail.tipEdible', art: require('../assets/topics/edible.jpg') },
  propagation: { icon: 'git-branch', tip: 'detail.tipPropagation', art: require('../assets/topics/propagation.jpg') },
  role: { icon: 'leaf', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  confusas: { icon: 'eye', tip: 'detail.tipSafety', art: require('../assets/topics/safety.jpg') },
  overview: { icon: 'document-text', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
};

// Splits the vendor prose into a lead sentence and scannable bullets - a
// faithful REFORMAT (same words, same order), never a rewrite.
function splitAdvice(text) {
  const sentences = splitSentences(String(text));
  if (sentences.length <= 2) return { lead: sentences.join(' '), bullets: [] };
  return { lead: sentences[0], bullets: sentences.slice(1) };
}

export default function CareTopicsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, i18n } = useTranslation();
  const i18nLang = i18n.language;
  // initialProblem: indice do acordeao de problemas que deve abrir ja aberto,
  // usado pelo carrossel "Problemas Comuns" da tela de resultado - paridade
  // 120% (video do concorrente, 20/08). Ausente = comportamento de sempre.
  const { title, accent = colors.accent, category = 'plant', topics = [], initialKey, initialProblem, groupKey } = route.params || {};

  const valid = topics.filter((tp) => tp && tp.key && tp.text);
  const [activeKey, setActiveKey] = useState(
    valid.some((tp) => tp.key === initialKey) ? initialKey : valid[0]?.key
  );
  const active = valid.find((tp) => tp.key === activeKey);
  const meta = TOPIC_META[activeKey] || {};
  const bodyRef = useRef(null);

  useEffect(() => {
    if (initialKey && valid.some((tp) => tp.key === initialKey)) setActiveKey(initialKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const selectTab = (key) => {
    setActiveKey(key);
    sectionY.current = {}; // aba nova, alturas antigas nao valem mais
    bodyRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Auditoria de diagramacao 20/08, correcao 14: as abas cortavam no meio
  // ("Usos Co") sem nenhum sinal de que havia mais - a barra parecia um bug de
  // texto, nao uma lista rolavel. O fade na borda direita e o sinal; ele some
  // quando ja se chegou ao fim, senao vira enfeite permanente e mente sobre
  // ter conteudo escondido.
  const tabsBox = useRef({ view: 0, content: 0, x: 0 });
  const [tabsFade, setTabsFade] = useState(false);
  const measureTabs = (patch) => {
    Object.assign(tabsBox.current, patch);
    const { view, content, x } = tabsBox.current;
    setTabsFade(view > 0 && content - x - view > 4);
  };

  const advice = active ? splitAdvice(active.text) : { lead: '', bullets: [] };

  // O MIOLO IMENSO (manual editorial por topico, {lang}-manual.json): os
  // conselhos fundamentais, o checklist e os problemas em acordeao que dao a
  // aba a profundidade do concorrente. Pre-escrito nos 17 idiomas e servido
  // estatico (CDN) - nada e gerado por usuario, e por isso escala. null = a
  // aba mostra so o texto da especie, nunca um erro.
  const [manual, setManual] = useState(null);
  // Primeiro acordeao ABERTO: um acordeao fechado que ninguem toca e
  // conteudo invisivel - foi assim que o manual inteiro passou
  // despercebido.
  // Chegando pelo carrossel de Problemas Comuns, o acordeao aberto e AQUELE
  // (paridade 120%, video do concorrente, 20/08) - abrir o primeiro faria o
  // toque no card "Excesso de rega" cair em "Falta de rega".
  const [openProblem, setOpenProblem] = useState(initialProblem || 0);
  // Camada POR TIPO: o que muda de grupo para grupo (suculenta rega diferente
  // de frutifera; polinizador se observa diferente de praga). Vem do
  // {lang}-groups.json quando a taxonomia da especie cai num grupo conhecido;
  // null = a aba mostra so o universal, sem buraco visivel.
  const [groupManual, setGroupManual] = useState(null);
  useEffect(() => {
    let alive = true;
    setManual(null);
    // Trocou de aba, o acordeao volta ao primeiro; na aba que veio pelo deep
    // link ele mantem o problema pedido.
    setOpenProblem(activeKey === initialKey ? initialProblem || 0 : 0);
    const manualKey = manualKeyFor(activeKey);
    setGroupManual(null);
    getTopicManual(manualKey, i18nLang).then((m) => {
      if (alive) setManual(m);
    });
    getGroupTopic(groupKey, manualKey, i18nLang).then((g) => {
      if (alive) setGroupManual(g);
    });
    return () => { alive = false; };
  }, [activeKey, i18nLang, groupKey, initialKey, initialProblem]);

  // Chips do indice - so o que a aba REALMENTE tem.
  //
  // Auditoria de diagramacao 20/08, correcao 13: eram <View> decorativos. Um
  // indice que nao leva a lugar nenhum e pior que nenhum indice - o usuario
  // toca, nada acontece, e ele conclui que a tela esta quebrada. Agora cada
  // chip rola ate a secao.
  //
  // Este bloco tambem estava ACIMA dos useState de `manual`/`groupManual` e
  // lia as duas variaveis: TDZ (`Cannot access 'manual' before
  // initialization`), ou seja, a tela lancava a cada render. Ficar depois dos
  // hooks e o que faz os chips existirem de verdade.
  const sectionChips = [
    { key: 'about', icon: 'document-text-outline', label: t('detail.aboutSpecies'), has: !!active?.text },
    { key: 'group', icon: 'pricetag-outline', label: groupManual?.label, has: !!(groupManual?.advice?.length || groupManual?.checklist?.length) },
    { key: 'fund', icon: 'school-outline', label: t('detail.fundamentals'), has: !!manual?.advice?.length },
    { key: 'check', icon: 'checkmark-done-outline', label: t('detail.checklistLabel'), has: !!manual?.checklist?.length },
    { key: 'prob', icon: 'alert-circle-outline', label: t('detail.problemsLabel'), has: !!manual?.problems?.length },
  ].filter((c) => c.has && c.label);

  // Como o chip acha a secao. Duas medidas, e as duas sao precisas:
  //
  //  1. measureLayout contra getInnerViewNode() - medido NA HORA do toque, e
  //     por isso imune ao "Ver mais" de um card acima ter empurrado tudo para
  //     baixo depois. Existe nos dois lados: no RN-web o usePlatformMethods
  //     pendura measureLayout no node e o ScrollView expoe getInnerViewNode.
  //  2. o y guardado no onLayout, so como rede: se a medida 1 nao existir no
  //     ambiente, o chip ainda rola (para o lugar de quando montou) em vez de
  //     virar de novo um enfeite que nao faz nada.
  //
  // O onLayout do RN-web e ResizeObserver: dispara na montagem e quando a
  // secao MUDA DE TAMANHO, nunca quando so foi empurrada - dai a medida 1
  // mandar.
  const sectionY = useRef({});
  const sectionNodes = useRef({});
  const scrollToY = (y) => bodyRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  // Deep link do carrossel de Problemas Comuns (paridade 120%, video do
  // concorrente, 20/08): abrir o acordeao certo nao basta se ele nasce fora da
  // dobra - o toque pareceria nao ter feito nada, a mesma armadilha dos chips
  // decorativos da correcao 13. O onLayout da secao e o unico momento em que
  // ela ja existe e ja foi medida; rolar antes disso mede um no que nao
  // renderizou. Uma vez so, senao o usuario perde o controle do scroll.
  const pendingProblemScroll = useRef(typeof initialProblem === 'number');
  const sectionProps = (key) => ({
    ref: (node) => {
      sectionNodes.current[key] = node;
    },
    onLayout: (e) => {
      sectionY.current[key] = e.nativeEvent.layout.y;
      if (key === 'prob' && pendingProblemScroll.current) {
        pendingProblemScroll.current = false;
        scrollToY(e.nativeEvent.layout.y);
      }
    },
  });
  const goToSection = (key) => {
    const node = sectionNodes.current[key];
    const inner = bodyRef.current?.getInnerViewNode?.();
    if (node?.measureLayout && inner) {
      node.measureLayout(inner, (x, y) => scrollToY(y), () => {});
      return;
    }
    const cached = sectionY.current[key];
    if (typeof cached === 'number') scrollToY(cached);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas: first child, pointerEvents none inside. */}
      <NatureScene accent={accent} />

      <TopBar title={title || ''} onBack={() => navigation.goBack()} />

      {/* Tab bar horizontal rolavel - underline curto na ativa. */}
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          onLayout={(e) => measureTabs({ view: e.nativeEvent.layout.width })}
          onContentSizeChange={(w) => measureTabs({ content: w })}
          onScroll={(e) => measureTabs({ x: e.nativeEvent.contentOffset.x })}
          scrollEventThrottle={16}
        >
          {valid.map((tp) => {
            const isActive = tp.key === activeKey;
            return (
              <TouchableOpacity
                key={tp.key}
                style={styles.tab}
                onPress={() => selectTab(tp.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tp.label}
              >
                <Text style={[styles.tabText, isActive && { color: accent }]}>{tp.label}</Text>
                <View style={[styles.tabUnderline, isActive && { backgroundColor: accent }]} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {tabsFade && (
          <LinearGradient
            colors={['transparent', colors.sky]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.tabsFade}
            pointerEvents="none"
          />
        )}
      </View>

      <ScrollView ref={bodyRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Banda de ilustracao full-bleed com fade pro fundo - a ancora
            cenica da aba (arte propria por TOPICO, nunca fato de especie). */}
        {!!meta.art && (
          <View style={styles.artBand}>
            <Image source={meta.art} style={styles.artImg} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', colors.background]}
              style={styles.artFade}
              pointerEvents="none"
            />
          </View>
        )}

        {!!active && (
          <>
            {/* NECESSIDADES - o dado curto real em destaque, com a REGUA DE
                FAIXA quando a intensidade de rega existe (dado estruturado do
                vendor, nao invencao).

                Auditoria de diagramacao 20/08: a regua SUBSTITUI o medidor de
                3 gotas em vez de conviver com ele. Sao o MESMO dado (level
                1..3) e repetir um dado em duas codificacoes dentro do mesmo
                card e redundancia, nao reforco - o diretor de arte leria as
                gotas como enfeite. E a regua diz estritamente mais: as gotas
                davam a CONTAGEM ("2 de 3") sem nenhuma referencia, a regua da
                a POSICAO da faixa dentro da escala inteira, com o que sobra de
                cada lado. A escala continua sendo a mesma 1..3 do vendor. */}
            <View style={styles.needsCard}>
              <View style={styles.needsRow}>
                <View style={[styles.needsIcon, { backgroundColor: accent + '22' }]}>
                  <Ionicons name={meta.icon || 'leaf'} size={22} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.needsLabel}>{t('detail.needsLabel')}</Text>
                  <Text style={[styles.needsValue, { color: accent }]} numberOfLines={2}>
                    {active.shortValue || active.label}
                  </Text>
                </View>
              </View>

              {/* A faixa da especie e o proprio passo dela na escala
                  (level +/- meio passo); a margem aceitavel sai daquela
                  largura dentro da RangeBar, nunca de um numero inventado
                  sobre a especie. Sem level (ou fora de 1..3) o bloco
                  simplesmente nao existe. */}
              {activeKey === 'watering' && active.level >= 1 && active.level <= 3 && (
                <View style={styles.needsRuler}>
                  <RangeBar
                    min={1}
                    max={3}
                    idealMin={active.level - 0.5}
                    idealMax={active.level + 0.5}
                    accent={accent}
                    labels={{
                      ideal: t('detail.rangeIdeal'),
                      ok: t('detail.rangeOk'),
                      bad: t('detail.rangeBad'),
                    }}
                  />
                </View>
              )}
            </View>

            {/* Indice da aba: o que existe abaixo, antes de rolar. Sem isso o
                manual inteiro ficava invisivel sob a dobra. */}
            {sectionChips.length > 0 && (
              <View style={styles.chipsRow}>
                {sectionChips.map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.sectionChip, { borderColor: accent + '55' }]}
                    onPress={() => goToSection(c.key)}
                    activeOpacity={0.7}
                    // "button", nao "link": o RN-web transforma role=link num
                    // <a> sem href, que nao recebe foco de teclado.
                    accessibilityRole="button"
                    accessibilityLabel={c.label}
                  >
                    <Ionicons name={c.icon} size={13} color={accent} />
                    <Text style={[styles.sectionChipText, { color: accent }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Dica com lampada - editorial nosso, generico ao topico. */}
            {!!meta.tip && (
              <View style={styles.tipBox}>
                <Ionicons name="bulb" size={18} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tipLabel}>{t('detail.tipLabel')}</Text>
                  <Text style={styles.tipText}>{t(meta.tip)}</Text>
                </View>
              </View>
            )}

            {/* O texto REAL do vendor, reformatado fielmente: frase-lider +
                bullets escaneaveis (mesmas palavras, mesma ordem).
                Auditoria de diagramacao 20/08: a frase-lider abre sozinha e os
                bullets vem no "Ver mais" - nenhuma palavra foi cortada, so
                dobrada. */}
            <View style={styles.adviceCard} {...sectionProps('about')}>
              <Text style={styles.adviceTitle}>{t('detail.aboutSpecies')}</Text>
              <ExpandableText accent={accent}>
                {!!advice.lead && <Text style={styles.lead}>{advice.lead}</Text>}
                {advice.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: accent }]} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </ExpandableText>
            </View>
          </>
        )}

        {/* POR TIPO - o que muda neste grupo (suculentas, frutiferas,
            polinizadores...). Vem antes do universal: o especifico manda. */}
        {(groupManual?.advice?.length > 0 || groupManual?.checklist?.length > 0) && (
          <View style={[styles.adviceCard, { borderColor: accent + '55' }]} {...sectionProps('group')}>
            <View style={styles.groupHead}>
              <Ionicons name="pricetag" size={15} color={accent} />
              <Text style={[styles.groupLabel, { color: accent }]}>{groupManual.label}</Text>
            </View>
            {(groupManual.advice || []).map((para, i) => (
              <Text key={i} style={styles.body}>
                {para}
              </Text>
            ))}
            {(groupManual.checklist || []).map((item, i) => (
              <View key={'c' + i} style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={17} color={accent} />
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {/* CONSELHOS FUNDAMENTAIS - o manual editorial profundo.
            Auditoria de diagramacao 20/08: eram ~24 linhas corridas e tudo o
            que vinha depois (checklist, problemas) morria sob a dobra. Primeiro
            paragrafo aberto, o resto no "Ver mais". */}
        {manual?.advice?.length > 0 && (
          <View style={styles.adviceCard} {...sectionProps('fund')}>
            <Text style={styles.adviceTitle}>{t('detail.fundamentals')}</Text>
            <ExpandableText accent={accent}>
              {manual.advice.map((para, i) => (
                <Text key={i} style={styles.body}>
                  {para}
                </Text>
              ))}
            </ExpandableText>
          </View>
        )}

        {/* ANTES DE COMECAR - checklist com check. */}
        {manual?.checklist?.length > 0 && (
          <View style={styles.adviceCard} {...sectionProps('check')}>
            <Text style={styles.adviceTitle}>{t('detail.checklistLabel')}</Text>
            {manual.checklist.map((item, i) => (
              <View key={i} style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={17} color={accent} />
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {/* SINAIS DE PROBLEMAS - acordeoes (titulo fechado; sintomas +
            solucoes numeradas ao expandir), dispositivo do concorrente. */}
        {manual?.problems?.length > 0 && (
          <View style={styles.adviceCard} {...sectionProps('prob')}>
            <Text style={styles.adviceTitle}>{t('detail.problemsLabel')}</Text>
            {manual.problems.map((prob, i) => {
              const open = openProblem === i;
              return (
                <View key={i} style={styles.problemBlock}>
                  <TouchableOpacity
                    style={styles.problemHead}
                    onPress={() => setOpenProblem(open ? null : i)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={prob.title}
                  >
                    <Ionicons name="alert-circle-outline" size={17} color={colors.warning} />
                    <Text style={styles.problemTitle}>{prob.title}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                  {open && (
                    <View style={styles.problemBody}>
                      {(prob.symptoms || []).map((sy, j) => (
                        <View key={j} style={styles.bulletRow}>
                          <View style={[styles.bulletDot, { backgroundColor: colors.warning }]} />
                          <Text style={styles.bulletText}>{sy}</Text>
                        </View>
                      ))}
                      {prob.solutions?.length > 0 && (
                        <>
                          <Text style={styles.solutionsLabel}>{t('detail.solutionsLabel')}</Text>
                          {prob.solutions.map((sol, j) => (
                            <View key={j} style={styles.bulletRow}>
                              <Text style={[styles.solutionNum, { color: accent }]}>{j + 1}.</Text>
                              <Text style={styles.bulletText}>{sol}</Text>
                            </View>
                          ))}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <HelpfulRow category={category} context={`topic:${activeKey}`} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsWrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  // Fade da borda direita das abas. colors.sky (nao background) porque e o
  // tom que o NatureScene pinta no ALTO da tela - fundir com o fundo errado
  // deixaria uma faixa visivel.
  tabsFade: { position: 'absolute', right: 0, top: 0, bottom: 1, width: 34 },
  tabsContent: { paddingHorizontal: 12, gap: 4 },
  tab: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 0, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textMuted, paddingBottom: 8 },
  tabUnderline: { height: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  artBand: { marginHorizontal: -20, height: 120, marginBottom: 12 },
  artImg: { width: '100%', height: '100%' },
  artFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  // Vira COLUNA: a linha icone+valor continua igual, a regua entra embaixo
  // ocupando a largura toda do card (auditoria de diagramacao 20/08).
  needsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  needsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  needsRuler: { marginTop: 14 },
  needsIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  needsValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.warning + '14',
    borderColor: colors.warning + '3C',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  tipLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tipText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  adviceCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 12,
  },
  adviceTitle: { fontSize: 16.5, fontWeight: '800', color: colors.text, marginBottom: 10 },
  lead: { fontSize: 15, lineHeight: 23, color: colors.text, marginBottom: 12 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  body: { fontSize: 14, lineHeight: 22, color: colors.textSecondary, marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  checkText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  problemBlock: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  problemTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },
  problemBody: { paddingBottom: 12 },
  solutionsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
  },
  solutionNum: { fontSize: 14, fontWeight: '800', width: 20 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionChipText: { fontSize: 11.5, fontWeight: '700', maxWidth: 150 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  groupLabel: { fontSize: 12.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});
