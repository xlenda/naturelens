import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import NatureScene from '../components/NatureScene';
import ZoneBand from '../components/ZoneBand';
import { colors } from '../components/theme';

// `icon` is purely decorative (diagramacao-premium: decoration adds no text and
// steals no meaning) - the question/answer copy stays byte for byte.
function Question({ icon, title, children }) {
  return (
    <View style={styles.item}>
      <View style={styles.questionRow}>
        <View style={styles.iconChip}>
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <Text style={styles.question}>{title}</Text>
      </View>
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
      {/* Cenario em camadas (diagramacao-premium): first child of the root,
          pointerEvents none inside, root keeps its backgroundColor beneath. */}
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
        <Text style={styles.topTitle} accessibilityRole="header">{t('help.title')}</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Zona de cor (diagramacao-premium): each thematic group of questions
            lives in a full-bleed band; the gap between bands is the scene
            showing through. ZoneBand is a pure wrapper - the question order
            (quente-primeiro) is untouched. */}
        <ZoneBand>
          <Question icon="scan" title={t('help.identificationTitle')}>{t('help.identificationBody')}</Question>
          <Question icon="scan" title={t('help.accuracyTitle')}>{t('help.accuracyBody')}</Question>
        </ZoneBand>
        <ZoneBand>
          <Question icon="pricetag" title={t('help.freeTitle')}>{t('help.freeBody')}</Question>
          <Question icon="card" title={t('help.cancelTitle')}>{t('help.cancelBody')}</Question>
          <Question icon="key" title={t('help.restoreTitle')}>{t('help.restoreBody')}</Question>
          <Question icon="pricetag" title={t('help.tokensTitle')}>{t('help.tokensBody')}</Question>
        </ZoneBand>
        <ZoneBand>
          <Question icon="shield" title={t('help.privacyTitle')}>{t('help.privacyBody')}</Question>
          <Question icon="shield" title={t('help.deleteTitle')}>{t('help.deleteBody')}</Question>
          <Question icon="scan" title={t('help.offlineTitle')}>{t('help.offlineBody')}</Question>
          <Question icon="key" title={t('help.languageTitle')}>{t('help.languageBody')}</Question>
        </ZoneBand>
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
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.text,
  },
  answer: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
