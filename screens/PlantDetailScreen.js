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
import DiseaseReport from '../components/DiseaseReport';
import { colors } from '../components/theme';
import { getCollection, saveToCollection, removeFromCollection, updateCollectionEntry } from '../components/storage';
import { CATEGORIES } from '../components/categories';
import { getWateringStatus } from '../components/watering';
import { identify } from '../components/identify';
import { shareEntity } from '../components/share';
import InstallNudgeCard from '../components/InstallNudgeCard';
import CategoryIcon from '../components/CategoryIcon';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { startCheckout } from '../components/subscription';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import PressScale from '../components/PressScale';
import SaveFab from '../components/SaveFab';
import TopBar, { TopBarIcon } from '../components/TopBar';

function InfoRow({ label, value, color }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
    </View>
  );
}

export default function PlantDetailScreen({ route }) {
  const navigation = useNavigation();
  const { plant, photoBase64, fromIdentify } = route.params;
  const meta = CATEGORIES.plant;
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(plant.savedId || null);
  const [lastWateredAt, setLastWateredAt] = useState(plant.lastWateredAt || plant.savedAt || null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
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

  const infoRows = [
    { label: t('common.nativeOrigin'), value: plant.origin },
    { label: t('detail.wateringNeeds'), value: plant.waterLabel || plant.water },
    { label: t('detail.edibleParts'), value: plant.edibleParts },
    { label: t('detail.propagation'), value: plant.propagationMethods },
  ].filter((r) => r.value);

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
    shareEntity(plant, t('categories.plant.label'));
  };

  const handleCheckHealth = async () => {
    if (!photoBase64 || healthChecking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHealthChecking(true);
    setHealthError(null);
    try {
      const cropEntity = await identify('crop', photoBase64);
      setHealthResult(cropEntity);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err.paymentRequired) {
        setPaywallVisible(true);
        return;
      }
      setHealthError(err.message || 'Could not check plant health.');
    } finally {
      setHealthChecking(false);
    }
  };

  const handleSubscribe = async (plan) => {
    setSubscribing(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setSubscribing(false);
      showAlert(t('paywall.checkoutFailedTitle'), e.message || t('paywall.checkoutFailedBody'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas (diagramacao-premium): FIRST child of the root,
          pointerEvents none inside the component, and the root keeps its own
          backgroundColor underneath - decoration never steals a touch. */}
      <NatureScene accent={meta.accent} />

      <TopBar
        title={t('detail.profileTitle', { category: t('categories.plant.label') })}
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
            {!!plant.scientific && <Text style={styles.scientific}>{plant.scientific}</Text>}
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
          <Text style={[styles.typePillText, { color: meta.accent }]}>{t('categories.plant.label')}</Text>
        </View>

        {/* Reference photos, runner-up species and a low-confidence warning -
            all built from data the API already returned. */}
        <IdentificationExtras entity={plant} accent={meta.accent} />

        {/* Section order is deliberate ("quente primeiro, ficha depois"):
            safety answers the fear that brought many users here, so it leads;
            story and care advice follow; the technical info rows close the
            screen as a receipt rather than opening it as a wall of data. */}
        {/* Zona de cor (diagramacao-premium): each thematic run of sections
            lives in a full-bleed band one shade above the background; the gap
            between bands is the scene showing through. ZoneBand is a pure
            wrapper - the quente-primeiro order above stays byte for byte. */}
        <ZoneBand gutter={20}>
          {!!plant.toxicity && (
            <SectionCard icon="warning-outline" title={t('detail.safetySection')} color={colors.error}>
              <Text style={styles.body}>{plant.toxicity}</Text>
            </SectionCard>
          )}

          <SectionCard icon="leaf-outline" title={t('common.overview')} color={meta.accent}>
            <Text style={styles.body}>{plant.overview || t('sound.noContentBody')}</Text>
          </SectionCard>
        </ZoneBand>

        {/* Care band. Guarded: every child is conditional, and an empty band
            would render as a floating pill of nothing. photoBase64 covers the
            whole health-check block (button, error and result). */}
        {!!(plant.bestWatering || plant.bestLightCondition || plant.bestSoilType || wateringStatus || photoBase64) && (
        <ZoneBand gutter={20}>
        {!!plant.bestWatering && (
          <SectionCard icon="water-outline" title={t('detail.wateringGuideSection')} color={colors.info}>
            <Text style={styles.body}>{plant.bestWatering}</Text>
          </SectionCard>
        )}

        {!!plant.bestLightCondition && (
          <SectionCard icon="sunny-outline" title={t('detail.lightSection')} color={colors.warning}>
            <Text style={styles.body}>{plant.bestLightCondition}</Text>
          </SectionCard>
        )}

        {!!plant.bestSoilType && (
          <SectionCard icon="layers-outline" title={t('detail.soilSection')} color={colors.purple}>
            <Text style={styles.body}>{plant.bestSoilType}</Text>
          </SectionCard>
        )}

        {!!wateringStatus && (
          <SectionCard icon="water-outline" title={t('detail.wateringSection')} color={colors.info}>
            <View style={styles.wateringRow}>
              <Text
                style={[
                  styles.wateringLabel,
                  { color: wateringStatus.overdue ? colors.error : colors.textSecondary },
                ]}
              >
                {wateringStatus.label}
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

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium): the
            Touchable stays byte for byte - a11y, labels and handlers intact. */}
        {!!photoBase64 && !healthResult && (
          <PressScale>
          <TouchableOpacity
            style={[styles.healthBtn, healthChecking && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleCheckHealth}
            disabled={healthChecking}
            accessibilityRole="button"
            accessibilityLabel={healthChecking ? t('detail.checkingForDiseasesLabel') : t('detail.checkForDiseasesLabel')}
          >
            <Ionicons
              name="medkit-outline"
              size={18}
              color={colors.white}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.healthBtnText}>
              {healthChecking ? t('detail.checkingForDiseases') : t('detail.checkForDiseases')}
            </Text>
          </TouchableOpacity>
          </PressScale>
        )}

        {!!healthError && (
          <Text style={styles.healthErrorText}>{healthError}</Text>
        )}

        {!!healthResult && (
          <SectionCard icon="medkit-outline" title={t('detail.healthCheckSection')} color={colors.info}>
            <DiseaseReport disease={healthResult.disease} />
          </SectionCard>
        )}
        </ZoneBand>
        )}

        {/* Ficha/recibo band: story context and the technical rows close the
            screen as a receipt. Guarded like the care band. */}
        {!!(plant.commonUses || plant.culturalSignificance || infoRows.length > 0) && (
        <ZoneBand gutter={20}>
        {!!plant.commonUses && (
          <SectionCard icon="construct-outline" title={t('detail.commonUsesSection')} color={meta.accent}>
            <Text style={styles.body}>{plant.commonUses}</Text>
          </SectionCard>
        )}

        {!!plant.culturalSignificance && (
          <SectionCard icon="book-outline" title={t('detail.culturalSignificanceSection')} color={colors.purple}>
            <Text style={styles.body}>{plant.culturalSignificance}</Text>
          </SectionCard>
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
            accessibilityLabel={t('detail.readMoreLabel', { category: t('categories.plant.label').toLowerCase() })}
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

        {/* Press-scale por wrapper EXTERNO (diagramacao-premium). */}
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
      </ScrollView>

      {/* Floating save pill (SaveFab doctrine): absolute WITHIN the screen,
          and the scroll content above carries paddingBottom >= 96 so the pill
          never hides the last row. Gone once saved. */}
      <SaveFab onPress={toggleSave} accent={meta.accent} visible={!saved} />

      <PaywallModal
        visible={paywallVisible}
        categoryLabel={t('categories.crop.label').toLowerCase()}
        accent={meta.accent}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onCancel={() => setPaywallVisible(false)}
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
  // paddingBottom >= 96: room for the floating SaveFab (viewport law).
  scroll: { padding: 20, paddingBottom: 96 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  scientific: { fontSize: 15, fontStyle: 'italic', color: colors.textSecondary, marginTop: 3 },
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
  healthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  healthBtnText: { color: colors.white, fontWeight: '700', fontSize: 14.5, marginLeft: 8 },
  healthErrorText: { color: colors.error, fontSize: 13, marginBottom: 16, textAlign: 'center' },
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
