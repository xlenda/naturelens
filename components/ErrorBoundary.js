import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors } from './theme';
import { recoverWebApp } from './appRecovery';

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
  de: { title: 'Etwas ist schiefgelaufen', hint: 'Ein Neustart behebt das meist. Deine gespeicherte Sammlung bleibt auf diesem Gerät erhalten.', reload: 'App neu laden' },
  fr: { title: 'Un problème est survenu', hint: 'Recharger résout généralement le problème. Votre collection enregistrée reste sur cet appareil.', reload: "Recharger l’application" },
  it: { title: 'Qualcosa è andato storto', hint: 'Ricaricare di solito risolve il problema. La raccolta salvata resta su questo dispositivo.', reload: "Ricarica l’app" },
  nl: { title: 'Er is iets misgegaan', hint: 'Opnieuw laden lost dit meestal op. Je opgeslagen verzameling blijft op dit apparaat bewaard.', reload: 'App opnieuw laden' },
  pl: { title: 'Coś poszło nie tak', hint: 'Ponowne uruchomienie zwykle pomaga. Zapisana kolekcja pozostaje na tym urządzeniu.', reload: 'Uruchom aplikację ponownie' },
  sv: { title: 'Något gick fel', hint: 'En omladdning löser oftast problemet. Din sparade samling finns kvar på enheten.', reload: 'Ladda om appen' },
  da: { title: 'Noget gik galt', hint: 'En genindlæsning løser som regel problemet. Din gemte samling bliver på denne enhed.', reload: 'Genindlæs appen' },
  cs: { title: 'Něco se pokazilo', hint: 'Opětovné načtení obvykle pomůže. Uložená sbírka zůstává v tomto zařízení.', reload: 'Načíst aplikaci znovu' },
  tr: { title: 'Bir sorun oluştu', hint: 'Yeniden yüklemek genellikle sorunu çözer. Kaydedilen koleksiyonunuz bu cihazda kalır.', reload: 'Uygulamayı yeniden yükle' },
  ko: { title: '문제가 발생했습니다', hint: '앱을 다시 불러오면 대부분 해결됩니다. 저장한 컬렉션은 이 기기에 그대로 있습니다.', reload: '앱 다시 불러오기' },
  zh: { title: '出现了问题', hint: '重新加载通常可以解决。已保存的收藏仍保留在此设备上。', reload: '重新加载应用' },
  'zh-hant': { title: '發生問題', hint: '重新載入通常可以解決。已儲存的收藏仍保留在此裝置上。', reload: '重新載入應用程式' },
  hi: { title: 'कुछ गड़बड़ हुई', hint: 'ऐप दोबारा लोड करने से आम तौर पर समस्या ठीक हो जाती है। आपका संग्रह इसी डिवाइस पर सुरक्षित है।', reload: 'ऐप दोबारा लोड करें' },
  ar: { title: 'حدث خطأ ما', hint: 'إعادة تحميل التطبيق تحل المشكلة غالبًا. تبقى مجموعتك المحفوظة على هذا الجهاز.', reload: 'إعادة تحميل التطبيق' },
};

function crashLanguage() {
  try {
    const locale = String(
      Platform.OS === 'web' && typeof navigator !== 'undefined'
        ? navigator.language
        : Intl.DateTimeFormat().resolvedOptions().locale,
    ).toLowerCase();
    if (locale.startsWith('zh-hant') || locale.startsWith('zh-tw') || locale.startsWith('zh-hk')) return 'zh-hant';
    const primary = locale.split('-')[0];
    if (MESSAGES[primary]) return primary;
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

  handleReload = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      await recoverWebApp();
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
