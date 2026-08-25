import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';
import { sensoryFeedback } from './sensoryFeedback';
import useReducedMotion from './useReducedMotion';
import { LENS_PULSE_HOLD_MS } from './lensPulseTiming';
import { createLensPulseController } from './lensPulseController';

function preventWebGestureDefault(event) {
  event?.preventDefault?.();
  event?.nativeEvent?.preventDefault?.();
}

// O gesto precisa ser deliberado, mas nao pode excluir leitor de tela. A acao
// de acessibilidade conclui sem exigir pressao prolongada; toque comum continua
// sem enviar nenhuma evidencia.
export default function LensPulseButton({
  accent = colors.accent,
  disabled = false,
  eyebrow,
  label,
  holdingLabel,
  accessibilityHint,
  onComplete,
}) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const pressingRef = useRef(false);
  const accessibilityResetTimerRef = useRef(null);
  const completionVisualRef = useRef(null);
  const activationSourceRef = useRef('hold');
  const onCompleteRef = useRef(onComplete);
  const disabledRef = useRef(disabled);
  const controllerRef = useRef(null);
  const [holding, setHolding] = useState(false);

  if (!controllerRef.current) {
    controllerRef.current = createLensPulseController({
      onMidpoint: () => sensoryFeedback.selection(),
      onComplete: () => completionVisualRef.current?.(activationSourceRef.current),
    });
  }
  onCompleteRef.current = onComplete;
  disabledRef.current = disabled;

  const clearAccessibilityReset = useCallback(() => {
    if (accessibilityResetTimerRef.current) clearTimeout(accessibilityResetTimerRef.current);
    accessibilityResetTimerRef.current = null;
  }, []);

  const settle = useCallback((duration = 180) => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion ? 0 : duration,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  const finishVisual = useCallback((source = 'hold') => {
    if (disabledRef.current) return;
    pressingRef.current = false;
    setHolding(false);
    progress.stopAnimation();
    progress.setValue(1);
    sensoryFeedback.commit();
    onCompleteRef.current?.();

    // Leitor de tela nao produz onPressOut; devolva o controle ao repouso sem
    // deixar o botao visualmente travado depois da acao "activate".
    if (source === 'accessibility') {
      clearAccessibilityReset();
      accessibilityResetTimerRef.current = setTimeout(() => {
        controllerRef.current?.cancel();
        settle(220);
      }, 260);
    }
  }, [clearAccessibilityReset, progress, settle]);
  completionVisualRef.current = finishVisual;

  const start = useCallback(() => {
    if (disabled || pressingRef.current) return;
    activationSourceRef.current = 'hold';
    if (!controllerRef.current?.start()) return;
    pressingRef.current = true;
    setHolding(true);
    clearAccessibilityReset();
    progress.stopAnimation();
    progress.setValue(0);
    sensoryFeedback.open();
    Animated.timing(progress, {
      toValue: 1,
      duration: LENS_PULSE_HOLD_MS,
      useNativeDriver: true,
    }).start();
  }, [clearAccessibilityReset, disabled, progress]);

  const release = useCallback(() => {
    const result = controllerRef.current?.release();
    pressingRef.current = false;
    setHolding(false);
    settle(result === 'completed' ? 220 : 150);
  }, [settle]);

  const cancelGesture = useCallback(() => {
    pressingRef.current = false;
    clearAccessibilityReset();
    controllerRef.current?.cancel();
    setHolding(false);
    settle(0);
  }, [clearAccessibilityReset, settle]);

  const activate = useCallback(() => {
    if (disabledRef.current) return;
    const phase = controllerRef.current?.getPhase();
    // Leitores de tela e teclado podem repetir a mesma acao. Enquanto o
    // consentimento esta abrindo, a segunda ativacao deve ser inerte; nunca
    // rearmar o controlador e enviar duas conclusoes/hapticas.
    if (phase === 'awaitingConsent' || phase === 'disposed') return;
    if (phase === 'holding') controllerRef.current?.cancel();
    activationSourceRef.current = 'accessibility';
    controllerRef.current?.activate();
  }, []);

  useEffect(() => () => {
    pressingRef.current = false;
    clearAccessibilityReset();
    controllerRef.current?.dispose();
    progress.stopAnimation();
  }, [clearAccessibilityReset, progress]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancelGesture();
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('blur', cancelGesture);
    }
    return () => {
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('blur', cancelGesture);
      }
    };
  }, [cancelGesture]);

  useEffect(() => {
    if (!disabled) return;
    pressingRef.current = false;
    clearAccessibilityReset();
    controllerRef.current?.cancel();
    setHolding(false);
    settle(0);
  }, [clearAccessibilityReset, disabled, settle]);

  const fillScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.001, 1],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 0.9, 1.08],
  });
  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.08, 0.24, 0.42],
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        Platform.OS === 'web' && styles.webGestureSurface,
        { backgroundColor: accent },
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
      disabled={disabled}
      onPressIn={start}
      onPressOut={release}
      onPress={() => undefined}
      // No React Native Web, a mera presenca deste handler impede que um
      // contextmenu de toque roube o responder. Ele nunca conclui a acao: o
      // controller continua sendo a unica autoridade dos 820 ms.
      onLongPress={Platform.OS === 'web' ? preventWebGestureDefault : undefined}
      delayLongPress={LENS_PULSE_HOLD_MS}
      onContextMenu={Platform.OS === 'web' ? preventWebGestureDefault : undefined}
      onKeyDown={Platform.OS === 'web' ? (event) => {
        if (event?.nativeEvent?.repeat || event?.repeat) return;
        const key = event?.nativeEvent?.key || event?.key;
        if (key === 'Enter' || key === ' ') activate();
      } : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: holding }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'activate') activate();
      }}
    >
      {!reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.white,
              opacity: glowOpacity,
              transform: [{ scaleX: fillScale }],
            },
          ]}
        />
      ) : null}
      <View style={styles.content} pointerEvents="none">
        <Animated.View
          style={[
            styles.iconShell,
            { borderColor: colors.white + '88' },
            !reduceMotion && { transform: [{ scale: iconScale }] },
          ]}
        >
          <Ionicons name="scan-circle-outline" size={25} color={colors.white} />
        </Animated.View>
        <View style={styles.copy}>
          {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
          <Text style={styles.label} accessibilityLiveRegion="polite">
            {holding ? holdingLabel : label}
          </Text>
        </View>
        <Ionicons name="finger-print-outline" size={23} color={colors.white} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 68,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    userSelect: 'none',
  },
  // React Native Web encerra o responder quando o browser inicia uma selecao
  // de texto. Como este controle depende de 820 ms continuos, a superficie
  // precisa possuir o gesto enquanto pressionada; a rolagem segue livre fora
  // do botao e o teclado/leitor de tela continuam usando activate().
  webGestureSurface: {
    userSelect: 'none',
    touchAction: 'none',
  },
  buttonPressed: { transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.42 },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  content: {
    minHeight: 68,
    paddingHorizontal: 15,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconShell: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: 'rgba(4, 16, 10, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  eyebrow: {
    color: 'rgba(255,255,255,0.76)',
    userSelect: 'none',
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1.05,
  },
  label: {
    color: colors.white,
    userSelect: 'none',
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '900',
  },
});
