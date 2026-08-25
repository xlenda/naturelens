export const LENS_PULSE_HOLD_MS = 820;

export function lensPulseReachedThreshold(elapsedMs) {
  return Number.isFinite(elapsedMs) && elapsedMs >= LENS_PULSE_HOLD_MS;
}
