const { getSupabaseAdmin, requireDeviceId } = require('./_lib/supabaseAdmin');
const { sendPush } = require('./_lib/webpush');
const { checkRateLimit } = require('./_lib/rateLimit');

const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];

function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return PUSH_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function validSubscriptionKey(value, max) {
  return typeof value === 'string' && value.length >= 16 && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

// Web Push subscription registry.
//
// One merged endpoint (action in the body) rather than subscribe/unsubscribe as
// separate files - the Vercel Hobby plan counts every file under api/ as a
// Serverless Function and caps a deployment at 12. Same pattern as api/auth.js.
//
// This only STORES subscriptions. Actually delivering a push requires signing a
// VAPID JWT per endpoint and encrypting the payload (RFC 8291), which is a real
// piece of crypto - it belongs in a scheduled job, not in a request handler.
// Storing them now means that when the sender ships, there is already an
// audience: a reminder feature that starts with zero subscribers on day one is
// a feature nobody experiences.

// Reminder copy, per language, kept server-side because the push is composed
// where the user's browser is not running. Falls back to English for any
// language not listed - a reminder in the wrong language still beats silence.
const REMINDERS = {
  en: { title: 'Your streak is waiting', body: 'Identify one species today to keep it alive.' },
  pt: { title: 'Sua sequência está esperando', body: 'Identifique uma espécie hoje para não perdê-la.' },
  es: { title: 'Tu racha te espera', body: 'Identifica una especie hoy para mantenerla.' },
  de: { title: 'Deine Serie wartet', body: 'Bestimme heute eine Art, um sie zu halten.' },
  fr: { title: 'Votre série vous attend', body: 'Identifiez une espèce aujourd’hui pour la conserver.' },
  it: { title: 'La tua serie ti aspetta', body: 'Identifica una specie oggi per non perderla.' },
  nl: { title: 'Je reeks wacht op je', body: 'Herken vandaag een soort om hem te behouden.' },
  tr: { title: 'Serin seni bekliyor', body: 'Serini korumak için bugün bir tür tanımla.' },
  pl: { title: 'Twoja passa czeka', body: 'Zidentyfikuj dziś jeden gatunek, aby jej nie stracić.' },
  cs: { title: 'Vaše série čeká', body: 'Identifikujte dnes jeden druh, ať o ni nepřijdete.' },
  sv: { title: 'Din svit väntar', body: 'Identifiera en art idag för att behålla den.' },
  da: { title: 'Din stribe venter', body: 'Identificér en art i dag for at beholde den.' },
  ko: { title: '연속 기록이 기다리고 있어요', body: '오늘 한 종을 식별하고 기록을 이어가세요.' },
  zh: { title: '你的连续记录在等你', body: '今天识别一个物种，保持连续记录。' },
  'zh-hant': { title: '你的連續紀錄在等你', body: '今天辨識一個物種，保持連續紀錄。' },
  hi: { title: 'आपकी श्रृंखला इंतज़ार कर रही है', body: 'इसे बनाए रखने के लिए आज एक प्रजाति की पहचान करें।' },
  ar: { title: 'سلسلتك بانتظارك', body: 'تعرف على نوع واحد اليوم للحفاظ عليها.' },
};

function reminderFor(language) {
  // Full code first: 'zh-hant' must reach its own entry, not be truncated to
  // 'zh' and silently receive Simplified Chinese - the same class of bug the
  // client already fixed once ("zh-hant era rejeitado por um regex de duas
  // letras"). The 2-letter prefix stays as the fallback for regional variants
  // like 'pt-BR'.
  const full = String(language || 'en').toLowerCase();
  if (REMINDERS[full]) return REMINDERS[full];
  const short = full.slice(0, 2);
  return REMINDERS[short] || REMINDERS.en;
}

// Fired by Vercel Cron (see vercel.json). Por enquanto executa somente a
// limpeza antiabuso; o envio fica pausado ate existir elegibilidade contextual.
async function handleCron(req, res) {
  // Vercel signs cron invocations with this header. Without the check, anyone
  // who found the URL could blast a notification to every subscriber.
  const secret = process.env.CRON_SECRET?.trim();
  const provided = req.headers?.authorization || '';
  if (!secret || provided !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const admin = getSupabaseAdmin();
  let rateLimits = { pruned: 0, error: null };
  try {
    // A poda tambem roda dentro do contador, mas isso nao limita a retencao
    // quando o app fica sem trafego. O cron diario da o limite operacional sem
    // criar outra funcao serverless; RPC ausente significa migracao pendente e
    // nunca pode impedir os lembretes que ja funcionavam antes dela.
    const { data, error: pruneError } = await admin.rpc('prune_rate_limits');
    if (pruneError) {
      console.error('push cron: rate-limit prune unavailable', pruneError.message);
      rateLimits = { pruned: 0, error: 'unavailable' };
    } else {
      rateLimits.pruned = Number.isInteger(data) && data >= 0 ? data : 0;
    }
  } catch (pruneError) {
    console.error('push cron: rate-limit prune unavailable', pruneError.message);
    rateLimits = { pruned: 0, error: 'unavailable' };
  }

  // Nao existe hoje estado server-side que prove sequencia ativa, atividade do
  // dia, categoria ou horario local elegivel. Enviar a mesma cobranca para
  // todos seria um gatilho de culpa, nao um lembrete util. O cron continua
  // ativo apenas para a limpeza antiabuso ate existir elegibilidade explicita.
  res.status(200).json({
    sent: 0,
    pruned: 0,
    total: 0,
    rateLimits,
    paused: 'eligibility-unavailable',
  });
}

module.exports = async (req, res) => {
  // The cron path is a GET (that is how Vercel Cron invokes it) and carries no
  // device id, so it is dispatched before the POST/device guards below.
  if (req.method === 'GET' && req.query?.task === 'reminders') {
    await handleCron(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;

  if (!(await checkRateLimit(req, res, {
    scope: 'push-registry',
    limit: 20,
    windowSeconds: 3600,
  }))) return;

  const action = req.body?.action;
  const admin = getSupabaseAdmin();

  try {
    if (action === 'subscribe') {
      const sub = req.body?.subscription;
      // A subscription without its keys cannot be encrypted to - storing it
      // would just make the sender fail later, on a row that looks valid.
      if (
        !validPushEndpoint(sub?.endpoint) ||
        !validSubscriptionKey(sub?.keys?.p256dh, 512) ||
        !validSubscriptionKey(sub?.keys?.auth, 256)
      ) {
        res.status(400).json({ error: 'Invalid subscription' });
        return;
      }

      // Keyed by endpoint: the same browser re-subscribing produces the same
      // endpoint, so upsert keeps exactly one row instead of accumulating
      // duplicates that would each deliver the same notification.
      const { error } = await admin.from('push_subscriptions').upsert(
        {
          endpoint: sub.endpoint,
          device_id: deviceId,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          language: typeof req.body?.language === 'string' ? req.body.language.slice(0, 12) : null,
          timezone_offset:
            Number.isFinite(req.body?.timezoneOffset) ? req.body.timezoneOffset : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

      if (error) {
        // The table only exists after supabase-migration-hotmart.sql is run.
        // Report it plainly rather than pretending the subscription worked -
        // the client uses this to avoid showing "notifications on" when they
        // are not.
        console.error('push subscribe failed', error.message);
        res.status(500).json({ error: 'Could not save the subscription.' });
        return;
      }

      res.status(200).json({ subscribed: true });
      return;
    }

    if (action === 'unsubscribe') {
      const endpoint = req.body?.endpoint;
      if (!validPushEndpoint(endpoint)) {
        res.status(400).json({ error: 'Missing endpoint' });
        return;
      }
      await admin.from('push_subscriptions').delete()
        .eq('endpoint', endpoint)
        .eq('device_id', deviceId);
      res.status(200).json({ unsubscribed: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('push endpoint error', e.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};
