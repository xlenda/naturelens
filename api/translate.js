const { translateVendorText } = require('./_lib/translate');
const { requireDeviceId } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');

// Translate a block of text on demand, when the reader asks for it.
//
// WHY ON DEMAND AND NOT ALWAYS
// Automatic translation of every vendor paragraph burns tokens on text most
// people never read. In the fish result the vendor's description usually lands
// in the secondary "technical description" card, below the fold - Lenda put it
// plainly: "traduzir quando o cliente pedir aí não gasta token".
//
// So the split is by prominence, not by category:
//   * text that will LEAD the screen is translated server-side during the
//     identification (see api/identify.js), because showing someone English as
//     the main answer is the complaint that started all of this;
//   * text that sits in a secondary card, and any English that leaks through
//     when Wikipedia has no article in the reader's language, gets a "Translate"
//     button and costs nothing until pressed.
//
// This is the only endpoint whose cost is driven by a button, so it is rate
// limited on its own scope rather than sharing the identify budget.

const MAX_CHARS = 4000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Tighter than identify's 30/10min: a person reading a species page might tap
  // Translate a handful of times, never sixty.
  const allowed = await checkRateLimit(req, res, {
    scope: 'translate',
    limit: 20,
    windowSeconds: 600,
  });
  if (!allowed) return;

  // Same device identity every other endpoint uses - this one spends money, so
  // it does not accept anonymous callers.
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'Missing "text" in request body' });
    return;
  }
  if (text.length > MAX_CHARS) {
    res.status(413).json({ error: `Text is longer than ${MAX_CHARS} characters.` });
    return;
  }

  // A per-device budget on top of the per-IP rate limit.
  //
  // Without it this endpoint is a general-purpose Anthropic translation proxy
  // funded by the app's owner: a deviceId is a self-issued UUID, so a caller
  // mints a fresh one per request and pays nothing to translate arbitrary text.
  // The IP limit above is the real backstop, but it is also shared - one abusive
  // caller behind a carrier NAT would spend the budget of everyone else on that
  // address, so the device budget is what keeps a normal user's allowance intact.
  //
  // 40 in 24 hours is far beyond real use: this button appears on at most two
  // cards per species screen, and only when the text is still in English.
  const deviceOk = await checkRateLimit(req, res, {
    scope: `translate-device:${deviceId}`,
    limit: 40,
    windowSeconds: 86400,
    // Counted per device, not per address - the whole point is that changing
    // network must not reset it.
    ignoreIp: true,
  });
  if (!deviceOk) return;

  const language = typeof req.body?.language === 'string' ? req.body.language : 'en';

  const translated = await translateVendorText(text, language);

  if (!translated) {
    // Distinguishable from a failure: there was nothing to do (already in the
    // target language, a placeholder, or no key configured). The client keeps
    // showing the original rather than an error.
    res.status(200).json({ translated: null });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ translated });
};
