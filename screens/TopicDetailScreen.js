import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BackChevron from '../components/BackChevron';
import * as Haptics from 'expo-haptics';
import { colors, shadow } from '../components/theme';
import CategoryIcon from '../components/CategoryIcon';
import FindThumb from '../components/FindThumb';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';

// Quantas linhas ganham foto de cara, e o passo de crescimento do cap conforme
// o scroll avança. 16 cobre a primeira dobra com folga em qualquer viewport.
const PHOTO_CHUNK = 16;

const SYMPTOM_KEYS = [
  'headache',
  'digestion',
  'sleep',
  'stress',
  'immunity',
  'painInflammation',
  'respiratory',
  'skin',
  'energy',
];

export default function TopicDetailScreen({ route }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { topicKey, icon, color } = route.params;
  const [activeSymptom, setActiveSymptom] = useState(null);
  // Performance: esta tela lista até 98 espécies num ScrollView (não FlatList -
  // a ZoneBand embrulha o rótulo da seção e todas as linhas num bloco único, e
  // converter quebraria essa banda). Montar FindThumb com `scientific` em todas
  // dispararia 98 fetches de uma vez, então só as linhas até `photoCap` recebem
  // o nome científico; o cap começa na primeira dobra e cresce com o scroll
  // (onScroll abaixo). O cache do speciesPhoto absorve o re-scroll.
  const [photoCap, setPhotoCap] = useState(PHOTO_CHUNK);

  const title = t(`discover.topics.${topicKey}.title`);
  const desc = t(`discover.topics.${topicKey}.desc`);
  const intro = t(`discover.topics.${topicKey}.intro`);
  const species = t(`discover.topics.${topicKey}.species`, { returnObjects: true });

  const isHerbs = topicKey === 'medicinalHerbs';
  const isCropCollection = topicKey === 'fromFieldToPlate';
  // Collections whose species have a curated field-guide entry in
  // {code}-species.json. Listed explicitly rather than inferred, so a new
  // collection without content can never render tappable-but-empty cards.
  const hasSpeciesDetail =
    topicKey === 'oceanAndRiverFish' ||
    topicKey === 'birdsOfTheWorld' ||
    isCropCollection;
  const visibleSpecies = isHerbs && activeSymptom
    ? species.filter((s) => s.tags?.includes(activeSymptom))
    : species;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: first child of the root, painting over the
          container colour without replacing it and without taking a touch, so
          the collection opens onto the same place the Discover tab sits on. */}
      <NatureScene accent={color} />

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Esta tela entrou no HIDE_DOCK_ON (auditoria 20/08) e o dock era quem
          carregava o respiro de baixo. Com ele fora, os 40px fixos deixam a
          ultima linha embaixo da barra de gestos em aparelho sem botao. */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        // A fração rolada da página ≈ fração das linhas já vistas (a lista
        // domina a altura da página). O erro do cabeçalho sobra pra CIMA, o
        // que só adianta fetches em bloco - nunca deixa uma linha visível sem
        // foto. Bumps em múltiplos de PHOTO_CHUNK limitam os re-renders.
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          if (!contentSize.height) return;
          const seen =
            Math.ceil(
              ((contentOffset.y + layoutMeasurement.height) / contentSize.height) *
                visibleSpecies.length
            ) + PHOTO_CHUNK;
          if (seen > photoCap) setPhotoCap(Math.ceil(seen / PHOTO_CHUNK) * PHOTO_CHUNK);
        }}
        scrollEventThrottle={100}
      >
        {/* Composição centrada: the hero - seal, title, one-line desc - is a
            centred column carrying the collection's own colour through from the
            card that opened it. `intro` stays outside it and left-aligned: a
            centred paragraph is the part of this device that backfires. */}
        <View style={styles.hero}>
          <LinearGradient
            colors={[color + '4D', color + '14']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroIcon}
          >
            <CategoryIcon name={icon} size={32} color={color} />
          </LinearGradient>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{desc}</Text>
        </View>
        <Text style={styles.intro}>{intro}</Text>

        {isHerbs && (
          <>
            <Text style={styles.filterLabel}>{t('discover.symptomFilterTitle')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20, marginBottom: 20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              <TouchableOpacity
                style={[styles.symptomChip, !activeSymptom && { backgroundColor: color, borderColor: color }]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveSymptom(null);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.symptomChipText, !activeSymptom && { color: colors.white }]}>
                  {t('discover.symptomFilterAll')}
                </Text>
              </TouchableOpacity>
              {SYMPTOM_KEYS.map((key) => {
                const active = activeSymptom === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.symptomChip, active && { backgroundColor: color, borderColor: color }]}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setActiveSymptom(active ? null : key);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.symptomChipText, active && { color: colors.white }]}>
                      {t(`discover.symptoms.${key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Zona de cor: the species list - the reason the screen exists - is the
            one band here. The hero and the filter row stay on the scene, so the
            band reads as a change of ground and not as the page background. */}
        <ZoneBand gutter={20}>
          <Text style={styles.sectionLabel}>{t('discover.topicSpeciesSectionTitle')}</Text>

          {isHerbs && visibleSpecies.length === 0 && (
            <Text style={styles.emptyText}>{t('discover.symptomFilterEmpty')}</Text>
          )}

          {visibleSpecies.map((s, i) => {
            // Fish and birds now carry full field-guide entries too (overview,
            // habitat, curiosity), so their cards open a detail screen exactly
            // like the herbs do. Before this, tapping one did nothing at all -
            // a card that looks tappable and isn't reads as a broken app.
            const tappable = (isHerbs || hasSpeciesDetail) && s.id;
            const CardWrapper = tappable ? TouchableOpacity : View;
            const wrapperProps = tappable
              ? {
                  activeOpacity: 0.85,
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (isHerbs) {
                      navigation.navigate('HerbDetail', { herbId: s.id, color });
                    } else if (isCropCollection) {
                      // O catalogo abre a mesma ficha agronomica, mas marca que
                      // nenhuma foto foi analisada. `disease: null` aqui nao e
                      // um atestado de saude e o laudo fica corretamente oculto.
                      navigation.navigate('CropDetail', {
                        plant: {
                          category: 'crop',
                          id: s.id,
                          name: s.name,
                          scientific: s.sci,
                          healthAssessed: false,
                        },
                        fromIdentify: false,
                      });
                    } else {
                      navigation.navigate('FieldGuide', {
                        speciesId: s.id,
                        name: s.name,
                        sci: s.sci,
                        color,
                        icon,
                      });
                    }
                  },
                  accessibilityRole: 'button',
                  accessibilityLabel: t('discover.viewSpeciesLabel', { name: s.name }),
                }
              : {};
            const card = (
              <CardWrapper key={s.id || i} style={styles.speciesCard} {...wrapperProps}>
                {/* Doutrina de diagramação (diagramacao-premium.md, "encha de
                    imagem"): foto REAL ancorando a linha à esquerda como tile
                    arredondado, com o nome/nota existentes servindo de legenda.
                    FindThumb já implementa a cadeia inteira: foto da Wikipedia
                    pelo nome científico (com cache) e, sem foto (offline,
                    espécie sem artigo, linha além do photoCap), o MESMO ícone
                    da coleção - a linha nunca nasce quebrada. */}
                <FindThumb
                  scientific={i < photoCap ? s.sci : null}
                  icon={icon}
                  accent={color}
                  iconSize={24}
                  style={styles.speciesThumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.speciesName}>{s.name}</Text>
                  <Text style={styles.speciesSci}>{s.sci}</Text>
                  <Text style={styles.speciesNote}>{s.note}</Text>
                </View>
                {tappable && (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textMuted}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                )}
              </CardWrapper>
            );
            // Press-scale only where there is a press. PressScale clones its child
            // to attach onPressIn/Out, and a card that is a plain View would carry
            // those handlers for a gesture that never comes.
            return tappable ? <PressScale key={s.id || i}>{card}</PressScale> : card;
          })}
        </ZoneBand>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, marginHorizontal: 8, textAlign: 'center' },
  scroll: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  hero: { alignItems: 'center' },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 6, textAlign: 'center' },
  desc: { fontSize: 14, color: colors.textMuted, marginBottom: 14, textAlign: 'center' },
  intro: { fontSize: 14.5, lineHeight: 22, color: colors.textSecondary, marginBottom: 24 },
  // Composição centrada, com critério: a SECTION title centres and carries
  // weight, while the card text under it stays left-aligned.
  // Only a real SECTION heading gets the big centred treatment. The symptom
  // filter below is a control label, not a section: sharing one style gave the
  // herbs collection two identical 22px centred headings stacked on the same
  // screen, which reads as a rendering fault rather than as hierarchy.
  sectionLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: 34,
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 26,
    marginBottom: 12,
  },
  symptomChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  symptomChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  emptyText: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
  speciesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  speciesThumb: { width: 52, height: 52, borderRadius: 12, marginRight: 12 },
  speciesName: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  speciesSci: { fontSize: 12.5, fontStyle: 'italic', color: colors.textMuted, marginTop: 1, marginBottom: 6 },
  speciesNote: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
});
