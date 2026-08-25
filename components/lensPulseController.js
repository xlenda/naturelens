import { LENS_PULSE_HOLD_MS } from './lensPulseTiming';

const NOOP = () => {};

// Controle temporal sem React nem Animated. O token invalida callbacks antigos
// e deixa a animacao livre para ser apenas apresentacao.
export function createLensPulseController({
  schedule = setTimeout,
  cancelScheduled = clearTimeout,
  onMidpoint = NOOP,
  onComplete = NOOP,
} = {}) {
  let phase = 'ready';
  let generation = 0;
  let midpointTimer = null;
  let completionTimer = null;

  const clearTimers = () => {
    if (midpointTimer !== null) cancelScheduled(midpointTimer);
    if (completionTimer !== null) cancelScheduled(completionTimer);
    midpointTimer = null;
    completionTimer = null;
  };

  const start = () => {
    if (phase !== 'ready') return false;
    phase = 'holding';
    const token = ++generation;
    midpointTimer = schedule(() => {
      midpointTimer = null;
      if (phase === 'holding' && generation === token) onMidpoint();
    }, Math.floor(LENS_PULSE_HOLD_MS / 2));
    completionTimer = schedule(() => {
      completionTimer = null;
      if (phase !== 'holding' || generation !== token) return;
      if (midpointTimer !== null) cancelScheduled(midpointTimer);
      midpointTimer = null;
      phase = 'awaitingConsent';
      onComplete();
    }, LENS_PULSE_HOLD_MS);
    return true;
  };

  const activate = () => {
    if (phase !== 'ready') return false;
    generation += 1;
    clearTimers();
    phase = 'awaitingConsent';
    onComplete();
    return true;
  };

  const release = () => {
    if (phase === 'holding') {
      generation += 1;
      clearTimers();
      phase = 'ready';
      return 'cancelled';
    }
    if (phase === 'awaitingConsent') {
      phase = 'ready';
      return 'completed';
    }
    return phase;
  };

  const cancel = () => {
    if (phase === 'disposed') return false;
    const changed = phase !== 'ready';
    generation += 1;
    clearTimers();
    phase = 'ready';
    return changed;
  };

  const dispose = () => {
    generation += 1;
    clearTimers();
    phase = 'disposed';
  };

  return Object.freeze({
    start,
    activate,
    release,
    cancel,
    dispose,
    getPhase: () => phase,
  });
}
