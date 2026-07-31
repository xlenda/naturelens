import React, { useState, useEffect, useRef } from 'react';
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

  // A translation belongs to the exact string it was made from.
  //
  // `text` is not fixed for the life of this component: FishDetailScreen decides
  // which source leads, and that decision changes the moment the Wikipedia
  // lookup resolves. So this really happens - open a fish, tap Translate on the
  // vendor's table while the lookup is still in flight, and a second later the
  // lead becomes the Wikipedia prose while this component is still rendering
  // `translated`. The reader is then shown a translation of a paragraph that is
  // no longer on the screen.
  //
  // Clearing on change is the only correct behaviour: the new text has not been
  // translated, so the button comes back and nothing stale is displayed.
  useEffect(() => {
    setTranslated(null);
    setFailed(false);
  }, [text]);

  // Same for the reader switching language mid-screen - a Portuguese
  // translation must not survive into a Korean session.
  useEffect(() => {
    setTranslated(null);
    setFailed(false);
  }, [i18n.language]);

  // What is on screen RIGHT NOW, readable from inside an async callback that
  // captured older values. A ref rather than state because it must be current at
  // the moment the response lands, not at the moment of the last render.
  const currentRef = useRef({ text, language: i18n.language });
  currentRef.current = { text, language: i18n.language };

  const language = String(i18n.language || 'en').slice(0, 2).toLowerCase();
  // An English reader has nothing to translate to.
  const offerable = showWhenEnglish && language !== 'en' && !!text && !translated;

  const handleTranslate = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);

    // What was asked for, so a late answer can be checked against what is on
    // screen now. The effects above clear `translated` when the text changes,
    // but a request already in flight would land afterwards and put the old
    // paragraph's translation over the new paragraph - the same bug, arriving by
    // a different route.
    const requestedText = text;
    const requestedLanguage = i18n.language;

    try {
      const deviceId = await getDeviceId();
      const response = await fetch(`${API_BASE}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: requestedText, language: requestedLanguage, deviceId }),
      });
      const data = await response.json().catch(() => null);

      // Discard silently if the screen moved on. Showing an error would be
      // wrong - nothing failed, the answer is just no longer wanted.
      if (currentRef.current.text !== requestedText) return;
      if (currentRef.current.language !== requestedLanguage) return;

      if (!response.ok || !data?.translated) {
        // A null translation is "nothing to do", not a crash - but from the
        // reader's side, a button that did nothing is a failure either way.
        setFailed(true);
        return;
      }
      setTranslated(data.translated);
    } catch (e) {
      if (currentRef.current.text === requestedText) setFailed(true);
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
