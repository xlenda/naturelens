import React, { useState } from 'react';
import { Text, TouchableOpacity, ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getDeviceId } from './deviceId';
import { API_BASE } from './apiBase';

// A block of text with a "Translate" button, shown only when the text is not
// already in the reader's language.
//
// WHY A BUTTON RATHER THAN AUTOMATIC
// Translating every paragraph costs tokens on text most people never read - the
// vendor's technical description sits below the fold, and the English Wikipedia
// fallback only appears for species with no article in the reader's language.
// Text that LEADS a screen is still translated automatically during the
// identification; this is for everything else.
//
// The result is kept in component state only. Persisting it would mean a cache
// keyed by (text, language) in device storage, for a string the user asked to
// see once - not worth the storage or the invalidation problem.

export default function TranslatableText({ text, style, showWhenEnglish = true }) {
  const { t, i18n } = useTranslation();
  const [translated, setTranslated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const language = String(i18n.language || 'en').slice(0, 2).toLowerCase();
  // An English reader has nothing to translate to.
  const offerable = showWhenEnglish && language !== 'en' && !!text && !translated;

  const handleTranslate = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const deviceId = await getDeviceId();
      const response = await fetch(`${API_BASE}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: i18n.language, deviceId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.translated) {
        // A null translation is "nothing to do", not a crash - but from the
        // reader's side, a button that did nothing is a failure either way.
        setFailed(true);
        return;
      }
      setTranslated(data.translated);
    } catch (e) {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={style}>{translated || text}</Text>

      {offerable && (
        <TouchableOpacity
          style={styles.row}
          onPress={handleTranslate}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('common.translate')}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.accentLight} />
          ) : (
            <Ionicons name="language-outline" size={14} color={colors.accentLight} />
          )}
          <Text style={styles.label}>{busy ? t('common.translating') : t('common.translate')}</Text>
        </TouchableOpacity>
      )}

      {failed && <Text style={styles.failed}>{t('common.translateFailed')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  label: { color: colors.accentLight, fontSize: 12.5, fontWeight: '700' },
  failed: { color: colors.textMuted, fontSize: 11.5, marginTop: 8 },
});
