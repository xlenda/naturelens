const { getSupabaseAnon, getSupabaseAdmin, requireDeviceId } = require('../_lib/supabaseAdmin');
const { requireMethod } = require('../_lib/kindwise');
const { checkRateLimit } = require('../_lib/rateLimit');

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  const email = req.body?.email;
  const code = req.body?.code;
  if (!email || typeof email !== 'string' || !code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing email or code', reason: 'missingCredentials' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Requesting a code is limited to 3/hour; VERIFYING one was not limited at
  // all. A 6-digit code is a million combinations, and Supabase's OTP stays
  // valid for an hour - so an attacker who knows a subscriber's email could
  // trigger one send and then try codes without any brake until they hit it.
  // Succeeding links THEIR device to the victim's subscription, which is the
  // same prize as guessing the password.
  //
  // Two buckets, same reasoning as sign-in: by IP so one machine cannot hammer
  // many accounts, and by EMAIL so a botnet rotating addresses cannot hammer
  // one. 10 attempts is generous for someone typing a code off their phone.
  if (!(await checkRateLimit(req, res, { scope: 'restore-verify', limit: 10, windowSeconds: 3600 }))) {
    return;
  }
  if (
    !(await checkRateLimit(req, res, {
      scope: `restore-verify-email:${normalizedEmail}`,
      limit: 10,
      windowSeconds: 3600,
      ignoreIp: true,
    }))
  ) {
    return;
  }

  const supabaseAnon = getSupabaseAnon();
  const { error: verifyError } = await supabaseAnon.auth.verifyOtp({
    email: normalizedEmail,
    token: code.trim(),
    type: 'email',
  });

  if (verifyError) {
    res.status(400).json({ error: 'That code is invalid or expired.', reason: 'badCode' });
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
    res.status(404).json({ error: 'No subscription was found for that email.', reason: 'noSubscription' });
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
    res.status(500).json({ error: 'Could not restore access on this device. Please try again.', reason: 'linkFailed' });
    return;
  }

  res.status(200).json({ status: existing.status });
};
