const { getSupabaseAdmin } = require('./supabaseAdmin');

// Returns { allowed: true } if this device may run this identification, or
// { allowed: false } (having already sent a 402 response) if it must subscribe.
//
// Fails OPEN (allows the request) on a Supabase read error rather than
// silently falling through to the next check - a transient DB error must
// never look identical to "not subscribed" and block someone who already
// paid. The tradeoff (a rare free identification during a real outage) is
// intentional and far cheaper than blocking a paying customer.
async function checkEntitlement(res, deviceId, category) {
  const admin = getSupabaseAdmin();

  const { data: sub, error: subError } = await admin
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (subError) {
    console.error('checkEntitlement: subscriptions read failed', deviceId, subError.message);
    return { allowed: true, subscribed: false };
  }

  if (sub?.status === 'active') {
    return { allowed: true, subscribed: true };
  }

  // A CANCELLED subscription keeps access until the period already paid for
  // runs out. This is not generosity - it is what the app promises in writing,
  // on the landing page ("ao cancelar, as próximas cobranças param e o acesso
  // continua até o fim do período já pago") and in the Help FAQ. Cutting a
  // year-plan buyer off on day 10 with 355 paid days remaining would be taking
  // money for something not delivered.
  //
  // `current_period_end` was being written by every write path and read by
  // nobody until this was found (adversarial review, 2026-07-29). Only
  // 'canceled' qualifies: 'expired' means refunded or charged back, where the
  // money went back and access must end immediately.
  if (sub?.status === 'canceled' && sub?.current_period_end) {
    const endsAt = new Date(sub.current_period_end).getTime();
    if (Number.isFinite(endsAt) && endsAt > Date.now()) {
      return { allowed: true, subscribed: true };
    }
  }

  const { data: usage, error: usageError } = await admin
    .from('category_usage')
    .select('used_count')
    .eq('device_id', deviceId)
    .eq('category', category)
    .maybeSingle();

  if (usageError) {
    console.error('checkEntitlement: category_usage read failed', deviceId, category, usageError.message);
    return { allowed: true, subscribed: false };
  }

  if ((usage?.used_count || 0) >= 1) {
    res.status(402).json({
      error: 'Free use already used for this category. Subscribe to keep identifying.',
      paymentRequired: true,
    });
    return { allowed: false };
  }

  return { allowed: true, subscribed: false };
}

async function recordUsage(deviceId, category) {
  const admin = getSupabaseAdmin();

  // One atomic statement in the database, not read-then-write here.
  //
  // The old version SELECTed used_count and then upserted count + 1. Two
  // requests from the same device arriving together both read 0 and both wrote
  // 1, so the person got two free identifications instead of one. Firing off two
  // scans in quick succession is not an exotic case - it is what happens when
  // someone taps twice, or when a flaky connection makes the app retry.
  //
  // increment_category_usage (see supabase-migration-hotmart.sql) does the
  // insert-or-increment in a single INSERT ... ON CONFLICT DO UPDATE, which
  // Postgres serialises on the row lock.
  const { error } = await admin.rpc('increment_category_usage', {
    p_device_id: deviceId,
    p_category: category,
  });

  if (!error) return;

  // supabase-js resolves with an error object instead of throwing, so this
  // branch is reachable and silent unless it is logged - which is exactly how
  // fish, bird and sound stayed free and unlimited for days.
  console.error('recordUsage: increment failed', deviceId, category, error.message);

  // Fallback for a database that has not had the migration applied yet. It
  // carries the original race, but a slightly-too-generous counter beats no
  // counter at all - and the deploy gate (scripts/verify-live.js) fails loudly
  // while this path is the one in use.
  const { data: usage, error: readError } = await admin
    .from('category_usage')
    .select('used_count')
    .eq('device_id', deviceId)
    .eq('category', category)
    .maybeSingle();

  if (readError) {
    console.error('recordUsage: fallback read failed', deviceId, category, readError.message);
    return;
  }

  const { error: upsertError } = await admin.from('category_usage').upsert({
    device_id: deviceId,
    category,
    used_count: (usage?.used_count || 0) + 1,
    updated_at: new Date().toISOString(),
  });

  if (upsertError) {
    console.error('recordUsage: fallback upsert failed', deviceId, category, upsertError.message);
  }
}

module.exports = { checkEntitlement, recordUsage };
