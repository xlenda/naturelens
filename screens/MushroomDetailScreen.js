import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import PlantHero from '../components/PlantHero';
import SectionCard from '../components/SectionCard';
import IdentificationExtras from '../components/IdentificationExtras';
import { colors } from '../components/theme';
import { getCollection, saveToCollection, removeFromCollection } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { getSpeciesGroup } from '../components/speciesGroup';
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
import CategoryIcon from '../components/CategoryIcon';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import TopBar, { TopBarIcon } from '../components/TopBar';
import Pronounce from '../components/Pronounce';
import HelpfulRow from '../components/HelpfulRow';
import ResultActionBar from '../components/ResultActionBar';

const EDIBILITY_COLORS = {
  choice: colors.accent,
  edible: colors.accent,
  'edible with caution': colors.warning,
  inedible: colors.warning,
  unknown: colors.textMuted,
  poisonous: colors.error,
  toxic: colors.error,
  deadly: colors.error,
};

function edibilityColor(edibility) {
  if (!edibility) return colors.textMuted;
  return EDIBILITY_COLORS[edibility.toLowerCase()] || colors.warning;
}

export default function MushroomDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.mushroom;
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  useEffect(() => {
    (async () => {
      const list = await getCollection();
      const found = list.find((p) => p.savedId === plant.savedId || p.id === plant.id);
      if (found) {
        setSaved(true);
        setSavedEntryId(found.savedId);
      }
    })();
  }, []);

  const toggleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (saved && savedEntryId) {
      const result = await removeFromCollection(savedEntryId);
      if (result) {
        setSaved(false);
        setSavedEntryId(null);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    } else {
      const entry = await saveToCollection(plant);
      if (entry) {
        // Save-mission credit (idempotent - see components/missions.js).
        recordMissionEvent('save').then((done) => {
          if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
        });
        setSaved(true);
        setSavedEntryId(entry.savedId);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    }
  };

  const edColor = edibilityColor(plant.edibility);
  const infoRows = [{ label: t('common.nativeOrigin'), value: plant.origin }].filter((r) => r.value);

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.mushroom.label'));
  };

  // Hub do resultado (video do concorrente): topicos do manual da especie
  // (CareTopicsScreen) construidos SO dos campos reais que a entidade tem -
  // no cogumelo isso e a lista de confusoes; os banners de seguranca
  // (psicoativo, edibilityNote) continuam inline, a lei do dono.
  const topics = [
    plant.lookAlike?.length > 0 && {
      key: 'confusas',
      label: t('detail.frequentlyConfusedWith'),
      text: '• ' + plant.lookAlike.join('\n• '),
    },
  ].filter(Boolean);

  const openTopic = (initialKey) =>
    navigation.navigate('CareTopics', { groupKey: getSpeciesGroup(plant),
      title: plant.name,
      accent: meta.accent,
      category: 'mushroom',
      topics,
      initialKey,
    });

  // Fatos rapidos (hub do resultado): valor curto HONESTO do proprio campo.
  // Sem topico nenhum nao ha porta para abrir - a grade some junto.
  const quickFacts =
    topics.length === 0
      ? []
      : [
          !!plant.edibility && {
            key: 'edibility',
            icon: 'restaurant-outline',
            color: edColor,
            label: null,
            value: plant.edibility,
          },
          plant.lookAlike?.length > 0 && {
            key: 'confusas',
            icon: 'eye-outline',
            color: colors.warning,
            label: t('detail.frequentlyConfusedWith'),
            value: plant.lookAlike[0],
          },
        ].filter(Boolean);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas (diagramacao-premium): FIRST child of the root,
          pointerEvents none inside the component, and the root keeps its own
          backgroundColor underneath - decoration never steals a touch. */}
      <NatureScene accent={meta.accent} />

      <TopBar
        title={t('detail.profileTitle', { category: t('categories.mushroom.label') })}
        onBack={() => navigation.goBack()}
        right={
          <>
            <TopBarIcon onPress={handleShare} label={t('common.shareThisResult')}>
              <Ionicons name="share-social-outline" size={20} color={colors.text} />
            </TopBarIcon>
            <TopBarIcon
              onPress={toggleSave}
              label={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
            >
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={saved ? meta.accent : colors.text}
              />
            </TopBarIcon>
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PlantHero
          photoUri={plant.photoUri}
          similarImages={plant.similarImages}
          scientific={plant.scientific}
          accent={meta.accent}
          icon={meta.tabIcon}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{plant.name}</Text>
            {/* Hub do resultado (video do concorrente): alto-falante de
                pronuncia colado no nome cientifico. */}
            {!!plant.scientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {!!plant.commonNames && (
              <Text style={styles.commonNamesLine}>
                {t('detail.commonNames')}:{' '}
                {Array.isArray(plant.commonNames) ? plant.commonNames.join(', ') : plant.commonNames}
              </Text>
            )}
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>{t('common.confidence')}</Text>
            <Text style={styles.confidenceValue}>{plant.confidence}%</Text>
          </View>
        </View>

        <View style={styles.pillRow}>
          <View style={[styles.typePill, { backgroundColor: meta.accent + '22' }]}>
            <CategoryIcon
              name={meta.tabIcon}
              size={13}
              color={meta.accent}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={[styles.typePillText, { color: meta.accent }]}>{t('categories.mushroom.label')}</Text>
          </View>
          {!!plant.edibility && (
            <View style={[styles.typePill, { backgroundColor: edColor + '22' }]}>
              <Ionicons
                name="restaurant-outline"
                size={13}
                color={edColor}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
              <Text style={[styles.typePillText, { color: edColor }]}>{plant.edibility}</Text>
            </View>
          )}
        </View>

        {/* Zona de cor (diagramacao-premium): thematic runs of sections live
            in full-bleed bands one shade above the background; the gap between
            bands is the scene showing through. ZoneBand is a pure wrapper -
            the quente-primeiro order stays byte for byte. This first band is
            the whole safety story: psychoactive warning, the always-visible
            edibility note, the identification extras (on mushrooms they ARE
            food safety) and the overview. */}
        <ZoneBand gutter={20}>
        {plant.psychoactive === true && (
          <View style={styles.warningBanner}>
            <Ionicons
              name="alert-circle"
              size={20}
              color={colors.error}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.warningText}>
              {t('detail.psychoactiveWarning')}
            </Text>
          </View>
        )}

        {/* Always-visible food-safety note. The "never eat based on this
            app's result" warning used to live only in Terms and the FAQ -
            places nobody about to cook a find ever reads. It reuses the
            Terms wording verbatim: one source of truth, already translated
            in all 17 languages, and the exact claim a store reviewer looks
            for next to an edibility badge. */}
        <View style={styles.edibilityNote}>
          <Ionicons
            name="warning-outline"
            size={18}
            color={colors.warning}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.edibilityNoteText}>{t('terms.accuracyBody')}</Text>
        </View>

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. This matters more on
            mushrooms than anywhere else in the app: a confidently-stated wrong
            species here is a food-safety problem, not a cosmetic one. */}
        <IdentificationExtras entity={plant} accent={meta.accent} />

        <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
          <Text style={styles.body}>{plant.overview || t('sound.noContentBody')}</Text>
        </SectionCard>
        </ZoneBand>

        {/* Fatos rapidos - hub do resultado (video do concorrente): grade 2
            colunas de cards compactos; cada card navega pro manual da especie
            ja aberto no topico certo. */}
        {quickFacts.length > 0 && (
          <View style={styles.factsWrap}>
            <Text style={styles.factsTitle} accessibilityRole="header">
              {t('detail.quickFacts')}
            </Text>
            <View style={styles.factsGrid}>
              {quickFacts.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={styles.factCard}
                  activeOpacity={0.8}
                  onPress={() => openTopic(f.key)}
                  accessibilityRole="button"
                  accessibilityLabel={f.label || f.value}
                >
                  <Ionicons
                    name={f.icon}
                    size={18}
                    color={f.color}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                  <View style={{ flex: 1 }}>
                    {!!f.label && <Text style={styles.factLabel}>{f.label}</Text>}
                    <Text style={styles.factValue} numberOfLines={2}>{f.value}</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.textMuted}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Look-alike - hub do resultado (video do concorrente): a lista deixa
            a pilha de SectionCards e vira card-porta para o manual. Guarded:
            an empty band would render as a floating pill of nothing. */}
        {plant.lookAlike?.length > 0 && (
          <ZoneBand gutter={20}>
            <TouchableOpacity
              style={styles.doorCard}
              activeOpacity={0.8}
              onPress={() => openTopic('confusas')}
              accessibilityRole="button"
              accessibilityLabel={t('detail.frequentlyConfusedWith')}
            >
              <Ionicons
                name="eye-outline"
                size={18}
                color={colors.warning}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.doorLabel}>{t('detail.frequentlyConfusedWith')}</Text>
                <Text style={styles.doorPreview} numberOfLines={1}>{plant.lookAlike.join(', ')}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </TouchableOpacity>
          </ZoneBand>
        )}

        {/* Ficha/recibo band: the technical rows close the screen as a
            receipt. Guarded like the band above. */}
        {infoRows.length > 0 && (
          <ZoneBand gutter={20}>
            <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
              {infoRows.map((row) => (
                <View key={row.label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              ))}
            </SectionCard>
          </ZoneBand>
        )}

        {/* Gancho da especialista - hub do resultado (video do concorrente):
            leva a duvida pro tab do especialista COM o contexto da especie
            (BotanistScreen le route.params.context). */}
        <TouchableOpacity
          style={styles.specialistCta}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('Botanist', {
              context: plant.name + ' (' + (plant.scientific || '') + ')',
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('detail.askSpecialistCta')}
        >
          <Ionicons
            name="sparkles"
            size={16}
            color={meta.accent}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.specialistText}>{t('detail.askSpecialistCta')}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

        {!!plant.url && (
          <TouchableOpacity
            style={styles.linkBtn}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(plant.url)}
            accessibilityRole="button"
            accessibilityLabel={t('detail.readMoreLabel', { category: t('categories.mushroom.label').toLowerCase() })}
          >
            <Ionicons
              name="globe-outline"
              size={18}
              color={colors.info}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.linkBtnText}>{t('common.readMore')}</Text>
          </TouchableOpacity>
        )}

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium): the
            Touchable stays byte for byte - a11y, labels and handlers intact. */}
        <PressScale>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: meta.accent }, saved && { backgroundColor: meta.accentDark }]}
          onPress={toggleSave}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={saved ? t('common.removeFromCollection') : t('common.saveToCollection')}
        >
          <Ionicons
            name={saved ? 'checkmark-circle' : 'add-circle-outline'}
            size={20}
            color={colors.white}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.saveBtnText}>
            {saved ? t('common.saved') : t('common.save')}
          </Text>
        </TouchableOpacity>
        </PressScale>

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Foi util? - hub do resultado (video do concorrente): fecha o
            scroll medindo a identificacao. */}
        <HelpfulRow category="mushroom" context="result" />
      </ScrollView>

      {/* Barra de acoes fixa - hub do resultado (video do concorrente):
          Nova foto | Compartilhar | Salvar sempre a um toque; substitui o
          SaveFab, e o scroll acima carrega paddingBottom >= 120. "Nova foto"
          so quando a tela veio da identificacao. */}
      <ResultActionBar
        onNew={fromIdentify ? () => navigation.goBack() : null}
        onShare={handleShare}
        onSave={toggleSave}
        saved={saved}
        accent={meta.accent}
      />

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingBottom >= 120: room for the fixed ResultActionBar (viewport law).
  scroll: { padding: 20, paddingBottom: 120 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary },
  scientificRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  commonNamesLine: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  confidenceBadge: {
    backgroundColor: colors.accentDark + '33',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  confidenceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  confidenceValue: { fontSize: 18, color: colors.accentLight, fontWeight: '800' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 16 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: colors.error + '18',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error + '44',
    alignItems: 'flex-start',
  },
  warningText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: '600', marginLeft: 10, lineHeight: 18 },
  edibilityNote: {
    flexDirection: 'row',
    backgroundColor: colors.warning + '14',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.warning + '3C',
    alignItems: 'flex-start',
  },
  edibilityNoteText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, marginLeft: 10, lineHeight: 18 },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  // Hub do resultado (video do concorrente): grade de fatos rapidos,
  // cards-porta e o gancho da especialista.
  factsWrap: { marginBottom: 4 },
  factsTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: {
    flexBasis: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  factLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 2 },
  factValue: { fontSize: 13, fontWeight: '600', color: colors.text, lineHeight: 17 },
  doorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
  },
  doorLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  doorPreview: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  specialistText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13.5 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  linkBtnText: { color: colors.info, fontWeight: '600', marginLeft: 8, fontSize: 14 },
  saveBtn: {
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15, marginLeft: 8 },
});
