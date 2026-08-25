import React, { useState, useRef, useEffect } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
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
import { canonicalTopicKey } from '../components/topicKey';
import { useSpeciesTopicState } from '../components/speciesTopicResource';

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
  details: { icon: 'finger-print', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  evidence: { icon: 'pulse' },
  diet: { icon: 'restaurant', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  environment: { icon: 'water', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  habitat: { icon: 'earth', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  reproduction: { icon: 'egg', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  lifeCycle: { icon: 'hourglass', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  lifeStages: { icon: 'repeat', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  plantAssociations: { icon: 'leaf', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  conservation: { icon: 'shield-checkmark', tip: 'detail.tipSafety', art: require('../assets/topics/safety.jpg') },
  phenology: { icon: 'calendar', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  cultivation: { icon: 'analytics', tip: 'detail.tipSoil', art: require('../assets/topics/soil.jpg') },
  substrate: { icon: 'layers', tip: 'detail.tipEcology', art: require('../assets/topics/soil.jpg') },
  behavior: { icon: 'footsteps', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  migration: { icon: 'navigate', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  vocalization: { icon: 'musical-notes', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  frequencyTiming: { icon: 'options', tip: 'detail.tipEcology', art: require('../assets/topics/ecology.jpg') },
  // Curiosidade so aparece em ave e som, e nao tem verbete equivalente em
  // {lang}-manual.json - por isso ganha entrada propria em vez de apelido:
  // arte e dica sim, manual nao. Inventar um verbete de curiosidade seria
  // conteudo nosso fingindo ser do manual.
  curiosity: { icon: 'sparkles', tip: 'detail.tipCultural', art: require('../assets/topics/cultural.jpg') },
};

// O manual universal foi escrito para plantas. Fauna, fungos e lavoura usam
// apenas o dossie curado do grupo; misturar os dois fazia uma ave receber
// sintomas de planta invasora e um peixe receber conselho de fitoterapia.
const UNIVERSAL_MANUAL_CATEGORIES = new Set(['plant', 'tree']);
const EMPTY_TOPICS = Object.freeze([]);
const WIKIPEDIA_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

function wikipediaHistoryUrl(articleUrl) {
  const match = String(articleUrl || '').match(
    /^(https:\/\/[a-z-]+\.wikipedia\.org)\/wiki\/([^?#]+)(?:[?#].*)?$/
  );
  if (!match) return null;
  return `${match[1]}/w/index.php?title=${match[2]}&action=history`;
}

// Splits the vendor prose into a lead sentence and scannable bullets - a
// faithful REFORMAT (same words, same order), never a rewrite.
function splitAdvice(text) {
  const sentences = splitSentences(String(text));
  if (sentences.length <= 2) return { lead: sentences.join(' '), bullets: [] };
  return { lead: sentences[0], bullets: sentences.slice(1) };
}

function formatEvidenceNumber(language, value, suffix) {
  let number = String(value);
  try {
    number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  } catch (error) {
    // O valor continua verificavel; o sufixo e uma unidade cientifica, nao prosa inglesa.
  }
  return `${number}${suffix ? ` ${suffix}` : ''}`;
}

function LarvalStageProfile({ profile, accent, language, t }) {
  if (!profile?.scientific || !Number.isInteger(profile.larvalInstars) || !profile.source?.url) {
    return null;
  }
  const larva = t('speciesDossier.lifeStages.larva');
  const instars = Array.from({ length: profile.larvalInstars }, (_, index) => index + 1);
  return (
    <View style={[styles.stageEvidence, { borderColor: accent + '55' }]}>
      <View style={styles.stageEvidenceHead}>
        <View style={[styles.stageEvidenceIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name="repeat-outline" size={18} color={accent} />
        </View>
        <View style={styles.stageEvidenceCopy}>
          <Text style={styles.stageEvidenceTitle}>
            {t('speciesDossier.larvalInstars', { count: profile.larvalInstars })}
          </Text>
          <Text style={styles.stageEvidenceScope}>
            {t('speciesDossier.exactEvidence', { species: profile.scientific })}
          </Text>
        </View>
      </View>

      <View style={styles.instarRail}>
        {instars.map((instar) => (
          <View key={instar} style={[styles.instarChip, { borderColor: accent + '66' }]}>
            <Text style={[styles.instarNumber, { color: accent }]}>{instar}</Text>
            <Text style={styles.instarLabel}>{larva}</Text>
          </View>
        ))}
      </View>

      <View style={styles.stageGroups}>
        {profile.groups.map((group) => (
          <View key={`${group.from}-${group.to}`} style={styles.stageGroup}>
            <Text style={styles.stageGroupTitle}>{larva} {group.from}–{group.to}</Text>
            {Number.isFinite(group.maxLengthMm) && (
              <View style={styles.stageMetric}>
                <Text style={styles.stageMetricLabel}>{t('speciesDossier.bodyLength')}</Text>
                <Text style={[styles.stageMetricValue, { color: accent }]}>
                  ≤ {formatEvidenceNumber(language, group.maxLengthMm, 'mm')}
                </Text>
              </View>
            )}
            {Number.isFinite(group.leafConsumptionPercent) && (
              <View style={styles.stageMetric}>
                <Text style={styles.stageMetricLabel}>{t('speciesDossier.leafConsumption')}</Text>
                <Text style={[styles.stageMetricValue, { color: accent }]}>
                  {formatEvidenceNumber(language, group.leafConsumptionPercent, '%')}
                </Text>
              </View>
            )}
            {Number.isFinite(group.leafAreaCm2?.min) && Number.isFinite(group.leafAreaCm2?.max) && (
              <View style={styles.stageMetric}>
                <Text style={styles.stageMetricLabel}>{t('speciesDossier.leafAreaPerLarva')}</Text>
                <Text style={[styles.stageMetricValue, { color: accent }]}>
                  {formatEvidenceNumber(language, group.leafAreaCm2.min)}–
                  {formatEvidenceNumber(language, group.leafAreaCm2.max, 'cm²')}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.sourceLink}
        onPress={() => Linking.openURL(profile.source.url)}
        activeOpacity={0.8}
        accessibilityRole="link"
        accessibilityLabel={t('detail.speciesCareSource', { citation: profile.source.label })}
      >
        <Ionicons name="open-outline" size={15} color={accent} />
        <Text style={[styles.sourceLinkText, { color: accent }]}>
          {t('detail.speciesCareSource', { citation: profile.source.label })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function OrderStageProfile({ profile, accent, t }) {
  if (!profile?.order || !Array.isArray(profile.stages) || !profile.stages.length || !profile.source?.url) {
    return null;
  }
  return (
    <View style={[styles.stageEvidence, { borderColor: accent + '55' }]}>
      <View style={styles.stageEvidenceHead}>
        <View style={[styles.stageEvidenceIcon, { backgroundColor: accent + '1F' }]}>
          <Ionicons name="repeat-outline" size={18} color={accent} />
        </View>
        <View style={styles.stageEvidenceCopy}>
          <Text style={styles.stageEvidenceTitle}>{t('speciesDossier.lifeStagesTitle')}</Text>
          <Text style={styles.stageEvidenceScope}>{t('detail.order')}: {profile.order}</Text>
        </View>
      </View>

      <Text style={styles.orderStageNote}>{t('detail.generalGuideNote')}</Text>
      <View style={styles.instarRail}>
        {profile.stages.map((stage, index) => (
          <React.Fragment key={stage}>
            <View style={[styles.orderStageChip, { borderColor: accent + '66' }]}>
              <Text style={[styles.orderStageNumber, { color: accent }]}>{index + 1}</Text>
              <Text style={styles.instarLabel}>{t(`speciesDossier.lifeStages.${stage}`)}</Text>
            </View>
            {index < profile.stages.length - 1 ? (
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
            ) : null}
          </React.Fragment>
        ))}
      </View>

      <TouchableOpacity
        style={styles.sourceLink}
        onPress={() => Linking.openURL(profile.source.url)}
        activeOpacity={0.8}
        accessibilityRole="link"
        accessibilityLabel={t('detail.speciesCareSource', { citation: profile.source.label })}
      >
        <Ionicons name="open-outline" size={15} color={accent} />
        <Text style={[styles.sourceLinkText, { color: accent }]}>
          {t('detail.speciesCareSource', { citation: profile.source.label })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CareTopicsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, i18n } = useTranslation();
  const i18nLang = i18n.language;
  // initialProblem: indice do acordeao de problemas que deve abrir ja aberto,
  // usado pelo carrossel "Problemas Comuns" da tela de resultado - paridade
  // 120% (video do concorrente, 20/08). Ausente = comportamento de sempre.
  const {
    title,
    accent = colors.accent,
    category = 'plant',
    topics: routeTopics,
    topicsLoading: routeTopicsLoading = false,
    topicResourceKey,
    initialKey,
    initialProblem,
    groupKey,
  } = route.params || {};
  const { topics, loading: topicsLoading } = useSpeciesTopicState(
    topicResourceKey,
    Array.isArray(routeTopics) ? routeTopics : EMPTY_TOPICS,
    routeTopicsLoading
  );

  const valid = topics.filter((tp) => tp && tp.key
    && (tp.text || tp.groupOnly || tp.stageProfile || tp.orderStageProfile));
  const [activeKey, setActiveKey] = useState(
    valid.some((tp) => tp.key === initialKey) ? initialKey : valid[0]?.key
  );
  // Quando o manual e aberto durante o enriquecimento, a primeira lista e
  // vazia. Assim que o snapshot completo chega, derive a aba no mesmo render;
  // esperar o effect deixava um quadro com abas visiveis e corpo vazio.
  const resolvedActiveKey = valid.some((tp) => tp.key === activeKey)
    ? activeKey
    : (valid.some((tp) => tp.key === initialKey) ? initialKey : valid[0]?.key);
  const active = valid.find((tp) => tp.key === resolvedActiveKey);
  const canonKey = canonicalTopicKey(resolvedActiveKey);
  const meta = TOPIC_META[resolvedActiveKey] || TOPIC_META[canonKey] || {};
  const bodyRef = useRef(null);

  useEffect(() => {
    setActiveKey((current) => {
      if (initialKey && valid.some((tp) => tp.key === initialKey)) return initialKey;
      if (valid.some((tp) => tp.key === current)) return current;
      return valid[0]?.key;
    });
    // `topics` e parametro de rota: quando muda, a aba antiga pode nao existir.
    // `category` revalida a decisao ao reutilizar esta tela para outro dominio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, topics, category]);

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

  const advice = active?.text ? splitAdvice(active.text) : { lead: '', bullets: [] };
  const activeSources = Array.isArray(active?.sources)
    ? active.sources.filter((source) => (
      source?.id === 'wikipedia'
        && source?.license === 'CC-BY-SA-4.0'
        && /^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(source?.url || '')
    ))
    : [];

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
  // Progresso local de leitura: a pessoa escolhe qual etapa quer abrir e
  // marca o que ja conferiu. Nao e salvo nem vira dado da especie; serve para
  // transformar o manual em uma atividade durante esta visita.
  const [openLessonByTopic, setOpenLessonByTopic] = useState({});
  const [checkedSteps, setCheckedSteps] = useState(() => new Set());
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
    setOpenProblem(resolvedActiveKey === initialKey ? initialProblem || 0 : 0);
    const manualKey = manualKeyFor(canonKey);
    setGroupManual(null);
    if (UNIVERSAL_MANUAL_CATEGORIES.has(category)) {
      getTopicManual(manualKey, i18nLang).then((m) => {
        if (alive) setManual(m);
      });
    }
    getGroupTopic(groupKey, manualKey, i18nLang).then((g) => {
      if (alive) setGroupManual(g);
    });
    return () => { alive = false; };
  }, [resolvedActiveKey, canonKey, i18nLang, groupKey, initialKey, initialProblem, category]);

  const openLesson = Math.min(
    openLessonByTopic[resolvedActiveKey] || 0,
    Math.max(0, (manual?.advice?.length || 1) - 1)
  );
  const stepId = (scope, index) => `${resolvedActiveKey}:${scope}:${index}`;
  const isStepChecked = (scope, index) => checkedSteps.has(stepId(scope, index));
  const toggleStepChecked = (scope, index) => {
    const id = stepId(scope, index);
    setCheckedSteps((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const checkedCount = (scope, items) => (items || []).reduce(
    (total, item, index) => total + (isStepChecked(scope, index) ? 1 : 0),
    0
  );

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
    { key: 'about', icon: 'document-text-outline', label: t('detail.aboutSpecies'), has: !!(active?.text || active?.stageProfile || active?.orderStageProfile) },
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
      <View
        style={styles.tabsWrap}
        accessibilityElementsHidden={topicsLoading}
        importantForAccessibility={topicsLoading ? 'no-hide-descendants' : 'auto'}
      >
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
            const isActive = tp.key === resolvedActiveKey;
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

      <ScrollView
        ref={bodyRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        accessibilityElementsHidden={topicsLoading}
        importantForAccessibility={topicsLoading ? 'no-hide-descendants' : 'auto'}
      >
        {/* As artes atuais mostram casa, vaso e cultivo vegetal. Em fauna,
            fungos e lavoura elas mudariam o dominio visual antes do aviso de
            escopo; ate existir arte propria por categoria, ficam so em planta
            e arvore, o mesmo limite do manual universal. */}
        {UNIVERSAL_MANUAL_CATEGORIES.has(category) && !!meta.art && (
          <View style={styles.artBand}>
            <Image source={meta.art} style={styles.artImg} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', colors.background]}
              style={styles.artFade}
              pointerEvents="none"
            />
            {!!active?.label && (
              <View style={styles.artLabel}>
                <View style={[styles.artLabelIcon, { backgroundColor: accent }]}>
                  <Ionicons name={meta.icon || 'leaf'} size={17} color={colors.white} />
                </View>
                <Text style={styles.artLabelText} numberOfLines={2}>{active.label}</Text>
              </View>
            )}
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
            {!!active.shortValue && (
              <View style={styles.needsCard}>
                <View style={styles.needsRow}>
                  <View style={[styles.needsIcon, { backgroundColor: accent + '22' }]}>
                    <Ionicons name={meta.icon || 'leaf'} size={22} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.needsLabel}>{t('detail.needsLabel')}</Text>
                    <Text style={[styles.needsValue, { color: accent }]} numberOfLines={2}>
                      {active.shortValue}
                    </Text>
                  </View>
                </View>

                {/* A faixa da especie e o proprio passo dela na escala
                    (level +/- meio passo); a margem aceitavel sai daquela
                    largura dentro da RangeBar, nunca de um numero inventado
                    sobre a especie. Sem level (ou fora de 1..3) o bloco
                    simplesmente nao existe. */}
                {resolvedActiveKey === 'watering' && active.level >= 1 && active.level <= 3 && (
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
            )}

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
            {!!meta.tip && !active.groupOnly && !active.stageProfile && !active.orderStageProfile && (
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
            {!!active.stageProfile && (
              <View {...sectionProps('about')}>
                <LarvalStageProfile
                  profile={active.stageProfile}
                  accent={accent}
                  language={i18nLang}
                  t={t}
                />
              </View>
            )}
            {!!active.orderStageProfile && !active.stageProfile && (
              <View {...sectionProps('about')}>
                <OrderStageProfile
                  profile={active.orderStageProfile}
                  accent={accent}
                  t={t}
                />
              </View>
            )}
            {!!active.text && !active.stageProfile && !active.orderStageProfile && (
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
                {activeSources.map((source) => {
                  const historyUrl = wikipediaHistoryUrl(source.url);
                  return (
                    <View key={source.url} style={styles.wikipediaAttribution}>
                      <Text style={styles.wikipediaNotice}>
                        {t('detail.wikipediaExcerptNotice')}
                      </Text>
                      <TouchableOpacity
                        style={styles.wikipediaLink}
                        onPress={() => Linking.openURL(source.url).catch(() => {})}
                        activeOpacity={0.8}
                        accessibilityRole="link"
                        accessibilityLabel={t('detail.wikipediaArticleLink')}
                      >
                        <Ionicons name="document-text-outline" size={15} color={accent} />
                        <Text style={[styles.sourceLinkText, { color: accent }]}>
                          {t('detail.wikipediaArticleLink')}
                        </Text>
                        <Ionicons name="open-outline" size={14} color={accent} />
                      </TouchableOpacity>
                      {!!historyUrl && (
                        <TouchableOpacity
                          style={styles.wikipediaLink}
                          onPress={() => Linking.openURL(historyUrl).catch(() => {})}
                          activeOpacity={0.8}
                          accessibilityRole="link"
                          accessibilityLabel={t('detail.wikipediaAuthorsLink')}
                        >
                          <Ionicons name="people-outline" size={15} color={accent} />
                          <Text style={[styles.sourceLinkText, { color: accent }]}>
                            {t('detail.wikipediaAuthorsLink')}
                          </Text>
                          <Ionicons name="open-outline" size={14} color={accent} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.wikipediaLink}
                        onPress={() => Linking.openURL(WIKIPEDIA_LICENSE_URL).catch(() => {})}
                        activeOpacity={0.8}
                        accessibilityRole="link"
                        accessibilityLabel={t('detail.wikipediaLicenseLink')}
                      >
                        <Ionicons name="ribbon-outline" size={15} color={accent} />
                        <Text style={[styles.sourceLinkText, { color: accent }]}>
                          {t('detail.wikipediaLicenseLink')}
                        </Text>
                        <Ionicons name="open-outline" size={14} color={accent} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
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
            {!!title && (
              <Text style={styles.groupEntity}>{t('common.identified')}: {title}</Text>
            )}
            <Text style={styles.groupNote}>
              {t('detail.groupGuideNote', { group: groupManual.label })}
            </Text>
            {(groupManual.advice || []).map((para, i) => (
              <Text key={i} style={styles.body}>
                {para}
              </Text>
            ))}
            {(groupManual.checklist || []).map((item, i) => (
              <TouchableOpacity
                key={'c' + i}
                style={[
                  styles.checkButton,
                  isStepChecked('group', i) && { backgroundColor: accent + '0D' },
                ]}
                onPress={() => toggleStepChecked('group', i)}
                activeOpacity={0.75}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isStepChecked('group', i) }}
                accessibilityLabel={item}
              >
                <Ionicons
                  name={isStepChecked('group', i) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={21}
                  color={isStepChecked('group', i) ? accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.checkText,
                    isStepChecked('group', i) && styles.checkTextDone,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
            {(groupManual.sources || []).map((source) => (
              <TouchableOpacity
                key={source.url}
                style={styles.sourceLink}
                onPress={() => Linking.openURL(source.url)}
                activeOpacity={0.8}
                accessibilityRole="link"
                accessibilityLabel={t('detail.speciesCareSource', { citation: source.label })}
              >
                <Ionicons name="open-outline" size={15} color={accent} />
                <Text style={[styles.sourceLinkText, { color: accent }]}>
                  {t('detail.speciesCareSource', { citation: source.label })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* CONSELHOS FUNDAMENTAIS - o manual editorial profundo.
            Auditoria de diagramacao 20/08: eram ~24 linhas corridas e tudo o
            que vinha depois (checklist, problemas) morria sob a dobra. Primeiro
            paragrafo aberto, o resto no "Ver mais". */}
        {manual?.advice?.length > 0 && (
          <View style={styles.adviceCard} {...sectionProps('fund')}>
            <View style={styles.learningHeader}>
              <View style={[styles.learningHeaderIcon, { backgroundColor: accent + '1F' }]}>
                <Ionicons name="school-outline" size={18} color={accent} />
              </View>
              <Text style={[styles.adviceTitle, styles.learningHeaderTitle]}>
                {t('detail.fundamentals')}
              </Text>
              <Text style={[styles.learningCounter, { color: accent }]}>
                {openLesson + 1}/{manual.advice.length}
              </Text>
            </View>

            <View
              style={styles.lessonProgress}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 1, max: manual.advice.length, now: openLesson + 1 }}
            >
              {manual.advice.map((para, i) => (
                <View
                  key={`progress-${i}`}
                  style={[
                    styles.lessonProgressSegment,
                    { backgroundColor: i <= openLesson ? accent : colors.border },
                  ]}
                />
              ))}
            </View>

            <View style={styles.lessonList}>
              {manual.advice.map((para, i) => {
                const expanded = openLesson === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.lessonStep,
                      expanded && { borderColor: accent + '88', backgroundColor: accent + '0D' },
                    ]}
                    onPress={() => setOpenLessonByTopic((current) => ({ ...current, [resolvedActiveKey]: i }))}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={para}
                  >
                    <View style={[styles.lessonNumber, { backgroundColor: expanded ? accent : accent + '1F' }]}>
                      <Text style={[styles.lessonNumberText, { color: expanded ? colors.white : accent }]}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text
                      style={[styles.lessonText, expanded && styles.lessonTextExpanded]}
                      numberOfLines={expanded ? undefined : 2}
                    >
                      {para}
                    </Text>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={17}
                      color={expanded ? accent : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ANTES DE COMECAR - checklist com check. */}
        {manual?.checklist?.length > 0 && (
          <View style={styles.adviceCard} {...sectionProps('check')}>
            <View style={styles.learningHeader}>
              <View style={[styles.learningHeaderIcon, { backgroundColor: accent + '1F' }]}>
                <Ionicons name="checkmark-done-outline" size={18} color={accent} />
              </View>
              <Text style={[styles.adviceTitle, styles.learningHeaderTitle]}>
                {t('detail.checklistLabel')}
              </Text>
              <Text style={[styles.learningCounter, { color: accent }]}>
                {checkedCount('manual', manual.checklist)}/{manual.checklist.length}
              </Text>
            </View>
            <View style={styles.checkProgressTrack}>
              <View
                style={[
                  styles.checkProgressFill,
                  {
                    width: `${(checkedCount('manual', manual.checklist) / manual.checklist.length) * 100}%`,
                    backgroundColor: accent,
                  },
                ]}
              />
            </View>
            {manual.checklist.map((item, i) => {
              const checked = isStepChecked('manual', i);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.checkButton, checked && { backgroundColor: accent + '0D' }]}
                  onPress={() => toggleStepChecked('manual', i)}
                  activeOpacity={0.75}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={item}
                >
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={21}
                    color={checked ? accent : colors.textMuted}
                  />
                  <Text style={[styles.checkText, checked && styles.checkTextDone]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
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

        {!topicsLoading && active
          ? <HelpfulRow category={category} context={`topic:${resolvedActiveKey}`} />
          : null}
      </ScrollView>

      {topicsLoading ? (
        <View style={styles.loadingOverlay} accessibilityRole="progressbar">
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 54,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '800' },
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
  artBand: { marginHorizontal: -20, height: 156, marginBottom: 12, overflow: 'hidden' },
  artImg: { width: '100%', height: '100%' },
  artFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  artLabel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: colors.background + 'E8',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  artLabelIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artLabelText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
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
  stageEvidence: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  stageEvidenceHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageEvidenceIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageEvidenceCopy: { flex: 1 },
  stageEvidenceTitle: { color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: '900' },
  stageEvidenceScope: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  orderStageNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 12 },
  instarRail: { flexDirection: 'row', gap: 6, marginTop: 14 },
  instarChip: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 7,
    backgroundColor: colors.background,
  },
  instarNumber: { fontSize: 15, lineHeight: 18, fontWeight: '900' },
  instarLabel: { color: colors.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  orderStageChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 3,
    backgroundColor: colors.background,
  },
  orderStageNumber: { fontSize: 14, lineHeight: 17, fontWeight: '900' },
  stageGroups: { gap: 8, marginTop: 12 },
  stageGroup: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.background,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  stageGroupTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900', marginBottom: 3 },
  stageMetric: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageMetricLabel: { flex: 1, color: colors.textSecondary, fontSize: 11.5, lineHeight: 16 },
  stageMetricValue: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  learningHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  learningHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learningHeaderTitle: { flex: 1, marginBottom: 0 },
  learningCounter: { fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  lessonProgress: { flexDirection: 'row', gap: 5, marginTop: 4, marginBottom: 10 },
  lessonProgressSegment: { flex: 1, height: 4, borderRadius: 2 },
  lessonList: { gap: 8 },
  lessonStep: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  lessonNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonNumberText: { fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  lessonText: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  lessonTextExpanded: { color: colors.text, lineHeight: 21 },
  checkProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 3,
    marginBottom: 8,
  },
  checkProgressFill: { height: '100%', borderRadius: 3 },
  checkButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 11,
  },
  checkTextDone: { color: colors.text, fontWeight: '700' },
  lead: { fontSize: 15, lineHeight: 23, color: colors.text, marginBottom: 12 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  body: { fontSize: 14, lineHeight: 22, color: colors.textSecondary, marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  checkText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  sourceLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 12,
  },
  sourceLinkText: { flex: 1, fontSize: 12.5, fontWeight: '800' },
  wikipediaAttribution: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 12,
    gap: 2,
  },
  wikipediaNotice: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  wikipediaLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  groupEntity: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', marginBottom: 4 },
  groupNote: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
});
