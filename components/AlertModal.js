import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';

export default function AlertModal({ visible, title, message, buttons, onRequestClose }) {
  // Hook must run unconditionally (before the early return) per the rules of
  // hooks - the default button label was the one hardcoded-English string left
  // in a 17-language app (Fable review finding).
  const { t } = useTranslation();
  const list = buttons?.length ? buttons : [{ text: t('common.ok') }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessibilityViewIsModal={true}
          onAccessibilityEscape={onRequestClose}
        >
          {!!title && <Text style={styles.title} accessibilityRole="header">{title}</Text>}
          {!!message && (
            <ScrollView
              style={styles.messageScroll}
              contentContainerStyle={styles.messageScrollContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              <Text style={styles.message}>{message}</Text>
            </ScrollView>
          )}
          <View style={styles.buttons}>
            {list.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  btn.style === 'cancel' && styles.btnCancel,
                  btn.style === 'destructive' && styles.btnDestructive,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  onRequestClose?.();
                  btn.onPress?.();
                }}
                accessibilityRole="button"
                accessibilityLabel={btn.text}
              >
                <Text
                  style={[
                    styles.btnText,
                    btn.style === 'cancel' && styles.btnTextCancel,
                    btn.style === 'destructive' && styles.btnTextDestructive,
                  ]}
                >
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 2000,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  messageScroll: { flexShrink: 1, marginBottom: 18 },
  messageScrollContent: { flexGrow: 1, justifyContent: 'center' },
  message: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, textAlign: 'center' },
  buttons: { gap: 8 },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  btnCancel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnDestructive: { backgroundColor: colors.error },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 14.5 },
  btnTextCancel: { color: colors.textSecondary },
  btnTextDestructive: { color: colors.white },
});
