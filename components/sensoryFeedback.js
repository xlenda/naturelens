import * as Haptics from 'expo-haptics';
import { getSensoryPreferences } from './sensoryPreferences';

async function perform(effect) {
  try {
    const preferences = await getSensoryPreferences();
    if (!preferences.hapticsEnabled) return false;
    await effect();
    return true;
  } catch (e) {
    // Haptics e acabamento: indisponibilidade nunca pode bloquear a acao real.
    return false;
  }
}

export const selection = () => perform(() => Haptics.selectionAsync());

export const open = () => perform(() => (
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
));

export const commit = () => perform(() => (
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
));

export const success = () => perform(() => (
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
));

export const warning = () => perform(() => (
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
));

export const error = () => perform(() => (
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
));

export const sensoryFeedback = Object.freeze({
  selection,
  open,
  commit,
  success,
  warning,
  error,
});

export default sensoryFeedback;
