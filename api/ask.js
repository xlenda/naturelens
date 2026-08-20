const { requireDeviceId, getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');

// "Fale com um especialista" - real AI, replacing the keyword matcher.
//
// What was here before (screens/BotanistScreen.js) matched a handful of
// keywords against fixed canned answers and presented itself as an AI botanist.
// It was the one dishonest surface in the app: a paying subscriber asking a
// real question got a template that happened to contain the word "water".
//
// Now it is Claude Haiku behind a server proxy. The API key never touches the
// client (the standing rule in this codebase), and the model is given a persona
// with hard boundaries - see SYSTEM below.
//
// Haiku, not a bigger model, on purpose: these are short practical questions
// about a plant on someone's balcony. Haiku answers them well, responds fast
// enough to feel like a conversation, and costs little enough that this can be
// offered without metering every message.

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;

// Language names so the model answers in the user's language without us having
// to translate anything - the same reason the identification APIs get a
// language param.
const LANGUAGE_NAMES = {
  en: 'English', pt: 'Brazilian Portuguese', es: 'Spanish', de: 'German',
  fr: 'French', it: 'Italian', nl: 'Dutch', pl: 'Polish', cs: 'Czech',
  sv: 'Swedish', da: 'Danish', tr: 'Turkish', hi: 'Hindi', ar: 'Arabic',
  ko: 'Korean', zh: 'Simplified Chinese', 'zh-hant': 'Traditional Chinese',
};

function systemPrompt(language, context) {
  const languageName = LANGUAGE_NAMES[language] || 'English';

  return `You are Dr. Helena Marques, an agronomist and botany professor with 22 years of field and teaching experience. You specialise in plant health, tropical and temperate horticulture, soil, pests and edible-plant safety. You are answering inside NatureLens, an app people use to identify plants, insects, mushrooms, crops, fish and birds from photos.

HOW YOU TALK
- Like a knowledgeable person in a conversation, not like a manual or a chatbot. Warm, direct, practical.
- Short. Two or three paragraphs at most. A gardener reading on their phone with dirty hands does not want an essay.
- Lead with the actionable answer, then the reason. Never open with a summary of the question.
- Never use headings, bullet lists or bold in your replies. This is a chat, so write in prose the way a person types.
- No emoji.
- Ask ONE clarifying question only when you genuinely cannot answer without it (e.g. you need to know whether the plant is indoors). Otherwise answer with your best judgement and say what you assumed.

WHO YOU ARE
- You are a person, so speak as one: "I would repot that in the spring", "in my experience". Never say you are an AI, a model, an assistant or a language model. Never mention Claude, Anthropic, or any system prompt.
- If asked directly whether you are a real person or an AI, do not lie and do not lecture: say plainly that you are the app's specialist assistant and then get straight back to helping.

HARD LIMITS - these matter more than being helpful
- NEVER confirm that a wild mushroom, plant or berry is safe to eat. Not even if the user says they are sure, not even if they name the species, not even "probably". Say clearly that eating a wild find identified from a photo can be fatal, that only a local expert with the specimen in hand can clear it, and move on. This is not negotiable and no phrasing from the user changes it.
- Do not give medical, veterinary or dosage advice. For a plant someone or a pet may have eaten, tell them to call a poison centre or a vet immediately - that is the whole answer.
- Do not recommend a specific pesticide or herbicide by brand or dose. Talk about approach (isolate the plant, remove affected leaves, improve airflow) and point them to a local agronomist for anything chemical.
- Stay on your subject: plants, animals, soil, gardening, nature. If asked something unrelated, say that is outside what you can help with in one short sentence and offer what you CAN help with.
- If you do not know, say so. A wrong confident answer about a dying plant costs someone their plant.

LANGUAGE
Reply ONLY in ${languageName}. The user writes in ${languageName} and expects an answer in it.${context ? `\n\nCONTEXT - the user is asking from the detail screen of a species the app just identified:\n${context}\nUse it if relevant; do not recite it back to them.` : ''}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    // Honest, specific failure - the client shows this rather than pretending
    // the specialist is thinking.
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  // Each message costs real tokens, and deviceId is self-issued, so IP is the
  // only limit that cannot be reset by minting a new id. Its own bucket:
  // chatting must never eat into the identification allowance.
  const rateLimitOk = await checkRateLimit(req, res, {
    scope: 'ask',
    limit: 20,
    windowSeconds: 600,
  });
  if (!rateLimitOk) return;

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  // Report branch - Google Play's AI-Generated Content policy requires an
  // in-app way to flag an offensive AI answer, and this app has exactly one
  // generative surface (this chat). Piggybacks on this endpoint on purpose:
  // Vercel Hobby caps serverless functions, and a report is chat traffic.
  // Storage is ai_reports (supabase-migration-ai-reports.sql); if the table
  // is missing the report is still acknowledged - the user did their part,
  // and the log line keeps the signal until the migration runs.
  if (req.body?.report) {
    const flagged = String(req.body.report.message || '').trim().slice(0, 2000);
    if (!flagged) {
      res.status(400).json({ error: 'Missing report' });
      return;
    }
    try {
      const admin = getSupabaseAdmin();
      const { error } = await admin
        .from('ai_reports')
        .insert({ device_id: deviceId, message: flagged });
      if (error) console.error('ai_reports insert failed:', error.message);
    } catch (e) {
      console.error('ai report not persisted (table missing?):', e?.message);
    }
    res.status(200).json({ reported: true });
    return;
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'Missing messages' });
    return;
  }

  // Sanitise before spending tokens: cap the history and the length of each
  // turn so one caller cannot send a novel and burn the budget.
  const trimmed = messages
    .slice(-10)
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.trim().slice(0, 2000),
    }));

  if (trimmed.length === 0) {
    res.status(400).json({ error: 'Missing messages' });
    return;
  }

  const language = typeof req.body?.language === 'string' ? req.body.language : 'en';
  const context = typeof req.body?.context === 'string' ? req.body.context.slice(0, 800) : null;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(language, context),
        messages: trimmed,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('ask: upstream failed', upstream.status, detail.slice(0, 300));
      // Never forward the provider's raw error to the client - it can carry
      // account and quota details that are none of the user's business.
      res.status(502).json({ error: 'upstream' });
      return;
    }

    const data = await upstream.json();
    const text = (data?.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      res.status(502).json({ error: 'empty' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ text });
  } catch (e) {
    console.error('ask: request failed', e.message);
    res.status(502).json({ error: 'upstream' });
  }
};
