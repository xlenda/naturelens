const { getSupabaseAnon, getSupabaseAdmin, requireDeviceId } = require('./_lib/supabaseAdmin');
const { requireMethod } = require('./_lib/kindwise');

// Supabase signs session JWTs with an asymmetric key (confirmed live via
// GET /auth/v1/.well-known/jwks.json - ES256), so a Google-sign-in
// access_token can be verified locally against the public key with zero
// network round-trip to Supabase's own /auth/v1/user endpoint, and without
// ever needing the service_role/secret key for this specific check. jose's
// createRemoteJWKSet caches the public key automatically. `jose` v6 ships as
// ESM-only (no CJS build), and this file is CommonJS - a top-level
// `require('jose')` throws ERR_REQUIRE_ESM and crashes the whole function,
// so it's loaded via dynamic import() instead, which works from CJS.
let jwks = null;
async function getJwks() {
  if (!jwks) {
    const { createRemoteJWKSet } = await import('jose');
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

async function verifySupabaseAccessToken(accessToken) {
  const { jwtVerify } = await import('jose');
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const { payload } = await jwtVerify(accessToken, await getJwks(), {
    issuer: `${supabaseUrl}/auth/v1`,
    audience: 'authenticated',
  });
  return payload;
}

// Combined into one file (rather than api/auth/signup.js + api/auth/signin.js)
// to stay within Vercel's Hobby-plan 12-serverless-function-per-deployment
// limit - dispatches on req.body.action instead of the URL path.

// Password accounts are opt-in and gated to active subscribers only (see
// project memory): free/trial use stays account-free to keep the
// zero-friction first-run experience that already drives real conversions,
// password login only exists to let a PAYING subscriber sync their
// entitlement across devices without re-requesting an email code every time.
async function handleSignup(req, res, deviceId) {
  const password = req.body?.password;
  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const admin = getSupabaseAdmin();
  const { data: sub, error: subError } = await admin
    .from('subscriptions')
    .select('email, status')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (subError || !sub?.email || sub.status !== 'active') {
    res.status(403).json({ error: 'Only active subscribers can create a password.' });
    return;
  }

  const supabaseAnon = getSupabaseAnon();
  const { error: signUpError } = await supabaseAnon.auth.signUp({
    email: sub.email,
    password,
  });

  if (signUpError) {
    res.status(400).json({ error: signUpError.message });
    return;
  }

  res.status(200).json({ created: true, email: sub.email });
}

// Shared by every "prove you own this email, then link that email's
// subscription to the current device_id" flow (password sign-in, Google
// sign-in, and originally api/restore/verify-code.js's OTP flow) - one
// place for this logic so it can't drift between the three proof-of-identity
// methods.
async function linkDeviceToEmail(res, deviceId, normalizedEmail) {
  const admin = getSupabaseAdmin();
  // Provider-neutral. The old version required `stripe_customer_id IS NOT
  // NULL`, which after the move to Hotmart would find nothing for a real buyer
  // and answer "no subscription found for that account" to someone who had
  // just paid - the paid-but-no-access failure, arriving through the Google
  // sign-in door instead of the OTP one.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('*')
    .eq('email', normalizedEmail)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ error: 'No subscription was found for that account.' });
    return;
  }

  // Same rule as restore/verify-code.js: supabase-js reports failure through
  // `error`, not by throwing. Without this check, Google sign-in and password
  // sign-in both answered 200 with a status while writing nothing - telling a
  // paying customer they were linked when they were not.
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
    console.error('linkDeviceToEmail: upsert failed', deviceId, linkError.message);
    res.status(500).json({ error: 'Could not link this device to your account. Please try again.' });
    return;
  }

  res.status(200).json({ status: existing.status });
}

