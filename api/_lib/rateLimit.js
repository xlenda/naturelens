const { getSupabaseAdmin } = require('./supabaseAdmin');

// Coarse, IP-scoped rate limiting for endpoints that cost real money per call
// (Kindwise credits) or that can be used to spam a third party (OTP emails,
// bounded by Supabase's own shared project-wide quota - see project memory).
// deviceId alone can never be the rate-limit key: it's a client-generated,
// self-issued UUID with zero server-side proof of uniqueness, so anyone can
// mint a fresh one per request and bypass any device-scoped limit entirely -
// IP is the only signal here that isn't trivially reset by the caller.
//
// Backed by a `rate_limits` table that does not exist until this SQL is run
// once in the Supabase SQL Editor (same one-time self-serve pattern already
// used for this project's other schema changes - see project memory):
//
//   create table if not exists rate_limits (
//     id bigserial primary key,
//     bucket_key text not null,
//     window_start timestamptz not null,
//     count int not null default 1,
//     unique (bucket_key, window_start)
//   );
//   create index if not exists rate_limits_bucket_idx on rate_limits (bucket_key, window_start);
//
// Until that table exists, every check below fails OPEN (allows the
// request) exactly like this app's existing entitlement checks do on a
// Supabase read error - a missing/broken rate-limit table must never look
// like "block everyone," it should just mean "no rate limiting yet."
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || 'unknown';
}

function windowStartIso(windowSeconds) {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

// Returns true if the request is allowed to proceed. On block, already sends
// a 429 response - callers just need to `return` when this is false.
async function checkRateLimit(req, res, { scope, limit, windowSeconds, ignoreIp = false }) {
  // `ignoreIp` gives a bucket that counts a TARGET rather than a caller - used
  // for per-account sign-in attempts, where the whole point is that rotating IPs
  // must not reset the counter.
  const bucketKey = ignoreIp ? scope : `${scope}:${getClientIp(req)}`;
  const windowStart = windowStartIso(windowSeconds);

  try {
    const admin = getSupabaseAdmin();

    // Increment FIRST, then decide on the value that came back.
    //
    // The previous version read the counter and wrote count+1 in two separate
    // statements. Fire N requests at once from one IP and every one of them
    // reads the counter before any of them writes: all N pass the check, and the
    // row ends at 1 instead of N. So a caller using concurrency had no limit at
    // all, and because the stored counter never advanced, the burst was
    // repeatable forever.
    //
    // That matters more here than anywhere else in the codebase: this is the
    // only spend control a caller cannot reset. deviceId is self-issued and free
    // to mint per request; the IP is not. Behind it sit /api/translate and
    // /api/ask (Anthropic, billed to the owner) and /api/identify (vendor
    // credits).
    //
    // Same fix, same reason, as increment_category_usage: one INSERT ... ON
    // CONFLICT DO UPDATE, which Postgres serialises on the row lock.
    const { data: count, error: rpcError } = await admin.rpc('increment_rate_limit', {
      p_bucket_key: bucketKey,
      p_window_start: windowStart,
    });

    if (!rpcError && typeof count === 'number') {
      if (count > limit) {
        res.status(429).json({ error: 'Too many requests. Please try again in a bit.' });
        return false;
      }
      return true;
    }

    // The RPC does not exist yet (supabase-migration-ratelimit.sql not run).
    // Fall back to the old read-then-write so the limit still applies to
    // sequential callers - a leaky limit beats none - and log loudly, because
    // while this path is in use the concurrency hole above is open.
    console.error(
      'checkRateLimit: increment_rate_limit unavailable, using racy fallback -',
      'run supabase-migration-ratelimit.sql',
      rpcError?.message || 'no count returned'
    );

    const { data: existing, error: readError } = await admin
      .from('rate_limits')
      .select('count')
      .eq('bucket_key', bucketKey)
      .eq('window_start', windowStart)
      .maybeSingle();

    if (readError) {
      console.error('checkRateLimit: read failed (table missing?)', scope, readError.message);
      return true;
    }

    if (existing && existing.count >= limit) {
      res.status(429).json({ error: 'Too many requests. Please try again in a bit.' });
      return false;
    }

    await admin
      .from('rate_limits')
      .upsert(
        { bucket_key: bucketKey, window_start: windowStart, count: (existing?.count || 0) + 1 },
        { onConflict: 'bucket_key,window_start' }
      );

    return true;
  } catch (err) {
    console.error('checkRateLimit: unexpected error', scope, err.message);
    return true;
  }
}

module.exports = { checkRateLimit };
