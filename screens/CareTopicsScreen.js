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
  const { t } = useTranslation();
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
              <Text style={styles.adviceTitle}>{active.label}</Text>
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
});
