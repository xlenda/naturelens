const { getSupabaseAnon } = require('../_lib/supabaseAdmin');
const { requireMethod } = require('../_lib/kindwise');
const { checkRateLimit } = require('../_lib/rateLimit');

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  // Without this, anyone can email-bomb an arbitrary inbox by repeatedly
  // POSTing their address here (Supabase's signInWithOtp creates+emails on
  // any address by default) - and since Supabase's own OTP-email quota is
  // shared project-wide, not per-target (see project memory: as low as
  // 2/hour on the default sender), a single abuse burst could exhaust the
  // whole project's quota and lock legitimate customers out of restore
  // access too. Strict on purpose - a real user only needs this once in a
  // rare while.
  const rateLimitOk = await checkRateLimit(req, res, { scope: 'restore-request', limit: 3, windowSeconds: 3600 });
  if (!rateLimitOk) return;

  const email = req.body?.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const supabase = getSupabaseAnon();
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ sent: true });
};
