import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BackChevron from '../components/BackChevron';
import SectionCard from '../components/SectionCard';
import { colors, shadow } from '../components/theme';
import { getSpeciesPhoto } from '../components/speciesPhoto';
import { getHerbDetails } from '../components/herbDetails';
import { getSubscriptionStatus, startCheckout } from '../components/subscription';
import PaywallModal from '../components/PaywallModal';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';

export default function HerbDetailScreen({ route }) {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { herbId, color } = route.params;

  const [details, setDetails] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  const allHerbs = t('discover.topics.medicinalHerbs.species', { returnObjects: true });
  const herb = allHerbs.find((h) => h.id === herbId);

  // Foto REAL da especie para o hero, da Wikipedia pelo nome cientifico
  // (cadeia ja pronta e cacheada em speciesPhoto.js). Performance: UMA
  // busca por tela - so a especie visivel - e o cache absorve revisitas.
  const sci = herb?.sci;
  const [refPhoto, setRefPhoto] = useState(null);
  useEffect(() => {
    if (!sci) {
      setRefPhoto(null);
      return undefined;
    }
    let alive = true;
    getSpeciesPhoto(sci, i18n.language).then((p) => {
      if (alive) setRefPhoto(p);
    });
    return () => {
      alive = false;
    };
  }, [sci, i18n.language]);

  useEffect(() => {
    let cancelled = false;
    setSubLoading(true);
    getHerbDetails(i18n.language)
      .then((data) => {
        if (!cancelled) setDetails(data[herbId] || null);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    getSubscriptionStatus()
      .then((status) => {
        if (!cancelled) setSubStatus(status);
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [herbId, i18n.language]);

  const handleSubscribe = async (plan) => {
    setCheckingOut(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setCheckingOut(false);
      showAlert(t('paywall.checkoutFailedTitle'), e.message || t('paywall.checkoutFailedBody'));
    }
  };

  const handleRetryStatus = () => {
    setSubLoading(true);
    getSubscriptionStatus()
      .then((status) => setSubStatus(status))
      .finally(() => setSubLoading(false));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>{herb?.name}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {refPhoto?.url ? (
          // Ancora cenica full-bleed (diagramacao-premium, mesmo dispositivo do
          // PlantHero): margem negativa cancela o gutter de 20 do scroll e o
          // gradiente transparente -> background funde a foto na pagina. O nome
          // logo abaixo e a legenda do tile - nunca selo pequeno num card.
          <View style={styles.heroTile}>
            <Image source={{ uri: refPhoto.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', colors.background]}
              style={styles.heroFade}
              pointerEvents="none"
            />
            {/* Foto e da Wikimedia - credito obrigatorio (speciesPhoto.js:
                "Never present a third party's photo as ours"), e o texto
                promete tap, entao o tap abre a fonte de verdade. */}
            {!!refPhoto.sourceUrl && (
              <TouchableOpacity
                style={styles.heroCredit}
                onPress={() => Linking.openURL(refPhoto.sourceUrl)}
                accessibilityRole="link"
                accessibilityLabel={t('fieldGuide.photoCredit')}
              >
                <Text style={styles.heroCreditText}>{t('fieldGuide.photoCredit')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          // Fallback (offline / especie sem Wikipedia): exatamente como hoje,
          // icone no quadrado colorido - a tela nunca nasce quebrada.
          <View style={[styles.heroThumb, { backgroundColor: (color || colors.error) + '33' }]}>
            <Ionicons name="leaf" size={40} color={color || colors.error} />
          </View>
        )}
        <Text style={styles.name}>{herb?.name}</Text>
        {!!herb?.sci && <Text style={styles.sci}>{herb.sci}</Text>}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.disclaimerText}>{t('discover.herbDisclaimer')}</Text>
        </View>

        {((!details && !loadError) || (!!details && subLoading)) && (
          <ActivityIndicator color={color || colors.error} style={{ marginTop: 30 }} />
        )}

        {loadError && (
          <Text style={styles.errorText}>{t('discover.herbDetailsLoadError')}</Text>
        )}

        {!!details && !subLoading && subStatus === 'active' && (
          <>
            <SectionCard icon="leaf-outline" title={t('common.overview')} color={color || colors.error}>
              <Text style={styles.body}>{details.overview}</Text>
            </SectionCard>

            <SectionCard icon="flask-outline" title={t('discover.preparationLabel')} color={colors.info}>
              <Text style={styles.body}>{details.preparation}</Text>
            </SectionCard>

            <SectionCard icon="checkmark-circle-outline" title={t('discover.benefitsLabel')} color={colors.accent}>
              <Text style={styles.body}>{details.benefits}</Text>
            </SectionCard>
          </>
        )}

        {!!details && !subLoading && subStatus !== 'active' && (
          <View style={styles.subscribeCard}>
            <Ionicons name="sparkles" size={22} color={colors.accent} />
            <Text style={styles.subscribeTitle}>{t('discover.herbSubscribeCtaTitle')}</Text>
            <Text style={styles.subscribeBody}>{t('discover.herbSubscribeCtaBody')}</Text>
            <TouchableOpacity
              style={[styles.subscribeBtn, checkingOut && { opacity: 0.6 }]}
              onPress={() => setPaywallVisible(true)}
              disabled={checkingOut}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('paywall.subscribe')}
            >
              <Text style={styles.subscribeBtnText}>
                {checkingOut ? t('paywall.subscribing') : t('paywall.subscribe')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retryStatusBtn}
              onPress={handleRetryStatus}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('discover.herbAlreadySubscribedCheck')}
            >
              <Text style={styles.retryStatusBtnText}>{t('discover.herbAlreadySubscribedCheck')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />

      <PaywallModal
        visible={paywallVisible}
        title={t('discover.herbSubscribeCtaTitle')}
        body={t('discover.herbSubscribeCtaBody')}
        accent={color || colors.error}
        subscribing={checkingOut}
        onSubscribe={handleSubscribe}
        onCancel={() => setPaywallVisible(false)}
      />
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
  heroThumb: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  // Tile do hero: full-bleed via margem negativa que cancela o padding 20 do
  // scroll (mesmo dispositivo do PlantHero - nunca position absolute).
  heroTile: {
    alignSelf: 'stretch',
    marginHorizontal: -20,
    height: 210,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%' },
  heroCredit: { position: 'absolute', bottom: 8, left: 12, right: 12 },
  heroCreditText: { color: 'rgba(255,255,255,0.75)', fontSize: 10, textAlign: 'center' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sci: { fontSize: 14, fontStyle: 'italic', color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 18,
    marginBottom: 8,
  },
  disclaimerText: { flex: 1, marginLeft: 8, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center', marginTop: 20 },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  subscribeCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  subscribeTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 8, marginBottom: 6 },
  subscribeBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  subscribeBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  subscribeBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  retryStatusBtn: { marginTop: 12, paddingVertical: 6 },
  retryStatusBtnText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
});
