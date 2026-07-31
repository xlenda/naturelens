import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import { colors } from '../components/theme';

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
});
