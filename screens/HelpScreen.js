import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import BackChevron from '../components/BackChevron';
import { colors } from '../components/theme';

function Question({ title, children }) {
  return (
    <View style={styles.item}>
      <Text style={styles.question}>{title}</Text>
      <Text style={styles.answer}>{children}</Text>
    </View>
  );
}

// Entirely in-app, on purpose - no support email exists to link to, and this
// project's standing rule is to never invent a placeholder one (see
// terms.contactBody, which stays deliberately vague for the same reason). A
// real FAQ covering the app's actual current behavior serves most support
// needs without needing an inbox at all.
export default function HelpScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

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
        <Text style={styles.topTitle} accessibilityRole="header">{t('help.title')}</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Question title={t('help.identificationTitle')}>{t('help.identificationBody')}</Question>
        <Question title={t('help.accuracyTitle')}>{t('help.accuracyBody')}</Question>
        <Question title={t('help.freeTitle')}>{t('help.freeBody')}</Question>
        <Question title={t('help.cancelTitle')}>{t('help.cancelBody')}</Question>
        <Question title={t('help.restoreTitle')}>{t('help.restoreBody')}</Question>
        <Question title={t('help.tokensTitle')}>{t('help.tokensBody')}</Question>
        <Question title={t('help.privacyTitle')}>{t('help.privacyBody')}</Question>
        <Question title={t('help.deleteTitle')}>{t('help.deleteBody')}</Question>
        <Question title={t('help.offlineTitle')}>{t('help.offlineBody')}</Question>
        <Question title={t('help.languageTitle')}>{t('help.languageBody')}</Question>
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
  item: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  question: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  answer: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
