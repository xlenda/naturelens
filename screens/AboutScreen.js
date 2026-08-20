import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../components/theme';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';

const APP_VERSION = '1.0.0';
const APP_URL = 'https://naturelensapp.cloud';

// About the App - the competitor's trio (app info / credits / links) as its
// own screen, reached from the Settings "About" section. Identity block first
// (logo, name, version, what-it-does), then credits, then the tappable links.

// Same row anatomy as SettingsScreen's Row (icon + label + chevron inside a
// grouped card) so the two screens read as one family.
function LinkRow({ icon, label, onPress, last }) {
  return (
    <PressScale>
      <TouchableOpacity
        style={[styles.row, !last && styles.rowDivider]}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon}
          size={19}
          color={colors.accentLight}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={styles.rowLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </TouchableOpacity>
    </PressScale>
  );
}

export default function AboutScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  // window.open on web (Linking.openURL is flaky in some mobile browsers /
  // PWA standalone), Linking everywhere else - the app's standard split.
  const openSite = () => {
    if (Platform.OS === 'web') {
      window.open(APP_URL, '_blank', 'noopener');
    } else {
      Linking.openURL(APP_URL);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas: first child, pointerEvents none inside the
          component, container keeps its backgroundColor underneath. */}
      <NatureScene />

      <TopBar title={t('about.appInfo')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <Image source={require('../assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text style={styles.appName}>NatureLens</Text>
          <Text style={styles.version}>{t('profile.version', { version: APP_VERSION })}</Text>
          <Text style={styles.whatBody}>{t('about.whatBody')}</Text>
        </View>

        {/* Data & credits: the APIs and photo sources deserve named credit,
            and the store listing requires it. */}
        <View style={styles.card}>
          <View style={styles.creditsBlock}>
            <Text style={styles.creditsTitle}>{t('about.creditsTitle')}</Text>
            <Text style={styles.creditsBody}>{t('about.creditsBody')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <LinkRow icon="globe-outline" label={t('about.visitSite')} onPress={openSite} />
          <LinkRow
            icon="document-lock-outline"
            label={t('profile.privacyPolicy')}
            onPress={() => navigation.navigate('Privacy')}
          />
          <LinkRow
            icon="document-text-outline"
            label={t('profile.termsOfUse')}
            onPress={() => navigation.navigate('Terms')}
            last
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  identity: { alignItems: 'center', paddingTop: 18, paddingBottom: 24 },
  logo: { width: 96, height: 96, borderRadius: 22 },
  appName: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 14 },
  version: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  whatBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  creditsBlock: { paddingHorizontal: 16, paddingVertical: 14 },
  creditsTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
  creditsBody: { fontSize: 12.5, lineHeight: 19, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
});
