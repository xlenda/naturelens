import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import {
  DEFAULT_SENSORY_PREFERENCES,
  getSensoryPreferences,
  MOTION_MODES,
  subscribeSensoryPreferences,
} from './sensoryPreferences';

export function resolveReducedMotion(motionMode, systemReduced) {
  if (motionMode === MOTION_MODES.REDUCED) return true;
  if (motionMode === MOTION_MODES.FULL) return false;
  return !!systemReduced;
}

function webMediaQuery() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

function initialSystemPreference() {
  return !!webMediaQuery()?.matches;
}

export function useReducedMotion() {
  const [motionMode, setMotionMode] = useState(DEFAULT_SENSORY_PREFERENCES.motionMode);
  const [systemReduced, setSystemReduced] = useState(initialSystemPreference);

  useEffect(() => {
    let alive = true;
    getSensoryPreferences().then((preferences) => {
      if (alive) setMotionMode(preferences.motionMode);
    });
    const unsubscribe = subscribeSensoryPreferences((preferences) => {
      if (alive) setMotionMode(preferences.motionMode);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const media = webMediaQuery();
    if (media) {
      const onChange = (event) => setSystemReduced(!!event.matches);
      setSystemReduced(!!media.matches);
      media.addEventListener?.('change', onChange);
      if (!media.addEventListener) media.addListener?.(onChange);
      return () => {
        media.removeEventListener?.('change', onChange);
        if (!media.removeEventListener) media.removeListener?.(onChange);
      };
    }

    let alive = true;
    const systemPreference = AccessibilityInfo.isReduceMotionEnabled?.();
    systemPreference?.then((enabled) => {
      if (alive) setSystemReduced(!!enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => setSystemReduced(!!enabled)
    );
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  return resolveReducedMotion(motionMode, systemReduced);
}

export default useReducedMotion;
