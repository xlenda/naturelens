const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { verifyWebhookSignature, parseWebhookEvent, normalizeEmail } = require('./_lib/hotmart');

// Hotmart webhook.
//
// The single most dangerous surface in the app: when this breaks, money comes
// in, the customer gets nothing, and NOTHING shows an error - Hotmart receives
// HTTP 200, considers the notification delivered and never resends. A real
// incident on the sibling app had 100% of approved purchases silently rejected
// for the product's entire life. Every rule below exists because of that.
//
// Rules encoded here:
//   1. Store the RAW payload for every event, including ones we ignore. Without
//      it a mis-parsed purchase is unrecoverable.
//   2. NEVER reject an approved payment. If no correlation matches, CREATE the
//      subscription from the payload itself - it has email, subscriber code,
//      transaction and dates. Money in, access out.
//   3. Refund/chargeback/cancellation take precedence over any status field.
//   4. Always answer 200 (except on a bad signature). A non-200 makes Hotmart
//      retry forever on an event we already stored.

// The subscriptions table is keyed by device_id, but a Hotmart purchase happens
// on Hotmart's page - there is no device yet. So the webhook writes a row under
// a synthetic key, and the existing email-OTP restore flow later copies it onto
// the buyer's real device_id when they come back and prove the email is theirs.
function syntheticDeviceId(parsed) {
  const seed = parsed.providerSubscriptionId || parsed.transactionId || parsed.buyerEmail;
  return `hotmart:${seed}`;
}

async function storeEvent(admin, { parsed, payload, outcome, detail }) {
  const { error } = await admin.from('subscription_events').insert({
    provider: 'hotmart',
    event_id: parsed?.eventId || null,
    event_type: parsed?.rawEvent || null,
    buyer_email: parsed?.buyerEmail || null,
    provider_subscription_id: parsed?.providerSubscriptionId || null,
    transaction_id: parsed?.transactionId || null,
    outcome,
    outcome_detail: detail || null,
    raw_payload: payload,
  });
  // A duplicate event_id means Hotmart re-delivered something already handled.
  // That is expected, not an error.
  if (error && !String(error.message).includes('duplicate')) {
    console.error('hotmart-webhook: could not store event', error.message);
  }
  return { duplicate: Boolean(error && String(error.message).includes('duplicate')) };
}

