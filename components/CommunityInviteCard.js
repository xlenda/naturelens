import React from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import PressScale from './PressScale';
import { colors, radius, space, type } from './theme';
import { recordShare, addTokens } from './achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from './missions';
import { trackResultShared } from './tracking';

const APP_URL = 'https://naturelensapp.cloud';

export default function CommunityInviteCard({ accent = colors.accent, mode = 'invite' }) {
  const { t } = useTranslation();
  const careMode = mode === 'care';

  const onInvite = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = t('community.inviteMessage', { url: APP_URL });
    recordShare();
    recordMissionEvent('share').then((done) => {
      if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
    });

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'NatureLens', text: message });
        trackResultShared({ category: 'community', method: 'web_share_text' });
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        trackResultShared({ category: 'community', method: 'whatsapp_link' });
        return;
      }
      await Share.share({ message });
      trackResultShared({ category: 'community', method: 'native_sheet' });
    } catch (e) {
      // Cancelar o compartilhamento nao e erro de produto.
    }
  };

  return (
    <SectionCard icon={careMode ? 'leaf-outline' : 'people-outline'} title={t('community.title')} color={accent}>
      <View style={styles.headerRow}>
        <View style={[styles.badge, { backgroundColor: accent + '1F' }]}>
          <Ionicons name={careMode ? 'chatbubbles-outline' : 'sparkles-outline'} size={18} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.headline}>
            {t(careMode ? 'community.careExchangeTitle' : 'community.headline')}
          </Text>
          <Text style={styles.body}>
            {t(careMode ? 'community.careExchangeBody' : 'community.body')}
          </Text>
        </View>
      </View>

      {careMode ? (
        <View style={styles.topicGrid}>
          {[
            ['water-outline', 'watering'],
            ['bug-outline', 'pests'],
            ['images-outline', 'recovery'],
            ['chatbubble-ellipses-outline', 'questions'],
          ].map(([icon, key]) => (
            <View key={key} style={styles.topicChip}>
              <Ionicons name={icon} size={15} color={accent} />
              <Text style={styles.topicText}>{t(`community.careTopics.${key}`)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.steps}>
          {['identify', 'save', 'share'].map((key, index) => (
            <View key={key} style={styles.step}>
              <View style={[styles.stepDot, { borderColor: accent }]}>
                <Text style={[styles.stepNumber, { color: accent }]}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{t(`community.steps.${key}`)}</Text>
            </View>
          ))}
        </View>
      )}

      <PressScale>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: accent }]}
          onPress={onInvite}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={t(careMode ? 'community.careShareAction' : 'community.inviteAction')}
        >
          <Ionicons name="paper-plane-outline" size={16} color={colors.white} />
          <Text style={styles.buttonText}>
            {t(careMode ? 'community.careShareAction' : 'community.inviteAction')}
          </Text>
        </TouchableOpacity>
      </PressScale>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  headline: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  body: { ...type.body, marginTop: 3 },
  steps: { gap: 8, marginTop: space.md },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { fontSize: 11, lineHeight: 14, fontWeight: '900' },
  stepText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md },
  topicChip: {
    minHeight: 40,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
  },
  topicText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  button: {
    minHeight: 48,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: space.md,
  },
  buttonText: { color: colors.white, fontSize: 14, lineHeight: 18, fontWeight: '900' },
});
