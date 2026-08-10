import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BackChevron from '../components/BackChevron';
import * as Haptics from 'expo-haptics';
import { colors, shadow } from '../components/theme';
import CategoryIcon from '../components/CategoryIcon';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';

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
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { topicKey, icon, color } = route.params;
  const [activeSymptom, setActiveSymptom] = useState(null);

  const title = t(`discover.topics.${topicKey}.title`);
  const desc = t(`discover.topics.${topicKey}.desc`);
  const intro = t(`discover.topics.${topicKey}.intro`);
  const species = t(`discover.topics.${topicKey}.species`, { returnObjects: true });

  const isHerbs = topicKey === 'medicinalHerbs';
  // Collections whose species have a curated field-guide entry in
  // {code}-species.json. Listed explicitly rather than inferred, so a new
  // collection without content can never render tappable-but-empty cards.
  const hasSpeciesDetail = topicKey === 'oceanAndRiverFish' || topicKey === 'birdsOfTheWorld';
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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
            <Text style={styles.sectionLabel}>{t('discover.symptomFilterTitle')}</Text>
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
                  accessibilityLabel: t('discover.viewHerbLabel', { name: s.name }),
                }
              : {};
            const card = (
              <CardWrapper key={s.id || i} style={styles.speciesCard} {...wrapperProps}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.speciesName}>{s.name}</Text>
                  <Text style={styles.speciesSci}>{s.sci}</Text>
                  <Text style={styles.speciesNote}>{s.note}</Text>
                </View>
                {isHerbs && (
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
  sectionLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: 34,
    marginBottom: 16,
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
  speciesName: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  speciesSci: { fontSize: 12.5, fontStyle: 'italic', color: colors.textMuted, marginTop: 1, marginBottom: 6 },
  speciesNote: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
});