// Mirrors api/restore/verify-code.js's device-linking logic exactly, just
// with a password as the proof-of-ownership step instead of a one-time
// email code.
async function handleSignin(req, res, deviceId) {
  const email = req.body?.email;
  const password = req.body?.password;
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Missing email or password' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const supabaseAnon = getSupabaseAnon();
  const { error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (signInError) {
    res.status(400).json({ error: 'Incorrect email or password, or the email is not yet confirmed.' });
    return;
  }

  await linkDeviceToEmail(res, deviceId, normalizedEmail);
}

// Google sign-in has no separate "signup" step (unlike password) - Google
// itself is the proof of email ownership, there's nothing to create. The
// client redirects to Supabase's OAuth authorize endpoint directly (plain
// browser redirect, no client-side Supabase SDK needed - see project memory
// on why that SDK was removed to save bundle size) with a PKCE
// code_challenge, gets a one-time `code` back in the URL (never a raw
// token), and this endpoint - not the client - exchanges that code plus the
// matching code_verifier for a session with Supabase, then verifies the
// resulting access token's signature locally via JWKS before trusting the
// email it claims. Keeping the exchange server-side (rather than doing it
// from the browser) matches the rest of this app: Supabase is only ever
// talked to from the backend.
async function handleGoogle(req, res, deviceId) {
  const code = req.body?.code;
  const codeVerifier = req.body?.codeVerifier;
  if (!code || typeof code !== 'string' || !codeVerifier || typeof codeVerifier !== 'string') {
    res.status(400).json({ error: 'Missing code or code verifier' });
    return;
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  let accessToken;
  try {
    const exchangeResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
    });
    if (!exchangeResponse.ok) {
      res.status(400).json({ error: 'Could not verify Google sign-in.' });
      return;
    }
    const exchangeData = await exchangeResponse.json();
    accessToken = exchangeData?.access_token;
  } catch (err) {
    res.status(400).json({ error: 'Could not verify Google sign-in.' });
    return;
  }

  if (!accessToken) {
    res.status(400).json({ error: 'Could not verify Google sign-in.' });
    return;
  }

  let payload;
  try {
    payload = await verifySupabaseAccessToken(accessToken);
  } catch (err) {
    res.status(400).json({ error: 'Could not verify Google sign-in.' });
    return;
  }

  if (!payload?.email) {
    res.status(400).json({ error: 'Could not verify Google sign-in.' });
    return;
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  await linkDeviceToEmail(res, deviceId, normalizedEmail);
}

// Deletes everything this app itself controls for this device/account: the
// matching Supabase Auth user if a password was ever created, and this
// device's subscriptions/category_usage rows. Local data (collection, profile
// photo, the device id) is cleared client-side afterward - this endpoint only
// ever touches server-side state.
//
// Under Stripe this also cancelled billing automatically. Hotmart offers no
// equivalent call from here, so instead it returns `billingStillActive` and the
// client is responsible for saying, in plain words, that the charge continues
// and where to stop it. Deleting data while a card keeps being charged, without
// telling the person, is the dark pattern the old auto-cancel prevented.
async function handleDelete(req, res, deviceId) {
  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('email, provider, provider_subscription_id')
    .eq('device_id', deviceId)
    .maybeSingle();

  // IMPORTANT BEHAVIOUR CHANGE vs the Stripe version, which cancelled billing
  // automatically before deleting the data.
  //
  // Hotmart has no equivalent server-side cancel we can call with the webhook
  // token alone - cancelling a Hotmart subscription requires the buyer to do it
  // in their own Hotmart account (or the seller to do it in the Hotmart panel).
  // Silently deleting someone's data while their card keeps being charged is
  // exactly the dark pattern the automatic Stripe cancel existed to avoid.
  //
  // So this endpoint reports back whether billing is still live, and the client
  // MUST tell the user in plain words that deleting here does not stop the
  // charge and where to cancel it. Never let this become a silent deletion.
  const billingStillActive = Boolean(
    sub?.provider === 'hotmart' && sub?.provider_subscription_id
  );

  if (sub?.email) {
    try {
      const normalizedEmail = sub.email.trim().toLowerCase();
      for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data?.users?.length) break;
        const match = data.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
        if (match) {
          await admin.auth.admin.deleteUser(match.id);
          break;
        }
        if (data.users.length < 200) break;
      }
    } catch (err) {
      // No password account existed, or lookup failed - not fatal, continue.
    }
  }

  await admin.from('subscriptions').delete().eq('device_id', deviceId);
  await admin.from('category_usage').delete().eq('device_id', deviceId);

  // billingStillActive tells the client to warn that the Hotmart charge keeps
  // running and must be cancelled there. See the comment above the lookup.
  res.status(200).json({ deleted: true, billingStillActive });
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  if (req.body?.action === 'signup') {
    await handleSignup(req, res, deviceId);
    return;
  }
  if (req.body?.action === 'signin') {
    await handleSignin(req, res, deviceId);
    return;
  }
  if (req.body?.action === 'google') {
    await handleGoogle(req, res, deviceId);
    return;
  }
  if (req.body?.action === 'delete') {
    await handleDelete(req, res, deviceId);
    return;
  }

  res.status(400).json({ error: 'Missing or invalid action' });
};
