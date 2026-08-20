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
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
import CategoryIcon from '../components/CategoryIcon';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { getLocalisedOverview, looksLikeProse } from '../components/localisedOverview';
import TranslatableText from '../components/TranslatableText';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import ResultActionBar from '../components/ResultActionBar';
import HelpfulRow from '../components/HelpfulRow';
import SpeciesFaq from '../components/SpeciesFaq';
import ShareSpeciesCard from '../components/ShareSpeciesCard';
import Pronounce from '../components/Pronounce';
import TopBar, { TopBarIcon } from '../components/TopBar';
import ExpandableText from '../components/ExpandableText';
import DistributionMap from '../components/DistributionMap';

// Modelled on TreeDetailScreen, minus everything that only makes sense for a
// plant: no watering tracker, no light/soil guide, no "mark as watered". Fish
// gain three fields no other category has - common names, scientific synonyms
// and a reference photo of the species - all straight out of Fishial's
// `fishangler-data` block.

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function FishDetailScreen({ route }) {
  const navigation = useNavigation();
  // The param is named `plant` across every detail screen in this app - it is
  // the generic "identified entity", not a plant specifically. Renaming it would
  // mean touching every navigate() call site for no user-visible gain.
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.fish;
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const [localised, setLocalised] = useState(null);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  useEffect(() => {
    let alive = true;
    getLocalisedOverview({
      scientific: plant.scientific,
      commonName: plant.name,
      language: i18n.language,
    }).then((r) => {
      if (alive) setLocalised(r);
    });
    return () => {
      alive = false;
    };
  }, [plant.scientific, plant.name, i18n.language]);

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

  // Which text leads, and which becomes the technical card. Vendor prose beats
  // an encyclopaedia entry - it is about this exact species record. A vendor
  // diagnostic key loses to Wikipedia prose, because a fin-ray count is not a
  // description of an animal.
  const vendorText = plant.overview || null;
  const wikiText = localised?.text || null;
  // The server's verdict, decided on the ENGLISH original. Never re-derived
  // here: by this point plant.overview may be a Korean or Chinese translation,
  // and the detector cannot read those - it would call every one of them a
  // diagnostic key and bury the translation the app just paid for.
  //
  // The `??` fallback covers an entry saved to the collection before this field
  // existed, where re-deriving is still better than nothing.
  const vendorIsProse =
    typeof plant.overviewIsProse === 'boolean'
      ? plant.overviewIsProse
      : looksLikeProse(vendorText);

  const lead = vendorIsProse ? vendorText : wikiText || vendorText;

  // The second card, or nothing.
  //
  // It must never repeat what is already above it. The previous version reached
  // for plant.overviewOriginal whenever a translation had happened - but when
  // the vendor's prose IS the lead, the "original" is that same paragraph in
  // English, so the screen showed the same text twice, with a Translate button
  // offering to spend an API call reproducing the translation already on screen.
  //
  // Rules, in order:
  //   * vendor prose leads  -> Wikipedia is the alternative view, if it differs.
  //   * Wikipedia leads     -> the vendor's diagnostic key is the technical card.
  //   * nothing else        -> no second card at all.
  const secondaryRaw = lead === vendorText ? wikiText : vendorText;
  const secondary = secondaryRaw && secondaryRaw !== lead ? secondaryRaw : null;

  // Which of the two texts is STILL in English, so the Translate button is only
  // offered where it would do something.
  //
  // Getting this wrong is not harmless: the first version keyed the button off
  // the Wikipedia language flag and attached it to whatever text was leading, so
  // a vendor description already translated server-side into Portuguese still
  // showed "Traduzir" - a button that would send Portuguese to be translated
  // into Portuguese, costing a call to change nothing.
  //
  // The vendor's text is in the reader's language exactly when a translation
  // happened, and `overviewOriginal` is only populated in that case.
  const vendorIsEnglish = !plant.overviewOriginal;
  const wikiIsEnglish = !localised?.localised;
  const stillEnglish = (text) => {
    if (!text) return false;
    if (text === plant.overviewOriginal) return true; // the original, by definition
    if (text === vendorText) return vendorIsEnglish;
    if (text === wikiText) return wikiIsEnglish;
    return false;
  };

  // commonNames left this list for the identity block under the scientific
  // name - a fish's everyday names are who it IS, not a receipt row ("quente
  // primeiro, ficha depois"). Synonyms and origin stay here: they are the ficha.
  const infoRows = [
    { label: t('common.nativeOrigin'), value: plant.origin },
    { label: t('detail.synonyms'), value: plant.synonyms },
  ].filter((r) => r.value);

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.fish.label'));
  };

  // Gancho da especialista (hub do resultado, video do concorrente): leva a
  // especie junto como contexto pro chat do Botanico (tab irmao no App.js).
  //
  // Note what this screen does NOT get from the hub reform: no CareTopics
  // manual and no quick-facts grid. The two long texts (lead/secondary) carry
  // the Translate button and the Wikipedia/vendor credits, which the manual
  // cannot host - and english-leak.test.js pins both TranslatableText renders
  // to this file - so the prose stays inline; and the only short fields
  // (origin, synonyms) are already shown IN FULL in the Details receipt,
  // where a truncated fact tile with no door to open would only hide data.
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
        title={t('detail.profileTitle', { category: t('categories.fish.label') })}
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
            {/* Moved out of the Details receipt: the names people actually call
                this fish belong with its name, not in the ficha at the bottom.
                Same text, same i18n key - only the place changed. */}
            {!!plant.commonNames && (
              <Text style={styles.commonNamesLine}>
                {t('detail.commonNames')}: {plant.commonNames}
              </Text>
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
            {t('categories.fish.label')}
          </Text>
        </View>

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. */}
        <IdentificationExtras entity={plant} accent={meta.accent} />

        {/* Mapa de distribuicao REAL (GBIF) - tela principal rica (video do
            concorrente, 20/08): "onde esse peixe vive" era a pergunta que esta
            tela nao respondia, e o GBIF cobre fauna marinha como cobre planta.
            Some sozinho sem match de taxon ou offline. */}
        <DistributionMap scientific={plant.scientific} accent={meta.accent} />

        {/* Overview in the reader's language, when one exists.
            Fishial.AI has no localised content whatsoever, so a user in Brazil
            was shown a paragraph of English written in ichthyology register -
            fin ray counts, vertebrae, diagnostic characters. Wikipedia's summary
            is already in their language and already written for a general
            reader, so it leads; the vendor's text moves below as the technical
            section, which is where a fin ray count belongs. */}
        {/* Whichever source is actually readable leads; the other becomes the
            technical card. Both are already in the reader's language - the
            vendor's text is translated server-side, Wikipedia is fetched in
            their language - so this is purely about CONTENT, not translation.
            See looksLikeProse: Fishial's description for a clownfish is a
            fin-ray count table, and no amount of translating makes that the
            right thing to lead with. */}
        {/* Zona de cor #1: the reading matter - overview plus the technical
            description - lives in one full-bleed band a shade above the page.
            ZoneBand is a pure wrapper: the quente-primeiro order (readable text
            first, fin-ray counts after) is untouched. `secondary` can only
            exist when `lead` does (see its derivation), so nesting it here
            changes nothing. */}
        {!!lead && (
          <ZoneBand gutter={20}>
            <SectionCard icon="fish-outline" title={t('common.overview')} color={meta.accent}>
              {/* Wikipedia may have answered in English when the reader's
                  language has no article. Offer the button there too - it is the
                  same leaked-English problem, just from a different source. */}
              <TranslatableText text={lead} style={styles.body} showWhenEnglish={stillEnglish(lead)} />
              {lead === localised?.text && !!localised?.url && (
                <TouchableOpacity onPress={() => Linking.openURL(localised.url)} accessibilityRole="link">
                  <Text style={styles.sourceLink}>{t('fieldGuide.textCredit')}</Text>
                </TouchableOpacity>
              )}
            </SectionCard>

            {!!secondary && (
              <SectionCard
                icon="school-outline"
                title={t('common.technicalDescription')}
                color={colors.info}
              >
                {/* Tela principal rica (video do concorrente, 20/08): a chave
                    diagnostica do vendor ("Dorsal spines (total): 9-10; ...")
                    e o bloco mais longo e menos lido da tela, e empurrava a
                    ficha inteira pra fora da dobra. Fica colapsada atras do
                    "Ver mais" - o titulo da secao continua visivel, entao
                    nada some, so espera um toque.
                    initial={0}: nenhum filho aberto. O TranslatableText nao
                    pode ser cortado por frase (perderia o botao Traduzir e o
                    aviso de origem), entao o corte e do bloco inteiro. */}
                <ExpandableText initial={0} accent={meta.accent}>
                  <TranslatableText text={secondary} style={styles.body} showWhenEnglish={stillEnglish(secondary)} />
                  {secondary === plant.overviewOriginal && (
                    <Text style={styles.sourceNote}>{t('common.vendorEnglishNote')}</Text>
                  )}
                </ExpandableText>
              </SectionCard>
            )}
          </ZoneBand>
        )}

        {/* Zona de cor #2: the receipt. The ficha closes the screen in its own
            band, and the gap between the bands is the scene showing through. */}
        {infoRows.length > 0 && (
          <ZoneBand gutter={20}>
            <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
              {infoRows.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </SectionCard>
          </ZoneBand>
        )}

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

        {/* The species reference photo used to be rendered here as its own card.
            It now comes through IdentificationExtras above, which builds
            `similarImages` from the same Fishial photo for every category
            uniformly - keeping both would show the identical image twice. */}

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
          categoryLabel={t('categories.fish.label')}
          accent={meta.accent}
        />

        {/* "Duvidas frequentes" - paridade 120% (video do concorrente,
            20/08): o FAQ fixo dele vira pergunta SUGERIDA que abre a
            especialista ja com a duvida escrita e a especie como contexto. */}
        <SpeciesFaq
          category="fish"
          name={plant.name}
          scientific={plant.scientific}
          accent={meta.accent}
          navigation={navigation}
        />

        {/* Feedback fecha o scroll (hub do resultado, video do concorrente). */}
        <HelpfulRow category="fish" context="result" />
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
  commonNamesLine: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
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
  // Says plainly that the paragraph above is the vendor's, in English, so nobody
  // reads an untranslated block and concludes the app is broken.
  sourceNote: { color: colors.textMuted, fontSize: 11, marginTop: 9, fontStyle: 'italic' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  referenceImage: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
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
