import { getDeviceId } from './deviceId';
import { getApproximateLocation } from './deviceLocation';
import { API_BASE } from './apiBase';

export async function getSiteClimate() {
  const location = await getApproximateLocation();
  if (!location) return null;
  const response = await fetch(`${API_BASE}/api/site-climate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: await getDeviceId(),
      latitude: location.latitude,
      longitude: location.longitude,
    }),
  });
  if (!response.ok) throw new Error('site-climate-request-failed');
  const payload = await response.json();
  return Array.isArray(payload?.months) ? payload : null;
}
