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
import { getTopicManual } from '../components/manualContent';

// The species MANUAL, diagrammed like the competitor's (studied frame by
// frame from the owner's 6-minute video) instead of "um monte de texto em
// abas" - his exact complaint about v1. Every tab now has the same editorial
// skeleton the competitor repeats: illustration band -> Needs block (icon +
// real short value + gauge when the data is structured) -> lightbulb tip ->
// the vendor's real text as a lead sentence plus scannable bullet points ->
// per-tab feedback. Honesty split: the VALUES and the ADVICE text are the
// vendor's real, translated data; the illustration and the one-line tip are
// our own editorial chrome (generic to the TOPIC, never claims about the
// species).
//
// params: { title, accent, category, topics:[{key,label,text,shortValue?,level?}], initialKey }
//   level: 1..3 watering intensity (real data - the raw Kindwise watering
//   field), drawn as the 3-drop gauge.

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
  const sentences = String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 2) return { lead: sentences.join(' '), bullets: [] };
  return { lead: sentences[0], bullets: sentences.slice(1) };
}

export default function CareTopicsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, i18n } = useTranslation();
  const i18nLang = i18n.language;
  const { title, accent = colors.accent, category = 'plant', topics = [], initialKey } = route.params || {};

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
    bodyRef.current?.scrollTo({ y: 0, animated: false });
  };

  const advice = active ? splitAdvice(active.text) : { lead: '', bullets: [] };

  // O MIOLO IMENSO (manual editorial por topico, {lang}-manual.json): os
  // conselhos fundamentais, o checklist e os problemas em acordeao que dao a
  // aba a profundidade do concorrente. Pre-escrito nos 17 idiomas e servido
  // estatico (CDN) - nada e gerado por usuario, e por isso escala. null = a
  // aba mostra so o texto da especie, nunca um erro.
  const [manual, setManual] = useState(null);
  const [openProblem, setOpenProblem] = useState(null);
  useEffect(() => {
    let alive = true;
    setManual(null);
    setOpenProblem(null);
    const manualKey = activeKey === 'confusas' ? 'safety' : activeKey === 'overview' ? 'role' : activeKey;
    getTopicManual(manualKey, i18nLang).then((m) => {
      if (alive) setManual(m);
    });
    return () => { alive = false; };
  }, [activeKey, i18nLang]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas: first child, pointerEvents none inside. */}
      <NatureScene accent={accent} />

      <TopBar title={title || ''} onBack={() => navigation.goBack()} />

      {/* Tab bar horizontal rolavel - underline curto na ativa. */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
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
            {/* NECESSIDADES - o dado curto real em destaque, com o medidor de
                3 gotas quando a intensidade de rega existe (dado estruturado
                do vendor, nao invencao). */}
            <View style={styles.needsCard}>
              <View style={[styles.needsIcon, { backgroundColor: accent + '22' }]}>
                <Ionicons name={meta.icon || 'leaf'} size={22} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.needsLabel}>{t('detail.needsLabel')}</Text>
                <Text style={[styles.needsValue, { color: accent }]} numberOfLines={2}>
                  {active.shortValue || active.label}
                </Text>
              </View>
              {!!active.level && (
                <View style={styles.gauge} accessibilityElementsHidden={true}>
                  {[1, 2, 3].map((n) => (
                    <Ionicons
                      key={n}
                      name="water"
                      size={18}
                      color={n <= active.level ? accent : colors.border}
                    />
                  ))}
                </View>
              )}
            </View>

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
                bullets escaneaveis (mesmas palavras, mesma ordem). */}
            <View style={styles.adviceCard}>
              <Text style={styles.adviceTitle}>{t('detail.aboutSpecies')}</Text>
              {!!advice.lead && <Text style={styles.lead}>{advice.lead}</Text>}
              {advice.bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: accent }]} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* CONSELHOS FUNDAMENTAIS - o manual editorial profundo. */}
        {manual?.advice?.length > 0 && (
          <View style={styles.adviceCard}>
            <Text style={styles.adviceTitle}>{t('detail.fundamentals')}</Text>
            {manual.advice.map((para, i) => (
              <Text key={i} style={styles.body}>
                {para}
              </Text>
            ))}
          </View>
        )}

        {/* ANTES DE COMECAR - checklist com check. */}
        {manual?.checklist?.length > 0 && (
          <View style={styles.adviceCard}>
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
          <View style={styles.adviceCard}>
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
  tabsContent: { paddingHorizontal: 12, gap: 4 },
  tab: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 0, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textMuted, paddingBottom: 8 },
  tabUnderline: { height: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  artBand: { marginHorizontal: -20, height: 148, marginBottom: 14 },
  artImg: { width: '100%', height: '100%' },
  artFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  needsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
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
  gauge: { flexDirection: 'row', gap: 2 },
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
});
