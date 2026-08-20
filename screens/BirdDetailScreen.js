import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
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
import { getCuratedBird } from '../components/curatedBirds';
import { getSpeciesPhoto } from '../components/speciesPhoto';
import { getLocalisedOverview } from '../components/localisedOverview';
import TranslatableText from '../components/TranslatableText';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import SpeciesFaq from '../components/SpeciesFaq';
import ShareSpeciesCard from '../components/ShareSpeciesCard';
import Pronounce from '../components/Pronounce';
import TopBar, { TopBarIcon } from '../components/TopBar';

// Deliberately the thinnest detail screen in the app, because the data behind it
// is genuinely thin: Nyckel's bird classifier returns a label and a confidence
// score and nothing else - no description, no habitat, no range, no photo. There
// is no hidden richer field being ignored here (unlike Fishial, which turned out
// to carry a full species record).
//
// So this screen shows what actually exists and says so, rather than padding the
// layout with empty section cards. If bird content is ever wanted, it has to
// come from a curated database keyed by species name - the same pattern already
// proven by the 98-herb Medicinal Herbs feature - not from this vendor.

// Card-porta do hub do resultado (video do concorrente): a prosa longa da
// secao mora no manual CareTopics; aqui fica a porta - icone, label da
// secao, primeira linha truncada e chevron.
function TopicDoor({ icon, color, label, preview, onPress }) {
  return (
    <TouchableOpacity
      style={styles.doorCard}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.doorIcon, { backgroundColor: color + '22' }]}>
        <Ionicons
          name={icon}
          size={17}
          color={color}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.doorLabel, { color }]}>{label}</Text>
        <Text style={styles.doorPreview} numberOfLines={1}>{preview}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      />
    </TouchableOpacity>
  );
}

