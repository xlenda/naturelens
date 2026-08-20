import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PlantHero from '../components/PlantHero';
import DiseaseReport from '../components/DiseaseReport';
import { colors } from '../components/theme';
import { getCollection, saveToCollection, removeFromCollection } from '../components/storage';
import { CATEGORIES } from '../components/categories';
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
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import Pronounce from '../components/Pronounce';
import TopBar, { TopBarIcon } from '../components/TopBar';

export default function CropDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.crop;
  const { t } = useTranslation();
  const disease = plant.disease;
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
        // Save-mission credit (idempotent - see components/missions.js). This
        // screen was the one the first wiring pass missed - caught by the Fable
        // review: a user who only used the Crops tab could never complete a
        // save mission.
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

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.crop.label'));
  };

  // Hub do resultado (video do concorrente): leituras longas viram cards-porta
  // pro manual (CareTopics) em vez de prosa empilhada. O relatorio de doenca
  // fica inline - e acao, nao leitura. A entidade crop de hoje so carrega o
  // relatorio, entao estes topicos so existem se os campos vierem um dia:
  // sem material, nada renderiza (regra de fallback do hub).
  const joinField = (v) => (Array.isArray(v) ? v.join('\n\n') : v);
  const TOPICS = [
    { key: 'overview', label: t('common.overview'), icon: 'document-text-outline', color: colors.info, text: joinField(plant.overview) },
    { key: 'commonUses', label: t('detail.commonUsesSection'), icon: 'construct-outline', color: colors.info, text: joinField(plant.commonUses) },
    { key: 'cultural', label: t('detail.culturalSignificanceSection'), icon: 'earth-outline', color: colors.purple, text: joinField(plant.culturalSignificance) },
    { key: 'edibleParts', label: t('detail.edibleParts'), icon: 'restaurant-outline', color: colors.accent, text: joinField(plant.edibleParts) },
    { key: 'propagation', label: t('detail.propagation'), icon: 'git-branch-outline', color: colors.accent, text: joinField(plant.propagationMethods) },
  ].filter((tp) => !!tp.text);

  const openTopic = (key) =>
    navigation.navigate('CareTopics', {
      title: plant.name,
      accent: meta.accent,
      category: 'crop',
      topics: TOPICS,
      initialKey: key,
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the container keeps its own backgroundColor
          underneath - the scene paints over it, never replaces it. */}
      <NatureScene accent={meta.accent} />

      {/* Shared TopBar: same icons, labels and handlers as the hand-rolled bar
          it replaces - one component, one truth. */}
      <TopBar
        title={t('detail.cropHealthReportTitle')}
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
            {/* Hub do resultado (video do concorrente): falante ao lado do
                cientifico + nomes populares como linha discreta. */}
            {!!plant.scientific && (
              <View style={styles.sciRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {!!plant.commonNames && (
              <Text style={styles.commonNames}>
                {t('detail.commonNames')}: {Array.isArray(plant.commonNames) ? plant.commonNames.join(', ') : plant.commonNames}
              </Text>
            )}
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>{t('detail.cropMatch')}</Text>
            <Text style={styles.confidenceValue}>{plant.confidence}%</Text>
          </View>
        </View>

        <View style={[styles.typePill, { backgroundColor: meta.accent + '22' }]}>
          <CategoryIcon
            name={meta.tabIcon}
            size={13}
            color={meta.accent}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.typePillText, { color: meta.accent }]}>{t('detail.cropPill')}</Text>
        </View>

        {/* Zona de cor: the health report - the reason the screen exists - is
            the one full-bleed band here, a shade above the page. ZoneBand is a
            pure wrapper (order and content untouched), and DiseaseReport always
            renders something: the healthy card when there is no disease. */}
        <ZoneBand gutter={20}>
          <DiseaseReport disease={disease} />

          {/* Hub do resultado (video do concorrente): cada leitura longa e um
              card-porta que abre o manual da especie na aba certa. */}
          {TOPICS.map((tp) => (
            <TouchableOpacity
              key={tp.key}
              style={styles.doorCard}
              onPress={() => openTopic(tp.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={tp.label}
            >
              <View style={[styles.doorIcon, { backgroundColor: tp.color + '22' }]}>
                <Ionicons name={tp.icon} size={16} color={tp.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doorLabel}>{tp.label}</Text>
                <Text style={styles.doorPreview} numberOfLines={1}>
                  {tp.text}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ZoneBand>

        {/* Gancho da especialista (hub do resultado): a pergunta ja sai com o
            contexto da especie, do jeito que BotanistScreen.route.params.context
            espera. */}
        <TouchableOpacity
          style={styles.specialistCta}
          onPress={() =>
            navigation.navigate('Botanist', {
              context: plant.name + ' (' + (plant.scientific || '') + ')',
            })
          }
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('detail.askSpecialistCta')}
        >
          <Ionicons name="sparkles" size={16} color={meta.accent} />
          <Text style={styles.specialistCtaText}>{t('detail.askSpecialistCta')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Press-scale by OUTER wrapper: the Touchable stays byte for byte
            (a11y, handlers, activeOpacity) - on RN-web an Animated.Value on the
            Touchable's own style would not drive the transform. */}
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

        {/* Hub do resultado (video do concorrente): feedback de utilidade no
            fim do scroll. */}
        <HelpfulRow category="crop" context="result" />
      </ScrollView>

      {/* Hub do resultado (video do concorrente): a barra fixa Nova foto |
          Compartilhar | Salvar substitui o SaveFab; styles.scroll carries
          paddingBottom >= 120 so the bar never covers the last row. "Nova"
          so faz sentido vindo da identificacao - da Colecao, voltar ja e o
          botao de voltar. O bookmark do TopBar permanece. */}
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
  // paddingBottom >= 120: room for the fixed ResultActionBar (doutrina: a bar
  // that hides the last row is the viewport bug in miniature).
  scroll: { padding: 20, paddingBottom: 120 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  sciRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
  commonNames: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  // Cards-porta do hub do resultado (video do concorrente).
  doorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  doorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  doorPreview: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginTop: 10,
  },
  specialistCtaText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.textSecondary },
  confidenceBadge: {
    backgroundColor: colors.accentDark + '33',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  confidenceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  confidenceValue: { fontSize: 18, color: colors.accentLight, fontWeight: '800' },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    marginBottom: 20,
  },
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
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
