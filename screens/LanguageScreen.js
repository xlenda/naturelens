import React from 'react';
import { Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../components/theme';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import PressScale from '../components/PressScale';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../i18n';

// Languages in their own screen (the competitor's device), out of the Profile
// scroll where 17 rows drowned everything below them. Each language is
// written in ITSELF (the endonym - SUPPORTED_LANGUAGES' labels already are),
// because the row must be readable by the person who needs it: someone stuck
// in a language they don't speak. For the same reason the screen stays open
// after a tap - the checkmark moving and the title re-rendering in the new
// language IS the confirmation.
export default function LanguageScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas: first child, pointerEvents none inside. */}
      <NatureScene />

      <TopBar title={t('profile.language')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = i18n.language === lang.code;
          return (
            <PressScale key={lang.code}>
              <TouchableOpacity
                style={[styles.languageRow, isActive && styles.languageRowActive]}
                activeOpacity={0.7}
                onPress={async () => await setAppLanguage(lang.code)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Switch language to ${lang.label}`}
              >
                <Text style={styles.languageText}>{lang.label}</Text>
                {isActive && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.accent}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                )}
              </TouchableOpacity>
            </PressScale>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingTop: 6, paddingBottom: 40 },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  languageRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  languageText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
