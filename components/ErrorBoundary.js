import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors } from './theme';

// Crash umbrella around the whole <App />. Without one, any render-time
// exception (a bad import, a hook misuse, an undefined field on a saved
// collection entry) unmounts the entire React tree and leaves a silently blank
// screen - the user just sees black and assumes the app is broken, with nothing
// to report and nothing in the UI to act on.
//
// This is deliberately dependency-free apart from the colour palette. It sits
// ABOVE the i18n bootstrap in App.js on purpose: if i18n itself is what failed
// to load (it fetches its locale JSON at runtime), something still has to be
// able to render a message. So the strings below are hardcoded rather than
// translated, with a small language guess from the browser - a translated crash
// screen that depends on the thing that crashed is worse than an English one.

const MESSAGES = {
  en: {
    title: 'Something went wrong',
    hint: 'Reloading usually fixes this. Your saved collection is stored on this device and has not been lost.',
    reload: 'Reload the app',
  },
  pt: {
    title: 'Algo deu errado',
    hint: 'Recarregar costuma resolver. Sua coleção salva fica guardada neste aparelho e não foi perdida.',
    reload: 'Recarregar o app',
  },
  es: {
    title: 'Algo salió mal',
    hint: 'Recargar suele solucionarlo. Tu colección guardada está en este dispositivo y no se ha perdido.',
    reload: 'Recargar la app',
  },
};

function crashLanguage() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'en';
  try {
    const locale = (navigator.language || '').toLowerCase();
    if (locale.startsWith('pt')) return 'pt';
    if (locale.startsWith('es')) return 'es';
  } catch {}
  return 'en';
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Goes to the browser console (and to any error reporter wired up later).
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] app crashed:', error, info?.componentStack);
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      // Native has no reload primitive here - clearing the error at least
      // re-attempts the render instead of leaving a dead screen.
      this.setState({ error: null });
    }
  };

  render() {
    if (this.state.error) {
      const copy = MESSAGES[crashLanguage()] || MESSAGES.en;
      return (
        <View style={styles.root}>
          <Text style={styles.title} accessibilityRole="header">
            {copy.title}
          </Text>
          {!!this.state.error?.message && (
            <Text style={styles.message}>{String(this.state.error.message)}</Text>
          )}
          <Text style={styles.hint}>{copy.hint}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReload}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={copy.reload}
          >
            <Text style={styles.buttonText}>{copy.reload}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 13.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
