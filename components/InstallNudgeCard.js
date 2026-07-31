import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';
import {
  canPromptInstall,
  isStandalone,
  isIOS,
  onInstallAvailabilityChange,
  promptInstall,
} from './pwaInstall';
import AlertModal from './AlertModal';
import { useAppAlert } from './useAppAlert';

const DISMISSED_KEY = '@naturelens_install_nudge_dismissed';

export default function InstallNudgeCard({ show, accent = colors.accent }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  useEffect(() => {
    if (!show || Platform.OS !== 'web') return undefined;

    let cancelled = false;
    const refresh = async () => {
      const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
      if (cancelled || dismissed) return;
      setVisible(!isStandalone() && (canPromptInstall() || isIOS()));
    };
    refresh();
    return onInstallAvailabilityChange(refresh);
  }, [show]);

  const dismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(DISMISSED_KEY, '1');
  };

  const handleInstall = async () => {
    if (canPromptInstall()) {
      await promptInstall();
      await dismiss();
      return;
    }
    if (isIOS()) {
      showAlert(t('profile.installAppIOSTitle'), t('profile.installAppIOSBody'));
      await dismiss();
    }
  };

  if (!visible) return null;

  return (
    <>
      <View style={[styles.card, { borderColor: accent + '55' }]}>
        <View style={styles.row}>
          <Ionicons
            name="download-outline"
            size={22}
            color={accent}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <View style={styles.textCol}>
            <Text style={styles.title}>{t('detail.installNudgeTitle')}</Text>
            <Text style={styles.body}>{t('detail.installNudgeBody')}</Text>
          </View>
          <TouchableOpacity
            onPress={dismiss}
            style={styles.closeBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.installBtn, { backgroundColor: accent }]}
          onPress={handleInstall}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('profile.installApp')}
        >
          <Text style={styles.installBtnText}>{t('profile.installApp')}</Text>
        </TouchableOpacity>
      </View>

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    ...shadow,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  textCol: { flex: 1, marginLeft: 10 },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  body: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  closeBtn: { padding: 4, marginLeft: 6 },
  installBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  installBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
