import { useEffect } from 'react';
import { Platform } from 'react-native';

// Resets state when the page is restored from the browser's back/forward cache.
//
// The scenario (Fable review finding): the user taps Subscribe, startCheckout
// sets `subscribing = true` and navigates the whole page to Hotmart. They press
// the browser's Back button. Chrome/Safari restore the page from bfcache -
// WITHOUT re-running any mount code - so the button is still frozen on its
// "Subscribing…" state and can never be tapped again.
//
// `pageshow` with `event.persisted === true` is the one signal that fires on a
// bfcache restore. No-op on native, where this failure mode does not exist.
export function usePageShowReset(reset) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onPageShow = (event) => {
      if (event.persisted) reset();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [reset]);
}
