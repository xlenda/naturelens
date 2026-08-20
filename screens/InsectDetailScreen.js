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
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PlantHero from '../components/PlantHero';
import SectionCard from '../components/SectionCard';
import IdentificationExtras from '../components/IdentificationExtras';
import SeasonChart from '../components/SeasonChart';
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
import SpeciesFaq from '../components/SpeciesFaq';
import ShareSpeciesCard from '../components/ShareSpeciesCard';
import ResultActionBar from '../components/ResultActionBar';
import QuickFactGrid from '../components/QuickFactGrid';
import shortFact from '../components/shortFact';
import ExpandableText from '../components/ExpandableText';
import DistributionMap from '../components/DistributionMap';

function Tag({ label, color }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

const HIGH_RISK_TAGS = ['bites or stings', 'disease transmission', 'mildly venomous', 'highly venomous'];

export default function InsectDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, fromIdentify } = route.params;
  const meta = CATEGORIES.insect;
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

  const hasDanger = plant.danger?.length > 0;
  const dangerColor = plant.danger?.some((d) => HIGH_RISK_TAGS.includes(d)) ? colors.error : colors.warning;

  const infoRows = [
    { label: t('common.nativeOrigin'), value: plant.origin },
    { label: t('detail.conservationStatus'), value: plant.redList },
  ].filter((r) => r.value);

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(plant, t('categories.insect.label'));
  };

  // Hub do resultado (video do concorrente): o texto longo vira topicos do
  // manual da especie (CareTopicsScreen). So entra topico com conteudo REAL -
  // campo ausente nao gera aba.
  const topics = [
    plant.role?.length > 0 && {
      key: 'role',
      label: t('detail.ecologicalRoleSection'),
      text: '• ' + plant.role.join('\n• '),
    },
    !!plant.dangerDescription && {
      key: 'safety',
      label: t('detail.safetySection'),
      text: plant.dangerDescription,
    },
  ].filter(Boolean);

  const openTopic = (initialKey) =>
    navigation.navigate('CareTopics', { groupKey: getSpeciesGroup(plant),
      title: plant.name,
      accent: meta.accent,
      category: 'insect',
      topics,
      initialKey,
    });

  // Fatos rapidos (auditoria de diagramacao 20/08): valor CURTO de verdade.
  // As tags de `danger` ja sao rotulos curtos do vendor; `dangerDescription`
  // e prosa, entao passa pelo shortFact - e se nao casar palavra-chave o card
  // some em vez de mostrar meia frase (a prosa fica na aba do manual).
  const quickFacts = [
    topics.some((tp) => tp.key === 'safety') && {
      key: 'safety',
      icon: 'warning-outline',
      color: dangerColor,
      label: t('detail.safetySection'),
      value: plant.danger?.length
        ? plant.danger.join(', ')
        : shortFact('toxicity', plant.dangerDescription, t),
    },
    topics.some((tp) => tp.key === 'role') && {
      key: 'role',
      icon: 'leaf-outline',
      color: colors.accent,
      label: t('detail.ecologicalRoleSection'),
      value: plant.role.join(', '),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas (diagramacao-premium): FIRST child of the root,
          pointerEvents none inside the component, and the root keeps its own
          backgroundColor underneath - decoration never steals a touch. */}
      <NatureScene accent={meta.accent} />

      <TopBar
        title={t('detail.profileTitle', { category: t('categories.insect.label') })}
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

        <View style={[styles.typePill, { backgroundColor: meta.accent + '22' }]}>
          <CategoryIcon
            name={meta.tabIcon}
            size={13}
            color={meta.accent}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.typePillText, { color: meta.accent }]}>{t('categories.insect.label')}</Text>
        </View>

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. */}
        <IdentificationExtras entity={plant} accent={meta.accent} />

        {/* Mapa de distribuicao REAL (GBIF) - tela principal rica (video do
            concorrente, 20/08): o mesmo componente da tela de planta, e o GBIF
            cobre fauna tambem. Some sozinho quando a especie nao tem match ou
            o aparelho esta offline. */}
        <DistributionMap scientific={plant.scientific} accent={meta.accent} />

        {/* Destaque da estacao (paridade 120% - video do concorrente, 20/08):
            onde ele desenha um grafico de estacao generico, aqui e o
            histograma REAL de ocorrencias por mes da especie no GBIF. Inseto
            tem sazonalidade forte (emergencia, voo), entao o mes de registro
            diz muito. Some sozinho com menos de 30 registros datados. */}
        <SeasonChart scientific={plant.scientific} accent={meta.accent} />

        {/* Safety leads ("quente primeiro"): for insects, "did the thing that
            just stung me matter?" is the question that opened the camera - it
            cannot sit below the encyclopedia paragraph. */}
        {/* Zona de cor (diagramacao-premium): thematic runs of sections live
            in full-bleed bands one shade above the background; the gap between
            bands is the scene showing through. ZoneBand is a pure wrapper -
            the quente-primeiro order stays byte for byte. */}
        <ZoneBand gutter={20}>
          {/* Tela principal rica (video do concorrente, 20/08): a descricao de
              perigo agora abre a secao mesmo SEM tags - antes so existia
              acompanhando `danger`, entao um inseto com prosa de risco e
              nenhuma tag nao mostrava nada aqui. Prosa longa vem colapsada
              (ExpandableText corta por frase) para nao comer a primeira dobra.
              Sem os dois campos, a secao inteira nao renderiza. */}
          {(hasDanger || !!plant.dangerDescription) && (
            <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={dangerColor}>
              {hasDanger && (
                <View style={styles.tagRow}>
                  {plant.danger.map((d) => (
                    <Tag key={d} label={d} color={dangerColor} />
                  ))}
                </View>
              )}
              {!!plant.dangerDescription && (
                <View style={hasDanger ? { marginTop: 10 } : null}>
                  {/* Inteiro, nunca colapsado: cortar um aviso de picada ou
                      veneno na primeira frase pode esconder justamente a parte
                      grave (auditoria 20/08). */}
                  <Text style={styles.body}>{plant.dangerDescription}</Text>
                </View>
              )}
            </SectionCard>
          )}

          <SectionCard icon="document-text-outline" title={t('common.overview')} color={meta.accent}>
            <Text style={styles.body}>{plant.overview || t('sound.noContentBody')}</Text>
          </SectionCard>
        </ZoneBand>

        {/* Fatos rapidos (auditoria de diagramacao 20/08): o bloco copiado nas
            6 telas virou um componente so. Ele proprio descarta card sem valor
            e nao renderiza nada quando a grade fica vazia. */}
        <QuickFactGrid
          accent={meta.accent}
          facts={quickFacts.map((f) => f && { ...f, onPress: () => openTopic(f.key) })}
        />

        {/* Ecology - tela principal rica (video do concorrente, 20/08): o papel
            ecologico era so um card-porta com uma linha truncada; agora a lista
            REAL do vendor fica inline, um bullet por papel, como na tela de
            resultado do concorrente. A porta pro manual nao se perdeu - o mesmo
            topico continua a um toque pelo fato rapido "Papel ecologico" acima.
            Guarded: campo ausente = banda inteira nao renderiza. */}
        {plant.role?.length > 0 && (
          <ZoneBand gutter={20}>
            <SectionCard
              icon="leaf-outline"
              title={t('detail.ecologicalRoleSection')}
              color={colors.accent}
            >
              {plant.role.map((r) => (
                <Text key={r} style={styles.bullet}>{'• ' + r}</Text>
              ))}
            </SectionCard>
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
            accessibilityLabel={t('detail.readMoreLabel', { category: t('categories.insect.label').toLowerCase() })}
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

        {/* Compartilhe sua planta - tela principal rica (video do concorrente,
            20/08): o motor de share ja existia, mas so atras do icone de 20px
            da TopBar. Aqui ele vira convite, no fim da leitura. */}
        <ShareSpeciesCard
          entity={plant}
          categoryLabel={t('categories.insect.label')}
          accent={meta.accent}
        />

        {/* "Duvidas frequentes" - paridade 120% (video do concorrente,
            20/08): o FAQ fixo dele vira pergunta SUGERIDA que abre a
            especialista ja com a duvida escrita e a especie como contexto. */}
        <SpeciesFaq
          category="insect"
          name={plant.name}
          scientific={plant.scientific}
          accent={meta.accent}
          navigation={navigation}
        />

        {/* Foi util? - hub do resultado (video do concorrente): fecha o
            scroll medindo a identificacao. */}
        <HelpfulRow category="insect" context="result" />
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
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  tagText: { fontSize: 12, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13.5 },
  infoValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  // Bullet da lista de papel ecologico - tela principal rica (video do
  // concorrente, 20/08). Os estilos do card-porta sairam daqui junto com ele:
  // a lista agora e inline. Os dos fatos rapidos moram em QuickFactGrid.js.
  bullet: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  specialistCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  specialistText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13.5 },
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
