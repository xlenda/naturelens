const { createClient } = require('@supabase/supabase-js');

let client = null;
let anonClient = null;

function getSupabaseAdmin() {
  if (!client) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceKey) {
      throw new Error('Supabase server credentials are not configured');
    }
    client = createClient(url, serviceKey);
  }
  return client;
}

// Used only for auth.signInWithOtp/verifyOtp (email-ownership proof for the
// restore-access flow) - never for reading/writing app tables, which always
// go through the service_role client above.
function getSupabaseAnon() {
  if (!anonClient) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anonKey) {
      throw new Error('Supabase public credentials are not configured');
    }
    anonClient = createClient(url, anonKey);
  }
  return anonClient;
}

// components/deviceId.js's generateId() always produces this exact shape.
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// No login: the client generates and sends its own anonymous device id, which we
// trust as-is (a device can only reset its free-use count by regenerating this id,
// which is an accepted tradeoff for a frictionless start - see project memory).
// The shape IS validated, though: entitlement.js deliberately fails OPEN (grants
// access) on a Supabase read error so a real outage never blocks a paying
// customer - but that only stays safe if a malformed deviceId can never be the
// thing causing the read to error in the first place (e.g. an embedded NUL byte
// reliably breaks a Postgres text-column query, which would otherwise turn into
// free access on every single request from that id, forever).
function requireDeviceId(req, res) {
  const deviceId = req.body?.deviceId;
  if (!deviceId || typeof deviceId !== 'string' || !DEVICE_ID_PATTERN.test(deviceId)) {
    res.status(400).json({ error: 'Missing or invalid device identifier' });
    return null;
  }
  return deviceId;
}

module.exports = { getSupabaseAdmin, getSupabaseAnon, requireDeviceId };
