import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BackChevron from '../components/BackChevron';
import PasswordInput from '../components/PasswordInput';
import { trackRestoreStarted, trackRestoreCompleted, trackRestoreFailed } from '../components/tracking';
import { colors, shadow } from '../components/theme';
import { requestRestoreCode, verifyRestoreCode, signInWithPassword, getGoogleSignInUrl } from '../components/restore';

export default function RestoreAccessScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  const [mode, setMode] = useState('code'); // 'code' | 'password'
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'done'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoredStatus, setRestoredStatus] = useState(null);

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await requestRestoreCode(email.trim());
      setStep('code');
    } catch (e) {
      setError(e.message || t('restore.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    trackRestoreStarted({ method: 'code' });
    try {
      const status = await verifyRestoreCode(email.trim(), code.trim());
      // This step is the most fragile handoff in the whole purchase flow (the
      // Hotmart buyer MUST pass through here to unlock the device), so success
      // and failure are both measured - a paid customer stuck here is the worst
      // silent outcome the funnel can have.
      trackRestoreCompleted({ method: 'code', status });
      setRestoredStatus(status);
      setStep('done');
    } catch (e) {
      trackRestoreFailed({ method: 'code', reason: 'invalid_code_or_no_subscription' });
      setError(e.message || t('restore.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError('');
    trackRestoreStarted({ method: 'password' });
    try {
      const status = await signInWithPassword(email.trim(), password);
      trackRestoreCompleted({ method: 'password', status });
      setRestoredStatus(status);
      setStep('done');
    } catch (e) {
      trackRestoreFailed({ method: 'password', reason: 'bad_credentials_or_no_subscription' });
      setError(e.message || t('restore.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setStep('email');
    setCode('');
    setPassword('');
    setError('');
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      window.location.href = await getGoogleSignInUrl();
    } catch (e) {
      setError(e.message || t('restore.genericError'));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <BackChevron size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header">{t('restore.title')}</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {step === 'email' && Platform.OS === 'web' && (
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('restore.signInWithGoogle')}
            >
              <Ionicons name="logo-google" size={18} color={colors.text} />
              <Text style={styles.googleBtnText}>{t('restore.signInWithGoogle')}</Text>
            </TouchableOpacity>
          )}

          {step === 'email' && (
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'code' && styles.modeBtnActive]}
                onPress={() => switchMode('code')}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('restore.modeCode')}
              >
                <Text style={[styles.modeBtnText, mode === 'code' && styles.modeBtnTextActive]}>
                  {t('restore.modeCode')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'password' && styles.modeBtnActive]}
                onPress={() => switchMode('password')}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('restore.modePassword')}
              >
                <Text style={[styles.modeBtnText, mode === 'password' && styles.modeBtnTextActive]}>
                  {t('restore.modePassword')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'email' && mode === 'code' && (
            <>
              <Text style={styles.heading}>{t('restore.emailStepTitle')}</Text>
              <Text style={styles.body}>{t('restore.emailStepBody')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('restore.emailPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy}
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                style={[styles.primaryBtn, (!email.trim() || busy) && { opacity: 0.6 }]}
                onPress={handleSendCode}
                disabled={!email.trim() || busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('restore.sendCode')}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('restore.sendCode')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 'email' && mode === 'password' && (
            <>
              <Text style={styles.heading}>{t('restore.passwordStepTitle')}</Text>
              <Text style={styles.body}>{t('restore.passwordStepBody')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('restore.emailPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy}
              />
              <PasswordInput
                style={styles.input}
                placeholder={t('restore.passwordPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                editable={!busy}
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                style={[styles.primaryBtn, (!email.trim() || !password || busy) && { opacity: 0.6 }]}
                onPress={handleSignIn}
                disabled={!email.trim() || !password || busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('restore.signIn')}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('restore.signIn')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.heading}>{t('restore.codeStepTitle')}</Text>
              <Text style={styles.body}>{t('restore.codeStepBody', { email: email.trim() })}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('restore.codePlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                editable={!busy}
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                style={[styles.primaryBtn, (!code.trim() || busy) && { opacity: 0.6 }]}
                onPress={handleVerifyCode}
                disabled={!code.trim() || busy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('restore.verifyCode')}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('restore.verifyCode')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('restore.changeEmail')}
              >
                <Text style={styles.linkBtnText}>{t('restore.changeEmail')}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'done' && (
            <>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
              </View>
              <Text style={styles.heading}>
                {restoredStatus === 'active' ? t('restore.doneTitleActive') : t('restore.doneTitleOther')}
              </Text>
              <Text style={styles.body}>
                {restoredStatus === 'active' ? t('restore.doneBodyActive') : t('restore.doneBodyOther')}
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('common.goBack')}
              >
                <Text style={styles.primaryBtnText}>{t('restore.backToProfile')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPlaceholder: { width: 40, height: 40 },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  content: { flex: 1, padding: 20, paddingTop: 24 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
    ...shadow,
  },
  googleBtnText: { color: colors.text, fontWeight: '700', fontSize: 14.5, marginLeft: 10 },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: 22,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  modeBtnTextActive: { color: colors.white },
  heading: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginBottom: 22 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
  },
  error: { color: colors.error, fontSize: 13, marginBottom: 14 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  linkBtn: { alignItems: 'center', paddingVertical: 16 },
  linkBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: 13.5 },
  successIcon: { alignItems: 'center', marginBottom: 18, marginTop: 8 },
});