export default function BirdDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.bird;
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();
  // Curated field-guide content matched by species name (Nyckel gives us no id
  // we control, so the English label IS the join key - see curatedBirds.js).
  const [curated, setCurated] = useState(null);
  // A reference photograph of the identified species, so the user can compare
  // it against their own shot. Nyckel supplies none, which is what made this
  // the emptiest screen in the app.
  const [photo, setPhoto] = useState(null);
  const [localised, setLocalised] = useState(null);

  useEffect(() => {
    let alive = true;
    getCuratedBird(i18n.language, plant.name).then((c) => {
      if (alive) setCurated(c);
      // The curated entry carries the scientific name; Nyckel's label alone is
      // an English common name, which Wikipedia matches far less reliably.
      const lookup = c?.scientific || plant.scientific || plant.name;
      getSpeciesPhoto(lookup, i18n.language).then((p) => {
        if (alive) setPhoto(p);
      });
      // Only worth fetching when there is no curated text - the curated file is
      // already written in the reader's language and is better than a Wikipedia
      // lead paragraph.
      if (!c) {
        getLocalisedOverview({ scientific: plant.scientific, commonName: plant.name, language: i18n.language })
          .then((r) => {
            if (alive) setLocalised(r);
          });
      }
    });
    return () => {
      alive = false;
    };
  }, [i18n.language, plant.name]);

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

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.bird.label'));
  };

  // Hub do resultado (video do concorrente): os campos curados viram o MANUAL
  // da especie (abas do CareTopics). Construido so de campos que realmente
  // existem, com labels que o app ja carrega - nenhuma chave i18n nova. Menos
  // de dois topicos = nao ha manual que valha a pena abrir, e a tela mantem
  // seus cards inline de sempre (o caminho do placeholder honesto - sem
  // curadoria - nao muda nada).
  const topics = curated
    ? [
        { key: 'overview', label: t('common.overview'), text: curated.overview },
        { key: 'habitat', label: t('fieldGuide.habitat'), text: curated.habitat },
        { key: 'curiosity', label: t('fieldGuide.curiosity'), text: curated.curiosity },
      ].filter((tp) => tp.text)
    : [];
  const hasManual = topics.length >= 2;

  const openTopic = (initialKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('CareTopics', { groupKey: getSpeciesGroup(plant),
      title: plant.name,
      accent: meta.accent,
      category: 'bird',
      topics,
      initialKey,
    });
  };

  // Gancho da especialista (hub do resultado, video do concorrente): leva a
  // especie junto como contexto pro chat do Botanico (tab irmao no App.js).
  const openSpecialist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Botanist', {
      context: plant.name + ' (' + (plant.scientific || '') + ')',
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the container keeps its own backgroundColor
          underneath - the scene paints over it, never replaces it. */}
      <NatureScene accent={meta.accent} />

      {/* Shared TopBar: same icons, labels and handlers as the hand-rolled bar
          it replaces - one component, one truth. */}
      <TopBar
        title={t('detail.profileTitle', { category: t('categories.bird.label') })}
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
            {/* Speaker do concorrente (hub do resultado): ouvir o latim. */}
            {!!plant.scientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>{t('common.confidence')}</Text>
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
          <Text style={[styles.typePillText, { color: meta.accent }]}>
            {t('categories.bird.label')}
          </Text>
        </View>

        {!!photo && (
          <SectionCard icon="images-outline" title={t('identify.referenceImagesTitle')} color={colors.info}>
            <Text style={styles.photoHint}>{t('identify.referenceImagesHint')}</Text>
            {/* Press-scale by OUTER wrapper: the Touchable stays byte for byte. */}
            <PressScale>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => photo.sourceUrl && Linking.openURL(photo.sourceUrl)}
                accessibilityRole="imagebutton"
                accessibilityLabel={plant.name}
              >
                <Image source={{ uri: photo.url }} style={styles.refPhoto} resizeMode="cover" />
                <Text style={styles.photoCredit}>{t('fieldGuide.photoCredit')}</Text>
              </TouchableOpacity>
            </PressScale>
          </SectionCard>
        )}

        {/* Runner-up species and the low-confidence warning. */}
        <IdentificationExtras entity={plant} accent={meta.accent} />

        {/* Auditoria de diagramacao 20/08: a grade de fatos rapidos saiu daqui.
            O unico fato que esta tela tinha era o habitat curado, que e PROSA
            ("Warm, shallow coral reefs and lagoons from the Red Sea to...") -
            nao ha palavra-chave que vire valor curto sem inventar, entao o
            card so sabia se truncar com "..." e era isso que fazia a tela
            parecer prototipo. Nada se perdeu: o mesmo habitat continua logo
            abaixo como card-porta, que abre o texto inteiro no manual. */}

        {/* Curated content, when we have it for this species.
            Nyckel returns a label and a confidence and nothing else - no
            description, no habitat, no photo - which made this the emptiest
            screen in the app. The curated file fills that gap for the species
            people actually photograph; anything outside it still shows the
            honest placeholder rather than inventing facts. */}
        {/* Zona de cor: everything we can SAY about the species - the reading
            plus the honesty note that qualifies it - lives in one full-bleed
            band a shade above the page. ZoneBand is a pure wrapper: the
            quente-primeiro order of the cards is untouched, and the band is
            never empty because the coverage note is unconditional. */}
        <ZoneBand gutter={20}>
          {curated ? (
            <>
              {/* Overview fica inline e completo - a leitura que abre a tela
                  ("quente primeiro"). */}
              <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
                <Text style={styles.body}>{curated.overview}</Text>
              </SectionCard>
              {/* Hub do resultado (video do concorrente): as secoes longas
                  deixam de ser prosa empilhada e viram cards-porta pro manual
                  CareTopics. Sem manual (menos de 2 topicos) os cards inline
                  originais continuam - mesmo texto, mesmas chaves. */}
              {hasManual ? (
                <>
                  {!!curated.habitat && (
                    <TopicDoor
                      icon="earth-outline"
                      color={colors.info}
                      label={t('fieldGuide.habitat')}
                      preview={curated.habitat}
                      onPress={() => openTopic('habitat')}
                    />
                  )}
                  {!!curated.curiosity && (
                    <TopicDoor
                      icon="sparkles-outline"
                      color={colors.warning}
                      label={t('fieldGuide.curiosity')}
                      preview={curated.curiosity}
                      onPress={() => openTopic('curiosity')}
                    />
                  )}
                </>
              ) : (
                <>
                  {!!curated.habitat && (
                    <SectionCard icon="earth-outline" title={t('fieldGuide.habitat')} color={colors.info}>
                      <Text style={styles.body}>{curated.habitat}</Text>
                    </SectionCard>
                  )}
                  {!!curated.curiosity && (
                    <SectionCard icon="sparkles-outline" title={t('fieldGuide.curiosity')} color={colors.warning}>
                      <Text style={styles.body}>{curated.curiosity}</Text>
                    </SectionCard>
                  )}
                </>
              )}
            </>
          ) : (
            /* No curated entry for this species. Nyckel gives an English label and
               nothing else, so plant.overview here is the literal string "No
               description available for this bird." - shown in English to all 17
               languages. Wikipedia in the reader's own language is better on both
               counts: it says something, and it says it to them. */
            <SectionCard icon="information-circle-outline" title={t('common.overview')} color={meta.accent}>
              <TranslatableText
                text={localised?.text || t('sound.noContentBody')}
                style={styles.body}
                showWhenEnglish={!!localised?.text && !localised?.localised}
              />
              {!!localised?.url && (
                <TouchableOpacity onPress={() => Linking.openURL(localised.url)} accessibilityRole="link">
                  <Text style={styles.sourceLink}>{t('fieldGuide.textCredit')}</Text>
                </TouchableOpacity>
              )}
            </SectionCard>
          )}

          {/* Honest coverage note. The classifier knows 291 species out of roughly
              eleven thousand in the world, weighted toward North America - a user
              photographing a common Brazilian bird can absolutely get a confident
              wrong answer, and should be told that up front rather than after. */}
          <SectionCard icon="alert-circle-outline" title={t('detail.coverageNoteTitle')} color={colors.warning}>
            <Text style={styles.body}>{t('detail.birdCoverageNote')}</Text>
          </SectionCard>
        </ZoneBand>

        {/* Gancho da especialista (hub do resultado, video do concorrente):
            linha discreta que abre o chat do Botanist com a especie como
            contexto. */}
        <TouchableOpacity
          style={styles.specialistRow}
          onPress={openSpecialist}
          activeOpacity={0.8}
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

        {/* Press-scale by OUTER wrapper: the Touchable stays byte for byte
            (a11y, handlers, activeOpacity) - on RN-web an Animated.Value on the
            Touchable's own style would not drive the transform. */}
        <PressScale>
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: meta.accent },
              saved && { backgroundColor: meta.accentDark },
            ]}
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
            <Text style={styles.saveBtnText}>{saved ? t('common.saved') : t('common.save')}</Text>
          </TouchableOpacity>
        </PressScale>

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Compartilhe sua planta - tela principal rica (video do concorrente,
            20/08): o motor de share ja existia, mas so atras do icone de 20px
            da TopBar. Aqui ele vira convite, no fim da leitura. */}
        <ShareSpeciesCard
          entity={plant}
          categoryLabel={t('categories.bird.label')}
          accent={meta.accent}
        />

        {/* "Duvidas frequentes" - paridade 120% (video do concorrente,
            20/08): o FAQ fixo dele vira pergunta SUGERIDA que abre a
            especialista ja com a duvida escrita e a especie como contexto. */}
        <SpeciesFaq
          category="bird"
          name={plant.name}
          scientific={plant.scientific}
          accent={meta.accent}
          navigation={navigation}
        />

        {/* Feedback fecha o scroll (hub do resultado, video do concorrente). */}
        <HelpfulRow category="bird" context="result" />
      </ScrollView>

      {/* Barra de acao fixa do hub do resultado (video do concorrente),
          substituindo o SaveFab: Nova foto (so quando veio direto de uma
          identificacao), Share e a pill dominante de salvar. Absolute WITHIN
          the screen; styles.scroll keeps paddingBottom >= 120 so the bar never
          covers the last row. The top-bar bookmark stays as state indicator. */}
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
  // paddingBottom >= 120: room for the fixed ResultActionBar (hub do
  // resultado, video do concorrente) - a bar that hides the last row is the
  // viewport bug in miniature.
  scroll: { padding: 20, paddingBottom: 120 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  scientificRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
  // Fatos rapidos: estilos removidos na auditoria de diagramacao 20/08
  // junto com a grade (habitat e prosa, nao vira valor curto).
  doorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  doorIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorLabel: { fontSize: 14.5, fontWeight: '700' },
  doorPreview: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  specialistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  specialistText: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '700' },
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
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6 },
  sourceLink: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 10,
    textDecorationLine: 'underline',
  },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  photoHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  refPhoto: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  photoCredit: { color: colors.textMuted, fontSize: 10.5, textAlign: 'center', marginTop: 5 },
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
