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
import DistributionMap from '../components/DistributionMap';
import { colors } from '../components/theme';
import { getCollection, saveToCollection, removeFromCollection, updateCollectionEntry } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { getSpeciesGroup } from '../components/speciesGroup';
import { getWateringStatus, WATER_INTERVAL_DAYS } from '../components/watering';
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
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
import QuickFactGrid from '../components/QuickFactGrid';
import shortFact from '../components/shortFact';
import ExpandableText from '../components/ExpandableText';

function InfoRow({ label, value, color }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
    </View>
  );
}

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

export default function TreeDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.tree;
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const [lastWateredAt, setLastWateredAt] = useState(plant.lastWateredAt || plant.savedAt || null);
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
        setLastWateredAt(entry.savedAt || null);
      } else {
        showAlert(t('common.saveErrorTitle'), t('common.saveErrorBody'));
      }
    }
  };

  // edibleParts/propagation left the receipt for the hub's door cards below -
  // same i18n labels, same text, new address (hub do resultado, video do
  // concorrente).
  const infoRows = [
    { label: t('common.nativeOrigin'), value: plant.origin },
    { label: t('detail.wateringNeeds'), value: plant.waterLabel || plant.water },
  ].filter((r) => r.value);

  // Auditoria de diagramacao 20/08: quando o vendor nao tem nome comum ele
  // devolve name === scientific, e a primeira dobra imprimia o mesmo latim
  // duas vezes. Nesse caso a linha do cientifico some (o speaker nao se
  // perde - ele encosta no proprio nome logo abaixo).
  const showScientific = !!plant.scientific && plant.scientific !== plant.name;

  // Hub do resultado (video do concorrente): long prose moves to the
  // CareTopicsScreen manual; each quick fact / door card deep-links into one
  // tab. Only topics with real text ship - the manual filters again anyway.
  const listText = (v) => (Array.isArray(v) ? v.map((x) => '• ' + x).join('\n') : v);
  const topics = [
    {
      key: 'watering',
      label: t('detail.wateringGuideSection'),
      text: plant.bestWatering,
      // Real structured data for the Needs block: the interval map's days and
      // the 1..3 intensity from the raw Kindwise watering field. Compound
      // values ("Low ... to Medium") have no interval entry - the label alone
      // shows, honestly.
      shortValue: WATER_INTERVAL_DAYS[plant.water]
        ? t('detail.everyNDays', { count: WATER_INTERVAL_DAYS[plant.water] })
        : plant.waterLabel || plant.water,
      level: /high/i.test(plant.water || '') ? 3 : /medium/i.test(plant.water || '') ? 2 : /low/i.test(plant.water || '') ? 1 : undefined,
    },
    { key: 'light', label: t('detail.lightSection'), text: plant.bestLightCondition },
    { key: 'soil', label: t('detail.soilSection'), text: plant.bestSoilType },
    { key: 'safety', label: t('detail.safetySection'), text: plant.toxicity },
    { key: 'uses', label: t('detail.commonUsesSection'), text: plant.commonUses },
    { key: 'cultural', label: t('detail.culturalSignificanceSection'), text: plant.culturalSignificance },
    { key: 'edible', label: t('detail.edibleParts'), text: listText(plant.edibleParts) },
    { key: 'propagation', label: t('detail.propagation'), text: listText(plant.propagationMethods) },
    { key: 'overview', label: t('common.overview'), text: plant.overview },
  ].filter((tp) => tp.text);

  const openTopic = (initialKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('CareTopics', { groupKey: getSpeciesGroup(plant),
      title: plant.name,
      accent: meta.accent,
      category: 'tree',
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

  const wateringStatus = saved ? getWateringStatus({ ...plant, lastWateredAt }) : null;

  const handleMarkWatered = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!savedEntryId) return;
    const nowIso = new Date().toISOString();
    await updateCollectionEntry(savedEntryId, { lastWateredAt: nowIso });
    setLastWateredAt(nowIso);
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.tree.label'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas (diagramacao-premium): FIRST child of the root,
          pointerEvents none inside the component, and the root keeps its own
          backgroundColor underneath - decoration never steals a touch. */}
      <NatureScene accent={meta.accent} />

      <TopBar
        title={t('detail.profileTitle', { category: t('categories.tree.label') })}
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
        {/* Hero compacto (auditoria de diagramacao 20/08): 220 -> 150, pra
            primeira dobra caber FATO e nao so foto. `height` ja era prop
            opcional do PlantHero - passar 150 daqui mantem o default de 220
            intacto pras outras 6 telas de resultado. */}
        <PlantHero
          photoUri={plant.photoUri}
          similarImages={plant.similarImages}
          scientific={plant.scientific}
          accent={meta.accent}
          icon={meta.tabIcon}
          height={150}
        />

        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            {/* Speaker do concorrente (hub do resultado): ouvir o latim.
                Sem nome comum (name === scientific) a linha de baixo nao
                repete o latim - o speaker vem junto do nome (auditoria de
                diagramacao 20/08). */}
            <View style={styles.scientificRow}>
              <Text style={styles.name}>{plant.name}</Text>
              {!!plant.scientific && !showScientific && <Pronounce text={plant.scientific} />}
            </View>
            {showScientific && (
              <View style={styles.scientificRow}>
                <Text style={styles.scientific}>{plant.scientific}</Text>
                <Pronounce text={plant.scientific} />
              </View>
            )}
            {/* The names people actually call this tree belong with its
                name (hub do resultado, video do concorrente). */}
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

        {/* ORDEM DO SCROLL - auditoria de diagramacao 20/08 ("fato antes de
            prosa"): a primeira dobra entregava zero fato sobre a especie. O
            chip de categoria saiu daqui - o header ja diz "Perfil de Arvore" e
            o dock repete; era ruido puro. Agora vem seguranca -> grade de
            fatos, e extras/mapa/visao geral descem pra depois deles.
            "Quente primeiro": havendo toxicidade, ela abre ANTES da grade -
            responde o medo que trouxe o usuario aqui. Sem toxicidade a banda
            inteira nao renderiza (nunca um card vazio).
            Mesma ordem do PlantDetailScreen. */}
        {!!plant.toxicity && (
          <ZoneBand gutter={20}>
            <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={colors.error}>
              {/* Aviso colapsado: quente-primeiro se mantem (o alerta abre a
                  tela), mas o paragrafo inteiro do vendor comia a primeira
                  dobra e empurrava os Fatos rapidos pra fora - auditoria de
                  diagramacao 20/08. */}
              <ExpandableText
                text={plant.toxicity}
                textStyle={styles.body}
                accent={meta.accent}
              />
            </SectionCard>
          </ZoneBand>
        )}

        {/* Quick facts (auditoria de diagramacao 20/08): componente unico
            (QuickFactGrid) e VALOR curto no lugar da prosa truncada. Sem
            palavra-chave casada o card some em vez de mostrar meia frase -
            a prosa inteira continua na aba do manual. */}
        {topics.length > 0 && (
          <QuickFactGrid
            accent={meta.accent}
            facts={[
              {
                key: 'watering',
                icon: 'water-outline',
                color: colors.info,
                label: t('detail.wateringGuideSection'),
                // Nivel curto, nunca o rotulo composto do vendor: era
                // ele que truncava em 'Baixa (pr...' (auditoria 20/08).
                value: shortFact('water', plant.waterLabel || plant.water, t),
                onPress: () => openTopic('watering'),
              },
              {
                key: 'light',
                icon: 'sunny-outline',
                color: colors.warning,
                label: t('detail.lightSection'),
                value: shortFact('light', plant.bestLightCondition, t),
                onPress: () => openTopic('light'),
              },
              {
                key: 'soil',
                icon: 'layers-outline',
                color: colors.purple,
                label: t('detail.soilSection'),
                value: shortFact('soil', plant.bestSoilType, t),
                onPress: () => openTopic('soil'),
              },
              {
                key: 'safety',
                icon: 'warning-outline',
                color: colors.error,
                label: t('detail.safetySection'),
                value: shortFact('toxicity', plant.toxicity, t),
                onPress: () => openTopic('safety'),
              },
            ]}
          />
        )}

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. Desceu pra depois da
            grade de fatos (auditoria de diagramacao 20/08). */}
        <IdentificationExtras entity={plant} accent={meta.accent} />

        {/* Mapa de distribuicao REAL (GBIF) - o concorrente desenha o dele;
            este e ciencia com credito. Some sozinho sem match/offline. */}
        <DistributionMap scientific={plant.scientific} accent={meta.accent} />

        {/* Zona de cor (diagramacao-premium): thematic runs of sections live
            in full-bleed bands one shade above the background; the gap between
            bands is the scene showing through. ZoneBand is a pure wrapper.
            A visao geral e PROSA, entao vem depois do fato (auditoria de
            diagramacao 20/08); a seguranca continua sendo a unica prosa que
            abre a tela. */}
        <ZoneBand gutter={20}>
          <SectionCard icon="leaf-outline" title={t('common.overview')} color={meta.accent}>
            <Text style={styles.body}>{plant.overview || t('sound.noContentBody')}</Text>
          </SectionCard>
        </ZoneBand>

        {/* Care band. Guarded: every child is conditional, and an empty band
            would render as a floating pill of nothing. Care prose became door
            cards into the CareTopics manual (hub do resultado, video do
            concorrente); watering status stays inline - it is action, not
            reading. */}
        {!!(plant.bestWatering || plant.bestLightCondition || plant.bestSoilType || wateringStatus) && (
        <ZoneBand gutter={20}>



        {!!wateringStatus && (
          <SectionCard icon="water-outline" title={t('detail.wateringSection')} color={colors.info}>
            <View style={styles.wateringRow}>
              <Text
                style={[
                  styles.wateringLabel,
                  { color: wateringStatus.overdue ? colors.error : colors.textSecondary },
                ]}
              >
                {wateringStatus.overdue
                  ? t('detail.waterCheckToday')
                  : t('detail.waterCheckInDays', { count: wateringStatus.dueInDays })}
              </Text>
              <TouchableOpacity
                style={styles.waterBtn}
                activeOpacity={0.85}
                onPress={handleMarkWatered}
                accessibilityRole="button"
                accessibilityLabel={t('detail.markAsWateredLabel')}
              >
                <Ionicons
                  name="water"
                  size={16}
                  color={colors.white}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={styles.waterBtnText}>{t('detail.markAsWatered')}</Text>
              </TouchableOpacity>
            </View>
          </SectionCard>
        )}
        </ZoneBand>
        )}

        {/* Ficha/recibo band: story context and the technical rows close the
            screen as a receipt. Guarded like the care band. Story prose became
            door cards into the CareTopics manual (hub do resultado, video do
            concorrente). */}
        {!!(plant.commonUses || plant.culturalSignificance || plant.edibleParts || plant.propagationMethods || infoRows.length > 0) && (
        <ZoneBand gutter={20}>
        {!!plant.commonUses && (
          <TopicDoor
            icon="construct-outline"
            color={meta.accent}
            label={t('detail.commonUsesSection')}
            preview={plant.commonUses}
            onPress={() => openTopic('uses')}
          />
        )}

        {!!plant.culturalSignificance && (
          <TopicDoor
            icon="book-outline"
            color={colors.purple}
            label={t('detail.culturalSignificanceSection')}
            preview={plant.culturalSignificance}
            onPress={() => openTopic('cultural')}
          />
        )}

        {!!plant.edibleParts && (
          <TopicDoor
            icon="restaurant-outline"
            color={meta.accent}
            label={t('detail.edibleParts')}
            preview={listText(plant.edibleParts)}
            onPress={() => openTopic('edible')}
          />
        )}

        {!!plant.propagationMethods && (
          <TopicDoor
            icon="flower-outline"
            color={colors.info}
            label={t('detail.propagation')}
            preview={listText(plant.propagationMethods)}
            onPress={() => openTopic('propagation')}
          />
        )}

        {infoRows.length > 0 && (
          <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
            {infoRows.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} />
            ))}
          </SectionCard>
        )}
        </ZoneBand>
        )}

        {!!plant.url && (
          <TouchableOpacity
            style={styles.linkBtn}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(plant.url)}
            accessibilityRole="button"
            accessibilityLabel={t('detail.readMoreLabel', { category: t('categories.tree.label').toLowerCase() })}
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

        {/* Gancho da especialista (hub do resultado, video do concorrente):
            apos a leitura, a duvida vai com a especie pro chat do Botanico. */}
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
          <Text style={[styles.specialistText, { color: meta.accent }]}>
            {t('detail.askSpecialistCta')}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium): the
            Touchable stays byte for byte - a11y, labels and handlers intact. */}

        <InstallNudgeCard show={!!fromIdentify} accent={meta.accent} />

        {/* Feedback no fim do scroll (hub do resultado, video do concorrente). */}
        <HelpfulRow category="tree" context="result" />
      </ScrollView>

      {/* Barra de acoes fixa do resultado (hub do resultado, video do
          concorrente): Nova foto | Compartilhar | Salvar sempre a um toque -
          substitui o SaveFab. Absolute WITHIN the screen; the scroll content
          above carries paddingBottom >= 120 so the bar never hides the last
          row. */}
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
  // marginBottom repoe o respiro que o chip de categoria removido dava
  // (auditoria de diagramacao 20/08).
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, marginBottom: 8 },
  // flexShrink: o nome agora divide a linha com o speaker quando o vendor nao
  // manda nome comum.
  name: { fontSize: 24, fontWeight: '800', color: colors.text, flexShrink: 1 },
  scientificRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
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
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  // Hub do resultado (video do concorrente): cards-porta. Os estilos dos
  // fatos rapidos sairam daqui na auditoria de diagramacao 20/08 - viviam
  // copiados em 6 telas e agora moram so em components/QuickFactGrid.js.
  doorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  doorIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  doorLabel: { fontSize: 14.5, fontWeight: '700' },
  doorPreview: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  specialistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  specialistText: { fontSize: 14, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  wateringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wateringLabel: { fontSize: 13.5, fontWeight: '600', flexShrink: 1, marginRight: 12 },
  waterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.info,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  waterBtnText: { color: colors.white, fontWeight: '700', fontSize: 12.5, marginLeft: 6 },
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
