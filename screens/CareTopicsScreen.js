import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '../components/theme';
import TopBar from '../components/TopBar';
import NatureScene from '../components/NatureScene';
import HelpfulRow from '../components/HelpfulRow';

// The competitor's species MANUAL: one screen, a horizontally scrollable tab
// bar of care/knowledge topics, and the full text of the active topic below -
// studied frame by frame from the owner's video ("abre várias abas e vai indo
// pro lado explicando cada coisa"). Generic on purpose: every category's
// detail screen feeds it its own topics via route params, so ONE screen
// serves plants, insects, fish, everything.
//
// params: {
//   title:      screen title (species name)
//   accent:     category accent colour
//   category:   category key (for the feedback event)
//   topics:     [{ key, label, text }] - label already translated, text is
//               the entity's REAL content (now server-translated)
//   initialKey: which tab opens first (deep-link from the hub's cards)
// }
export default function CareTopicsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { title, accent = colors.accent, category = 'plant', topics = [], initialKey } = route.params || {};

  const valid = topics.filter((tp) => tp && tp.key && tp.text);
  const [activeKey, setActiveKey] = useState(
    valid.some((tp) => tp.key === initialKey) ? initialKey : valid[0]?.key
  );
  const active = valid.find((tp) => tp.key === activeKey);
  const tabsRef = useRef(null);
  const bodyRef = useRef(null);

  // Deep-linking again from the hub (screen already mounted) must retarget.
  useEffect(() => {
    if (initialKey && valid.some((tp) => tp.key === initialKey)) setActiveKey(initialKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const selectTab = (key) => {
    setActiveKey(key);
    bodyRef.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenario em camadas: first child, pointerEvents none inside. */}
      <NatureScene accent={accent} />

      <TopBar title={title || ''} onBack={() => navigation.goBack()} />

      {/* Tab bar horizontal rolavel - underline curto na ativa, como no
          concorrente. Fica FORA do scroll vertical para sobreviver ao scroll. */}
      <View style={styles.tabsWrap}>
        <ScrollView
          ref={tabsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {valid.map((tp) => {
            const isActive = tp.key === activeKey;
            return (
              <TouchableOpacity
                key={tp.key}
                style={styles.tab}
                onPress={() => selectTab(tp.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tp.label}
              >
                <Text style={[styles.tabText, isActive && { color: accent }]}>{tp.label}</Text>
                <View style={[styles.tabUnderline, isActive && { backgroundColor: accent }]} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        ref={bodyRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!!active && (
          <View style={styles.topicCard}>
            <Text style={styles.topicTitle}>{active.label}</Text>
            {String(active.text)
              .split(/\n{2,}|(?<=\.)\s{2,}/)
              .filter(Boolean)
              .map((para, i) => (
                <Text key={i} style={styles.body}>
                  {para.trim()}
                </Text>
              ))}
          </View>
        )}

        {/* Feedback por aba, o dispositivo de qualidade do concorrente. */}
        <HelpfulRow category={category} context={`topic:${activeKey}`} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsWrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tabsContent: { paddingHorizontal: 12, gap: 4 },
  tab: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 0, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textMuted, paddingBottom: 8 },
  tabUnderline: { height: 3, borderRadius: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingBottom: 40 },
  topicCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  topicTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 22, color: colors.textSecondary, marginBottom: 12 },
});
