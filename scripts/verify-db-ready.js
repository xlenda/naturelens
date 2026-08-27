/* eslint-disable no-console */
const crypto = require('node:crypto');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const headers = key ? { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } : {};

async function request(path, init = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${body.slice(0, 180)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  if (!url || !key) {
    console.log('DB preflight skipped: service credentials are not in this environment.');
    return;
  }

  const failures = [];
  for (const [label, path] of [
    ['community profiles', '/rest/v1/community_profiles?select=public_id,terms_version,terms_accepted_at&limit=1'],
    ['community moderation', '/rest/v1/community_reports?select=status,reviewed_at,moderator_note&limit=1'],
    ['climate cache', '/rest/v1/site_climate_cache?select=grid_key&limit=1'],
    ['AI reports', '/rest/v1/ai_reports?select=id&limit=1'],
    ['knowledge documents', '/rest/v1/knowledge_documents?select=id,slug,content_hash&status=eq.published&limit=1'],
    ['knowledge chunks', '/rest/v1/knowledge_chunks?select=id,document_id,source_urls&limit=1'],
  ]) {
    try { await request(path); } catch (error) { failures.push(`${label}: ${error.message}`); }
  }

  const deviceId = crypto.randomUUID();
  const category = 'plant';
  try {
    const reserved = await request('/rest/v1/rpc/reserve_category_usage', {
      method: 'POST', body: JSON.stringify({ p_device_id: deviceId, p_category: category }),
    });
    if (reserved !== true) throw new Error('did not reserve a clean first use');
    const released = await request('/rest/v1/rpc/release_category_usage', {
      method: 'POST', body: JSON.stringify({ p_device_id: deviceId, p_category: category }),
    });
    if (released !== true) throw new Error('did not remove the preflight reservation');
  } catch (error) { failures.push(`atomic entitlement: ${error.message}`); }

  const bucket = `h1:${crypto.randomBytes(32).toString('hex')}`;
  try {
    const count = await request('/rest/v1/rpc/increment_rate_limit', {
      method: 'POST', body: JSON.stringify({ p_bucket_key: bucket, p_window_start: new Date().toISOString() }),
    });
    if (count !== 1) throw new Error('atomic counter did not return 1');
    await request(`/rest/v1/rate_limits?bucket_key=eq.${bucket}`, { method: 'DELETE' });
  } catch (error) { failures.push(`atomic rate limit: ${error.message}`); }

  try {
    const documents = await request('/rest/v1/knowledge_documents?select=id&status=eq.published&limit=1');
    if (!Array.isArray(documents) || documents.length !== 1) throw new Error('no published curated document was ingested');
    const chunks = await request('/rest/v1/rpc/search_knowledge_chunks', {
      method: 'POST',
      body: JSON.stringify({ p_query: 'planta solo agua', p_categories: ['plant'], p_scientific: null, p_limit: 1 }),
    });
    if (!Array.isArray(chunks) || chunks.length !== 1) throw new Error('retrieval RPC returned no curated evidence');
  } catch (error) { failures.push(`knowledge retrieval: ${error.message}`); }

  if (failures.length) throw new Error(`\n- ${failures.join('\n- ')}`);

  console.log('DB preflight passed: entitlement, climate, community, AI reports and curated knowledge are ready.');
}

main().catch((error) => {
  console.error(`DB preflight failed. Apply the pending Supabase migrations before publishing. ${error.message}`);
  process.exitCode = 1;
});
