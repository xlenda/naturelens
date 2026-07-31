import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// Password field with a show/hide toggle - ported from Cosmic Guide's
// LoginScreen pattern (secureTextEntry={!showPassword} + eye button), extracted
// into one shared component because this app has two password fields
// (RestoreAccessScreen sign-in, ProfileScreen create-password) and an inline
// copy in each screen is exactly the kind of duplication that already bit this
// project once with the identify-*.js files.
//
// The caller passes its own `style` so the input matches each screen's existing
// input look; the wrapper only adds the right-side padding the eye needs.
export default function PasswordInput({ style, editable = true, ...props }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[style, styles.inputPadding]}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!visible}
        editable={editable}
        {...props}
      />
      <TouchableOpacity
        style={styles.eyeBtn}
        onPress={() => setVisible((v) => !v)}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('common.hidePassword') : t('common.showPassword')}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  // Room for the eye so long passwords don't slide underneath it.
  inputPadding: { paddingRight: 46 },
  eyeBtn: {
    position: 'absolute',
    right: 4,
    height: '100%',
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
