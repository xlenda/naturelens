import React from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

// react-native-web's I18nManager is a complete no-op (confirmed by reading
// its own source: forceRTL() does nothing, isRTL always returns false
// hardcoded) - RTL support on this web-only app can't rely on it at all,
// unlike a native RN app. RTL is instead driven by a plain `dir="rtl"`
// attribute set on the web root when the active language is Arabic (see
// i18n.js's setAppLanguage), which auto-mirrors flex-row layouts through the
// browser's own CSS engine - but icon GLYPHS never mirror on their own, so
// directional icons like a back-chevron have to be swapped by hand.
export default function BackChevron({ size = 22, color }) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  return <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={size} color={color} />;
}
