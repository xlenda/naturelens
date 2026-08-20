import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { colors } from '../components/theme';
import { askSpecialist, reportSpecialistAnswer, ASK_ERRORS } from '../components/askSpecialist';

// The keyword matcher that used to live here is gone. It mapped a handful of
// words onto fixed canned answers while presenting itself as an AI botanist -
// the one dishonest surface in the app. Answers now come from a real model
// behind api/ask.js, given the persona of an agronomist.

export default function BotanistScreen({ route }) {
  const { t } = useTranslation();
  const flatRef = useRef(null);
  const [messages, setMessages] = useState([
    { id: 'intro', role: 'bot', text: t('botanist.intro') },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  // Message ids the user flagged. Optimistic: the checkmark appears on tap,
  // and a report lost to a flaky network is not worth an error dialog.
  const [reported, setReported] = useState({});

  const reportAnswer = (item) => {
    if (reported[item.id]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReported((r) => ({ ...r, [item.id]: true }));
    reportSpecialistAnswer(item.text).catch(() => {});
  };

  const suggestions = t('botanist.suggestions', { returnObjects: true });

  // Depende do OBJETO de params, nao da string. Com [route.params?.prefill] a
  // MESMA pergunta so preenchia o campo uma vez na vida: voltar ao resultado e
  // tocar de novo na mesma linha do "Duvidas frequentes" (SpeciesFaq, paridade
  // 120% - video do concorrente, 20/08) trocava de aba com o campo vazio,
  // porque a dependencia era a string e ela nao mudou. O navigate cria um
  // params novo a cada toque, entao a identidade do objeto e o gatilho certo.
  useEffect(() => {
    if (route.params?.prefill) {
      setInput(route.params.prefill);
    }
  }, [route.params]);

  const send = async (textArg) => {
    const text = (textArg ?? input).trim();
    // Guard on `typing` too: without it a second tap while the first answer is
    // in flight sends two questions and interleaves two replies.
    if (!text || typing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg = { id: Date.now().toString(), role: 'user', text };
    // Build the history from the state we are about to render, not from the
    // stale `messages` closure - otherwise the specialist never sees the
    // question just asked.
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setTyping(true);

    // Only real turns go to the model: the intro bubble is UI copy, and sending
    // it would make the specialist answer its own greeting.
    const history = nextMessages
      .filter((m) => m.id !== 'intro')
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

    try {
      const { text: reply } = await askSpecialist(history, route.params?.context);
      setMessages((m) => [...m, { id: Date.now().toString() + 'b', role: 'bot', text: reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      // Each failure gets its own honest sentence. A single generic "something
      // went wrong" would hide that the user is offline, or being rate limited,
      // or that the feature simply is not switched on yet.
      const key =
        err.code === ASK_ERRORS.OFFLINE
          ? 'botanist.errorOffline'
          : err.code === ASK_ERRORS.RATE_LIMITED
          ? 'botanist.errorRateLimited'
          : err.code === ASK_ERRORS.NOT_CONFIGURED
          ? 'botanist.errorNotConfigured'
          : 'botanist.errorGeneric';
      setMessages((m) => [
        ...m,
        { id: Date.now().toString() + 'e', role: 'bot', text: t(key), isError: true },
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTyping(false);
    }
  };

  useEffect(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, typing]);

  const renderItem = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.rowRight : styles.rowLeft]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons
              name="person"
              size={14}
              color={colors.white}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text style={[styles.msgText, isUser && { color: colors.white }]}>{item.text}</Text>
          {/* AI answers can be reported (Google Play AI-content policy asks
              for an in-app flag). Not on the intro (UI copy, not the model)
              and not on error bubbles (nothing generated to report). */}
          {!isUser && item.id !== 'intro' && !item.isError && (
            <TouchableOpacity
              style={styles.reportBtn}
              onPress={() => reportAnswer(item)}
              disabled={!!reported[item.id]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                reported[item.id] ? t('botanist.reportedLabel') : t('botanist.reportLabel')
              }
            >
              <Ionicons
                name={reported[item.id] ? 'checkmark-circle' : 'flag-outline'}
                size={12}
                color={reported[item.id] ? colors.accent : colors.textMuted}
              />
              <Text style={[styles.reportText, reported[item.id] && { color: colors.accent }]}>
                {reported[item.id] ? t('botanist.reportedLabel') : t('botanist.reportLabel')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons
            name="sparkles"
            size={18}
            color={colors.white}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </View>
        <View>
          <Text style={styles.headerTitle} accessibilityRole="header">{t('botanist.headerTitle')}</Text>
          <Text style={styles.headerSub}>{t('botanist.headerSubtitle')}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            typing ? (
              <View style={[styles.msgRow, styles.rowLeft]}>
                <View style={styles.avatar}>
                  <Ionicons
                    name="sparkles"
                    size={14}
                    color={colors.white}
                    accessibilityElementsHidden={true}
                    importantForAccessibility="no-hide-descendants"
                  />
                </View>
                <View style={[styles.bubble, styles.botBubble]}>
                  <Text style={styles.typingText}>{t('botanist.typing')}</Text>
                </View>
              </View>
            ) : null
          }
        />

        {messages.length <= 1 && (
          <View style={styles.suggestions}>
            {suggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.chip}
                activeOpacity={0.8}
                onPress={() => send(s)}
                accessibilityRole="button"
                accessibilityLabel={t('botanist.askLabel', { question: s })}
              >
                <Ionicons
                  name="leaf-outline"
                  size={13}
                  color={colors.accent}
                  accessibilityElementsHidden={true}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={styles.chipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={t('botanist.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={() => send()}
            disabled={!input.trim()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('botanist.sendLabel')}
          >
            <Ionicons
              name="send"
              size={18}
              color={colors.white}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted },
  list: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  botBubble: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  userBubble: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  msgText: { color: colors.text, fontSize: 14.5, lineHeight: 21 },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 2,
  },
  reportText: { color: colors.textMuted, fontSize: 11 },
  typingText: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic' },
  suggestions: { paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textSecondary, fontSize: 13, marginLeft: 8, flex: 1 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
});
