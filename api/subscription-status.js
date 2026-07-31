const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const deviceId = req.query?.deviceId;
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ error: 'Missing device identifier' });
    return;
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('subscriptions')
    // `email` is what makes the Profile able to say "signed in as ..." instead
    // of guessing. It is the address linked to THIS device, keyed by a device id
    // the caller already holds, so it discloses nothing the holder did not put
    // there themselves.
    .select('status, current_period_end, email')
    .eq('device_id', deviceId)
    .maybeSingle();

  // A read failure is NOT "not subscribed". Discarding `error` and answering
  // 200 {status:null} collapsed the client's three-state design (has access /
  // no access / don't know) back into two at exactly the moment it mattered:
  // a paying subscriber would be shown the free plan and the Subscribe button
  // while the server, which fails OPEN in entitlement.js, still let them scan.
  // 503 makes getSubscriptionStatus() return `undefined` = unknown.
  if (error) {
    console.error('subscription-status: read failed', deviceId, error.message);
    res.status(503).json({ error: 'Could not read subscription status.' });
    return;
  }

  // Authenticated-ish, per-device data: never cacheable by a shared proxy.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: data?.status || null,
    currentPeriodEnd: data?.current_period_end || null,
    // Null when this device has never been linked to an account - which is what
    // the Profile uses to decide between "Sign in" and showing the account.
    email: data?.email || null,
  });
};