// Correlation ladder, strongest first. Returns the existing row or null.
// Never throws: a lookup failure must not turn into a rejected payment.
async function findExisting(admin, parsed) {
  const attempts = [];

  if (parsed.providerSubscriptionId) {
    attempts.push(['provider_subscription_id', parsed.providerSubscriptionId]);
  }
  if (parsed.transactionId) {
    attempts.push(['provider_transaction_id', parsed.transactionId]);
  }

  for (const [column, value] of attempts) {
    try {
      const { data } = await admin
        .from('subscriptions')
        .select('*')
        .eq(column, value)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data;
    } catch (e) {
      console.error('hotmart-webhook: correlation lookup failed', column, e.message);
    }
  }

  // Email is the last and most common rung: the embedded checkout does not
  // return our own code, so for most real purchases this is the only match.
  const email = normalizeEmail(parsed.buyerEmail);
  if (email) {
    try {
      const { data } = await admin
        .from('subscriptions')
        .select('*')
        .eq('email', email)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data;
    } catch (e) {
      console.error('hotmart-webhook: email correlation failed', e.message);
    }
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // A bad token is the one case that must NOT return 200: it is either a
  // misconfiguration or someone forging purchases.
  if (!verifyWebhookSignature(req.headers || {})) {
    console.error('hotmart-webhook: invalid or missing hottok');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const payload = req.body || {};
  const admin = getSupabaseAdmin();

  let parsed = null;
  try {
    parsed = parseWebhookEvent(payload);
  } catch (e) {
    await storeEvent(admin, { parsed: null, payload, outcome: 'error', detail: `parse failed: ${e.message}` });
    // Still 200: the payload is safely stored and can be reprocessed. Making
    // Hotmart retry a payload we cannot parse just repeats the failure.
    res.status(200).json({ received: true });
    return;
  }

  // One Hotmart ACCOUNT can sell several products, and a webhook configured at
  // account level delivers ALL of them here. Without this guard, someone buying
  // a different product from the same seller would be handed NatureLens access.
  // Opt-in: with HOTMART_PRODUCT_ID unset nothing is filtered (single-product
  // setups keep working), but the moment it is set the guard is absolute.
  const expectedProduct = process.env.HOTMART_PRODUCT_ID?.trim();
  if (expectedProduct && parsed.productId && parsed.productId !== expectedProduct) {
    await storeEvent(admin, {
      parsed,
      payload,
      outcome: 'ignored',
      detail: `other product (${parsed.productId})`,
    });
    // 200, not an error: from Hotmart's side this WAS delivered successfully -
    // it simply is not ours. A non-200 would make them retry it forever.
    res.status(200).json({ received: true, ignored: 'other product' });
    return;
  }

  const { duplicate } = await storeEvent(admin, {
    parsed,
    payload,
    outcome: 'received',
    detail: null,
  });

  if (duplicate) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  // Events with no meaningful status (cart abandoned, boleto printed, delayed)
  // are stored above and then left alone - they carry no subscriber code and
  // must not touch the subscription row.
  if (!parsed.status) {
    await storeEvent(admin, {
      parsed: { ...parsed, eventId: null },
      payload,
      outcome: 'ignored',
      detail: `no status mapped for event ${parsed.rawEvent}`,
    });
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const email = normalizeEmail(parsed.buyerEmail);
  const existing = await findExisting(admin, parsed);

  const row = {
    provider: 'hotmart',
    provider_subscription_id: parsed.providerSubscriptionId || existing?.provider_subscription_id || null,
    provider_transaction_id: parsed.transactionId || existing?.provider_transaction_id || null,
    email: email || existing?.email || null,
    status: parsed.status,
    current_period_end: parsed.currentPeriodEnd || existing?.current_period_end || null,
    plan: parsed.offerCode || existing?.plan || null,
    amount_cents: parsed.amountCents != null ? parsed.amountCents : existing?.amount_cents ?? null,
    currency: parsed.currency || existing?.currency || null,
    updated_at: new Date().toISOString(),
  };

  try {
    if (existing) {
      // Update EVERY row that shares this subscription, not just one: after a
      // buyer restores access on a second device there are several device rows
      // for one subscription, and a refund must revoke all of them.
      //
      // FABLE REVIEW FINDING (2026-07-29), the resubscribe hole: a buyer who
      // cancelled and later subscribes AGAIN gets a NEW subscriber code from
      // Hotmart. findExisting matches their old row by email, but keying the
      // update on the NEW code matches zero rows - the event would be stored
      // as 'processed', Hotmart would get its 200, and the person who just
      // paid would stay 'canceled' forever. So: only key on the new code when
      // the matched row actually carries it; otherwise write to the row we
      // found (which stamps the new code onto it via `row`), and additionally
      // propagate to any sibling device rows still carrying the OLD code.
      // EVERY write below destructures `error`. supabase-js does NOT throw on a
      // failed query - it resolves with { data: null, error } - so `await`
      // without checking meant a rejected write sailed past the try/catch, the
      // event was recorded as 'processed', and Hotmart got its 200. A purchase
      // lost that way is unrecoverable: Hotmart never resends. (Adversarial
      // review, 2026-07-29, before the first real sale.)
      let writeError = null;
      const key = row.provider_subscription_id;
      if (key && existing.provider_subscription_id === key) {
        const { error } = await admin
          .from('subscriptions')
          .update(row)
          .eq('provider_subscription_id', key);
        writeError = error;
      } else {
        const { error } = await admin
          .from('subscriptions')
          .update(row)
          .eq('device_id', existing.device_id);
        writeError = error;

        if (!writeError && existing.provider_subscription_id && existing.provider_subscription_id !== key) {
          const { error: siblingError } = await admin
            .from('subscriptions')
            .update(row)
            .eq('provider_subscription_id', existing.provider_subscription_id);
          writeError = siblingError;
        }
      }

      // If access was just revoked, revoke it everywhere that shares this email
      // too - a refunded buyer must not keep access through a device row that
      // was linked before the subscription id was known.
      if (!writeError && (parsed.status === 'expired' || parsed.status === 'canceled') && email) {
        const { error } = await admin
          .from('subscriptions')
          .update({ status: parsed.status, updated_at: row.updated_at })
          .eq('email', email);
        writeError = error;
      }

      if (writeError) throw new Error(writeError.message);

      await storeEvent(admin, {
        parsed: { ...parsed, eventId: null },
        payload,
        outcome: 'processed',
        detail: `updated existing (${parsed.status})`,
      });
    } else {
      // NOTHING MATCHED. This is the branch the whole file exists for: do NOT
      // reject. Create the subscription from the payload, under a synthetic
      // device key, so the buyer can claim it by proving their email.
      const { error } = await admin.from('subscriptions').upsert({
        device_id: syntheticDeviceId(parsed),
        ...row,
      });
      if (error) throw new Error(error.message);

      await storeEvent(admin, {
        parsed: { ...parsed, eventId: null },
        payload,
        outcome: 'processed',
        detail: `created from payload (${parsed.status}) - no prior correlation`,
      });
    }
  } catch (e) {
    console.error('hotmart-webhook: write failed', e.message);
    await storeEvent(admin, {
      parsed: { ...parsed, eventId: null },
      payload,
      outcome: 'error',
      detail: `write failed: ${e.message}`,
    });

    // The ONE case where rule 4 (always answer 200) must yield. A 200 here
    // tells Hotmart the notification was delivered and it never resends - so a
    // failed subscription write would silently cost the buyer their access
    // forever. 500 makes Hotmart retry, which is exactly what we want while the
    // cause (most likely: supabase-migration-hotmart.sql not yet run) is fixed.
    // The raw payload is already stored either way, so nothing is lost.
    res.status(500).json({ error: 'Could not record the subscription. Please retry.' });
    return;
  }

  res.status(200).json({ received: true });
};
