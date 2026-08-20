import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// The competitor's little speaker next to the scientific name. expo-speech
// wraps speechSynthesis on web and the native TTS on stores, so the same
// component ships everywhere. Latin has no TTS voice anywhere - Italian is
// the standard phonetic stand-in (the research pass confirmed voices are
// per-device and 'la' does not exist). Failure is silent: a speaker that
// sometimes does nothing on an odd browser beats a crash, and the name is
// right there in writing.
export default function Pronounce({ text, color = colors.accentLight, size = 16 }) {
  const { t } = useTranslation();
  const [speaking, setSpeaking] = useState(false);
  if (!text) return null;

  const speak = () => {
    try {
      Speech.stop();
      setSpeaking(true);
      Speech.speak(text, {
        language: 'it-IT',
        rate: 0.85,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    } catch (e) {
      setSpeaking(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={speak}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={t('detail.pronounceLabel')}
    >
      <Ionicons name={speaking ? 'volume-high' : 'volume-medium-outline'} size={size} color={color} />
    </TouchableOpacity>
  );
}
