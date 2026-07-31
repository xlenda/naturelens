const { getSupabaseAnon, getSupabaseAdmin, requireDeviceId } = require('../_lib/supabaseAdmin');
const { requireMethod } = require('../_lib/kindwise');

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  const email = req.body?.email;
  const code = req.body?.code;
  if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing email or code' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const supabaseAnon = getSupabaseAnon();
  const { error: verifyError } = await supabaseAnon.auth.verifyOtp({
    email: normalizedEmail,
    token: code.trim(),
    type: 'email',
  });

  if (verifyError) {
    res.status(400).json({ error: 'That code is invalid or expired.' });
    return;
  }

  const admin = getSupabaseAdmin();

  // Provider-neutral lookup. This used to require `stripe_customer_id IS NOT
  // NULL`, which would silently find nothing for a Hotmart purchase and tell a
  // paying customer "no subscription found for that email" - the same
  // paid-but-no-access failure this whole flow exists to prevent.
  //
  // This is also the bridge that makes Hotmart work at all: the buyer pays on
  // Hotmart's page (no device involved), the webhook writes the row keyed by
  // email under a synthetic device id, and proving ownership of that email here
  // is what copies it onto their real device.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('*')
    .eq('email', normalizedEmail)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ error: 'No subscription was found for that email.' });
    return;
  }

  // The `error` here is not optional politeness: supabase-js resolves with
  // { data: null, error } instead of throwing, so the previous un-checked
  // version answered 200 {status:'active'} to someone whose row was never
  // written. The app then said "access restored" while the device stayed
  // locked out - the paid-but-no-access bug, arriving through the restore door.
  const { error: linkError } = await admin.from('subscriptions').upsert({
    device_id: deviceId,
    provider: existing.provider || null,
    provider_subscription_id: existing.provider_subscription_id || null,
    provider_transaction_id: existing.provider_transaction_id || null,
    email: normalizedEmail,
    status: existing.status,
    plan: existing.plan || null,
    current_period_end: existing.current_period_end,
    updated_at: new Date().toISOString(),
  });

  if (linkError) {
    console.error('restore/verify-code: link failed', deviceId, linkError.message);
    res.status(500).json({ error: 'Could not restore access on this device. Please try again.' });
    return;
  }

  res.status(200).json({ status: existing.status });
};
