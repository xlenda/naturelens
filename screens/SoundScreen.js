import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../components/theme';
import { CATEGORIES } from '../components/categories';
import { canRecord, startRecording, MAX_SECONDS } from '../components/audioRecorder';
import { identifySound } from '../components/identify';
import AlertModal from '../components/AlertModal';
import { useAppAlert } from '../components/useAppAlert';
import { recordIdentification, evaluateAchievements, addTokens } from '../components/achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from '../components/missions';
import { trackScanStarted, trackScanCompleted, trackScanFailed, trackPaywallShown } from '../components/tracking';
import PaywallModal from '../components/PaywallModal';
import { startCheckout } from '../components/subscription';
import NatureScene from '../components/NatureScene';

// Identification by SOUND - the one category with no camera.
//
// Covers more than birds: Perch's label space includes frogs, crickets,
// grasshoppers and mammals, so the copy deliberately says "sound of nature"
// rather than "birdsong". Calling it birdsong and then naming a frog would read
// as a bug.

// Bars in the live level meter. 5-7 reads as a meter; fewer reads as a blob.
const BAR_COUNT = 6;

export default function SoundScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const meta = CATEGORIES.sound;
  const { alertConfig, showAlert, hideAlert } = useAppAlert();

  const [recording, setRecording] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const handleRef = useRef(null);
  const tickRef = useRef(null);
  // Counts seconds outside React state, so the auto-stop can be decided in the
  // interval callback where side effects belong - see toggle().
  const elapsedRef = useRef(0);
  const pulse = useRef(new Animated.Value(1)).current;
  // Drives the decorative rings around the mic. Separate from `pulse` and on
  // the JS driver (useNativeDriver: false - this screen is web-only, see
  // canRecord). At 0 the rings sit static and faint; the loop only runs WHILE
  // recording, honouring the doctrine's "nunca loop infinito de decoração" -
  // the loop dies with the recording.
  const ringPulse = useRef(new Animated.Value(0)).current;

  // MEDIDOR DE NÍVEL REAL (web-only): an AnalyserNode taps the SAME
  // MediaStream the recorder already opened - real microphone data, zero
  // network. One Animated.Value per bar, driven by setValue from a rAF loop
  // (no re-render per frame). If the AudioContext cannot be built the bars are
  // simply not shown: ausência honesta, never fake levels.
  const barLevels = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0))).current;
  const [meterOn, setMeterOn] = useState(false);
  const audioCtxRef = useRef(null);
  const meterRafRef = useRef(0);

  // "A transition is in flight." A ref and not state, deliberately: setState is
  // asynchronous, and a double-tap lands inside the SAME React batch, so both
  // taps would read the old value and both would proceed.
  //
  // Two real bugs it closes, both found in review:
  //
  //  1. DOUBLE-TAP DURING startRecording(). getUserMedia takes 50-300ms to open
  //     the device. Both taps saw recording === false, both called
  //     startRecording(), and the second overwrote handleRef and tickRef - so the
  //     FIRST MediaStream became unreachable and its tracks were never stopped.
  //     The browser's recording indicator then stayed lit for the rest of the
  //     session, which is the exact privacy problem the unmount cleanup above
  //     claims to prevent (it only ever saw the second handle). The orphaned
  //     interval was worse: both incremented the same elapsedRef, so the
  //     countdown ran at 2/sec into negative numbers, and the leaked one went on
  //     calling stopAndAnalyse() once a second forever - killing every later
  //     recording after ~1s with a bogus "too short" alert, even after navigating
  //     away.
  //
  //  2. THE GAP BETWEEN setRecording(false) AND setAnalysing(true). The button
  //     was live in that window and `if (analysing) return` had not become true
  //     yet, so a tap started a fresh recording while the previous clip was still
  //     being identified - spending a second quota or paid credit.
  const busyRef = useRef(false);

  // Runs `fn` only if nothing else is mid-transition. Every entry point into
  // start/stop goes through here, including the interval's auto-stop, which used
  // to call stopAndAnalyse() directly and so bypassed every guard.
  const runExclusive = useCallback(async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await fn();
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Tears the meter down completely: rAF loop, AudioContext, bars back to
  // zero. Idempotent, so every exit path (stop, unmount, failed start) can
  // call it without caring about the others.
  const stopMeter = useCallback(() => {
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = 0;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close().catch(() => {});
      } catch (e) {}
      audioCtxRef.current = null;
    }
    setMeterOn(false);
    barLevels.forEach((v) => v.setValue(0));
  }, [barLevels]);

  const startMeter = useCallback(
    (stream) => {
      // Web-only guard: AnalyserNode is a browser API. Anything missing or
      // throwing means NO meter (ausência honesta) - recording is unaffected.
      if (Platform.OS !== 'web' || !stream || typeof window === 'undefined') return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        // Tapping the stream does not consume it - MediaRecorder keeps its own
        // track reference, and this node graph is discarded by stopMeter().
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        // Only the lower half of the spectrum: at a 44.1/48 kHz device rate the
        // top bins sit above ~12 kHz, where nature recordings carry almost
        // nothing - bars pinned at zero would read as broken.
        const usable = Math.floor(data.length / 2);
        const band = Math.floor(usable / BAR_COUNT);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          for (let i = 0; i < BAR_COUNT; i += 1) {
            let sum = 0;
            for (let j = i * band; j < (i + 1) * band; j += 1) sum += data[j];
            // 0-255 average, normalised so ordinary ambient sound already
            // moves the bars; capped at 1.
            barLevels[i].setValue(Math.min(1, sum / band / 180));
          }
          meterRafRef.current = requestAnimationFrame(tick);
        };
        meterRafRef.current = requestAnimationFrame(tick);
        setMeterOn(true);
      } catch (e) {
        stopMeter();
      }
    },
    [barLevels, stopMeter]
  );

  // Releasing the microphone on unmount is not optional tidiness: leaving the
  // track open keeps the browser's "recording" indicator lit for the rest of
  // the session, which is a privacy problem, not a cosmetic one.
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      handleRef.current?.cancel();
      stopMeter();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopMeter is
    // identity-stable (useCallback over a ref-stable array); unmount-only.
    []
  );

  const runPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  // Subtle breathing of the decorative rings, slower than the button's own
  // pulse so the two don't strobe together. Started with the recording and
  // stopped with it in stopAndAnalyse - decoration never loops while idle.
  const runRingPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(ringPulse, { toValue: 0, duration: 1400, useNativeDriver: false }),
      ])
    ).start();
  }, [ringPulse]);

  const analyse = async (clip) => {
    setAnalysing(true);
    trackScanStarted({ category: 'sound', source: 'microphone' });
    try {
      const entity = await identifySound(clip.base64, clip.sampleRate);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackScanCompleted({ category: 'sound', confidence: entity.confidence });

      await recordIdentification();
      const done = await recordMissionEvent('scan', { category: 'sound' });
      if (done.length) await addTokens(done.length * TOKENS_PER_MISSION);
      await evaluateAchievements();

      navigation.navigate('SoundDetail', { plant: entity, fromIdentify: true });
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err.paymentRequired) {
        trackScanFailed({ category: 'sound', reason: 'payment_required' });
        trackPaywallShown({ trigger: 'free_limit', category: 'sound' });
        setPaywallVisible(true);
        return;
      }
      trackScanFailed({ category: 'sound', reason: err.offline ? 'offline' : 'api_error' });
      showAlert(
        err.offline ? t('identify.offlineTitle') : t('sound.failedTitle'),
        err.offline ? t('identify.offlineBody') : err.message || t('sound.failedBody')
      );
    } finally {
      setAnalysing(false);
      elapsedRef.current = 0;
      setElapsed(0);
    }
  };

  const stopAndAnalyse = async () => {
    if (tickRef.current) clearInterval(tickRef.current);
    pulse.stopAnimation();
    pulse.setValue(1);
    ringPulse.stopAnimation();
    ringPulse.setValue(0);
    stopMeter();
    setRecording(false);

    const handle = handleRef.current;
    handleRef.current = null;
    if (!handle) return;

    try {
      const clip = await handle.stop();
      // Under ~1.5s there is rarely a full call in the clip, and Perch pads
      // short input with silence - better to say so than to return a confident
      // guess built mostly from nothing.
      if (clip.durationSeconds < 1.5) {
        showAlert(t('sound.tooShortTitle'), t('sound.tooShortBody'));
        return;
      }
      await analyse(clip);
    } catch (err) {
      const key =
        err.code === 'decode' || err.code === 'resample'
          ? 'sound.decodeFailedBody'
          : err.code === 'empty'
          ? 'sound.tooShortBody'
          : 'sound.failedBody';
      showAlert(t('sound.failedTitle'), t(key));
    }
  };

  const toggle = () =>
    runExclusive(async () => {
      if (analysing) return;

      if (recording) {
        await stopAndAnalyse();
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        // Any leftover interval is cleared before a new one can be created, so
        // two timers can never share elapsedRef.
        if (tickRef.current) clearInterval(tickRef.current);
        // Likewise release a handle that somehow survived, rather than orphaning
        // its microphone track.
        handleRef.current?.cancel();
        // And a meter that somehow survived with it (stopMeter is idempotent).
        stopMeter();

        handleRef.current = await startRecording();
        setRecording(true);
        elapsedRef.current = 0;
        setElapsed(0);
        runPulse();
        runRingPulse();
        // Level meter fed by the SAME MediaStream the recorder holds - real
        // data, zero network (see startMeter for the honest-absence fallback).
        startMeter(handleRef.current.stream);

        tickRef.current = setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
          // The recorder hard-stops itself at MAX_SECONDS; mirror that here so
          // the UI submits instead of sitting on a finished recording.
          //
          // This lives in the interval callback, NOT inside a setElapsed updater.
          // Updaters have to be pure: React may run one twice, and firing the
          // submit twice from inside one is the kind of bug that only shows up
          // under StrictMode or a future React version. It also goes through
          // runExclusive, so the auto-stop cannot race a tap on the button.
          if (elapsedRef.current >= MAX_SECONDS) runExclusive(stopAndAnalyse);
        }, 1000);
      } catch (err) {
        const key = err.code === 'permission' ? 'sound.permissionBody' : 'sound.unsupportedBody';
        showAlert(
          err.code === 'permission' ? t('sound.permissionTitle') : t('sound.unsupportedTitle'),
          t(key)
        );
      }
    });

  const handleSubscribe = async (plan) => {
    setSubscribing(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      setSubscribing(false);
      showAlert(t('paywall.checkoutFailedTitle'), e.message || t('paywall.checkoutFailedBody'));
    }
  };

  const supported = canRecord();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Cenário em camadas: FIRST child of the root, pointerEvents="none"
          inside the component, and the root keeps backgroundColor underneath
          (see NatureScene.js / diagramacao-premium doctrine). */}
      <NatureScene accent={meta.accent} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          {t('categories.sound.title')}
        </Text>
        <Text style={styles.subtitle}>{t('categories.sound.subtitle')}</Text>

        {!supported ? (
          <View style={styles.warnBox}>
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <Text style={styles.warnText}>{t('sound.unsupportedBody')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.micWrap}>
              {/* Anéis decorativos em volta do mic. Decoration in a
                  pointerEvents="none" layer so it can never steal the tap
                  (mesma regra do cenário). Static and faint while idle
                  (ringPulse = 0); they only breathe while recording. */}
              <View style={styles.ringLayer} pointerEvents="none">
                <View style={styles.ringBox}>
                  <Animated.View
                    style={[
                      styles.ring,
                      styles.ringOuter,
                      {
                        borderColor: meta.accent,
                        opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.34] }),
                        transform: [
                          { scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                        ],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.ring,
                      styles.ringInner,
                      {
                        borderColor: meta.accent,
                        opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.5] }),
                        transform: [
                          { scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
                        ],
                      },
                    ]}
                  />
                </View>
              </View>
              <Animated.View style={{ transform: [{ scale: recording ? pulse : 1 }] }}>
                <TouchableOpacity
                  style={[
                    styles.micButton,
                    { backgroundColor: recording ? colors.error : meta.accent },
                    analysing && { opacity: 0.5 },
                  ]}
                  onPress={toggle}
                  disabled={analysing}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={recording ? t('sound.stopLabel') : t('sound.startLabel')}
                >
                  <Ionicons
                    name={analysing ? 'hourglass-outline' : recording ? 'stop' : 'mic'}
                    size={40}
                    color={colors.white}
                  />
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Medidor de nível REAL: only while recording AND only when the
                AnalyserNode actually came up (meterOn) - hidden otherwise, the
                honest absence over a fake equalizer. */}
            {recording && meterOn && (
              <View style={styles.meterRow} pointerEvents="none">
                {barLevels.map((level, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.meterBar,
                      {
                        backgroundColor: meta.accent,
                        height: level.interpolate({ inputRange: [0, 1], outputRange: [4, 34] }),
                      },
                    ]}
                  />
                ))}
              </View>
            )}

            <Text style={styles.status}>
              {analysing
                ? t('sound.analysing')
                : recording
                ? t('sound.recording', { seconds: MAX_SECONDS - elapsed })
                : t('sound.tapToRecord')}
            </Text>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>{t('sound.tipsTitle')}</Text>
              {[1, 2, 3].map((n) => (
                <View key={n} style={styles.tipRow}>
                  <Ionicons name="ellipse" size={5} color={meta.accent} />
                  <Text style={styles.tipText}>{t(`sound.tip${n}`)}</Text>
                </View>
              ))}
            </View>

            {/* Honest scope note. Perch covers frogs, crickets, grasshoppers and
                mammals as well as birds - and it is trained on wild recordings,
                so a dog barking in a city street is outside what it knows. */}
            <Text style={styles.scopeNote}>{t('sound.scopeNote')}</Text>
          </>
        )}
      </ScrollView>

      <PaywallModal
        visible={paywallVisible}
        categoryLabel={t('categories.sound.label')}
        accent={meta.accent}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onCancel={() => setPaywallVisible(false)}
      />

      <AlertModal
        visible={!!alertConfig}
        title={alertConfig?.title}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={hideAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 24, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 8 },
  subtitle: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  // The halo space is reserved with padding (12 + 32 keeps the previous 44px
  // visual top) so the 180px outer ring never overlaps the status text below.
  micWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 32,
  },
  // Rings centred on the button: an absoluteFill layer centres a fixed
  // 180x180 box, and the rings position absolutely INSIDE it - centring
  // absolute children via the parent's alignItems is Yoga-only and does not
  // survive react-native-web.
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBox: { width: 180, height: 180 },
  ring: { position: 'absolute', borderWidth: 1.5 },
  ringOuter: { top: 0, left: 0, width: 180, height: 180, borderRadius: 90 },
  ringInner: { top: 16, left: 16, width: 148, height: 148, borderRadius: 74 },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    marginBottom: 12,
  },
  meterBar: { width: 5, borderRadius: 3 },
  micButton: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  warnBox: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: colors.warning + '1A',
    borderWidth: 1,
    borderColor: colors.warning + '44',
    borderRadius: 12,
    padding: 14,
    marginTop: 28,
  },
  warnText: { flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 20 },
  tipsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 34,
  },
  tipsTitle: { color: colors.text, fontSize: 14.5, fontWeight: '700', marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 7 },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },
  scopeNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 20,
  },
});
