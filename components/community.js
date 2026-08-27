import { getDeviceId } from './deviceId';
import { API_BASE } from './apiBase';
import i18n from '../i18n';

async function request(action, payload = {}) {
  const deviceId = await getDeviceId();
  const response = await fetch(`${API_BASE}/api/community`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      deviceId,
      locale: i18n.resolvedLanguage || i18n.language,
      ...payload,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('community-request-failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function loadCommunity() { return request('read'); }
export function acceptCommunityTerms() { return request('accept_terms', { termsVersion: 1 }); }
export function saveCommunityProfile(profile) { return request('profile', profile); }
export function createCommunityPost(post) { return request('post', post); }
export function createCommunityComment(postId, body) { return request('comment', { postId, body }); }
export function toggleCommunityReaction(postId) { return request('react', { postId }); }
export function deleteCommunityTarget(targetType, targetId) { return request('delete', { targetType, targetId }); }
export function blockCommunityProfile(publicId) { return request('block', { publicId }); }
export function reportCommunityTarget(targetType, targetId, reason = 'other') {
  return request('report', { targetType, targetId, reason });
}
