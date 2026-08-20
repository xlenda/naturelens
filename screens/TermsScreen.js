import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import NatureScene from '../components/NatureScene';
import LegalDocument from '../components/LegalDocument';
import { termsPt, termsEn } from '../components/legalTexts';
import { colors } from '../components/theme';

// URL da versao web do documento (public/terms.html servido pelo site).
const FULL_DOC_URL = 'https://naturelensapp.cloud/terms.html';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

export default function TermsScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas — mesmo padrao das telas irmas (HelpScreen):
          primeiro filho da raiz, decorativo, a raiz mantem o backgroundColor. */}
      <NatureScene />
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header">{t('terms.title')}</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Resumo localizado (17 idiomas) — mantido intacto no topo. */}
        <Section title={t('terms.acceptanceTitle')}>
          {t('terms.acceptanceBody')}
        </Section>

        <Section title={t('terms.serviceTitle')}>
          {t('terms.serviceBody')}
        </Section>

        <Section title={t('terms.accuracyTitle')}>
          {t('terms.accuracyBody')}
        </Section>

        <Section title={t('terms.billingTitle')}>
          {t('terms.billingBody')}
        </Section>

        <Section title={t('terms.accountTitle')}>
          {t('terms.accountBody')}
        </Section>

        <Section title={t('terms.liabilityTitle')}>
          {t('terms.liabilityBody')}
        </Section>

        <Section title={t('terms.changesTitle')}>
          {t('terms.changesBody')}
        </Section>

        <Section title={t('terms.contactTitle')}>
          {t('terms.contactBody')}
        </Section>

        {/* Documento legal COMPLETO (decisao de 19/08/2026: o dono reclamou que
            o in-app era so resumo; o concorrente mostra o juridico inteiro no
            app). Completo SO em PT+EN por design — o resumo acima continua nos
            17 idiomas. */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>{t('about.fullDocLabel', 'Full legal document')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <LegalDocument langLabel="Português" sections={termsPt} />
        <LegalDocument langLabel="English" sections={termsEn} />

        {/* Versao web do mesmo documento — o proprio URL e o texto do link. */}
        <TouchableOpacity
          style={styles.webLink}
          onPress={() => Linking.openURL(FULL_DOC_URL).catch(() => {})}
          accessibilityRole="link"
        >
          <Text style={styles.webLinkText}>{FULL_DOC_URL}</Text>
        </TouchableOpacity>
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
  iconBtnPlaceholder: { width: 40, height: 40 },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    marginHorizontal: 10,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  webLink: { marginTop: 4, paddingVertical: 8 },
  webLinkText: {
    fontSize: 13,
    color: colors.accentLight,
    textDecorationLine: 'underline',
  },
});
