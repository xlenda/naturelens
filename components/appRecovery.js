export function recoveryUrl(href, stamp) {
  const url = new URL(href);
  url.searchParams.set('nl_recover', String(stamp));
  return url.toString();
}

export async function recoverWebApp({
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  navigatorImpl = typeof navigator === 'undefined' ? null : navigator,
  locationImpl = typeof window === 'undefined' ? null : window.location,
  now = Date.now,
} = {}) {
  if (!locationImpl || typeof locationImpl.reload !== 'function') return false;
  const stamp = now();

  try {
    if (!fetchImpl) throw new Error('network-unavailable');
    const separator = String(locationImpl.origin || '').endsWith('/') ? '' : '/';
    const probeUrl = `${locationImpl.origin || ''}${separator}?nl_recovery_probe=${stamp}`;
    const response = await fetchImpl(probeUrl, { cache: 'no-store' });
    if (!response?.ok) throw new Error('network-unavailable');
  } catch (e) {
    // Offline, o shell guardado ainda e a unica forma de abrir o app.
    locationImpl.reload();
    return false;
  }

  try {
    const registration = await navigatorImpl?.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch (e) {
    // O documento novo ainda pode carregar sem uma atualizacao do worker.
  }

  if (typeof locationImpl.replace === 'function') {
    locationImpl.replace(recoveryUrl(locationImpl.href, stamp));
    return true;
  }
  locationImpl.reload();
  return true;
}
