const { getSupabaseAdmin } = require('./supabaseAdmin');

function paymentRequired(res) {
  res.status(402).json({
    error: 'Free use already used for this category. Subscribe to keep identifying.',
    paymentRequired: true,
  });
  return { allowed: false, subscribed: false, reserved: false };
}

// A chamada externa so pode comecar depois que uma unica requisicao venceu a
// reserva atomica. Incrementar depois do fornecedor deixa todas as chamadas de
// um lote concorrente atravessarem a mesma leitura de zero.
async function checkEntitlement(res, deviceId, category) {
  const admin = getSupabaseAdmin();
  const { data: sub, error: subError } = await admin
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (subError) {
    // Uma indisponibilidade do banco nao pode revogar acesso de quem ja pagou.
    // Tratar como assinante tambem evita tentar uma segunda operacao no mesmo
    // banco quebrado; o limite compartilhado por IP continua contendo custo.
    console.error('checkEntitlement: subscriptions read failed', deviceId, subError.message);
    return { allowed: true, subscribed: true, reserved: false };
  }

  if (sub?.status === 'active') {
    return { allowed: true, subscribed: true, reserved: false };
  }

  if (sub?.status === 'canceled' && sub?.current_period_end) {
    const endsAt = new Date(sub.current_period_end).getTime();
    if (Number.isFinite(endsAt) && endsAt > Date.now()) {
      return { allowed: true, subscribed: true, reserved: false };
    }
  }

  const { data: reserved, error: reserveError } = await admin.rpc('reserve_category_usage', {
    p_device_id: deviceId,
    p_category: category,
  });
  if (reserveError) {
    // Falhar aberto aqui permitiria drenar fornecedores sempre que a migration
    // estivesse ausente. Pagantes ja foram liberados acima; usuario gratuito
    // recebe indisponibilidade temporaria, nao uma falsa cobranca.
    console.error('checkEntitlement: reservation failed', deviceId, category, reserveError.message);
    res.status(503).json({ error: 'Usage verification unavailable', reason: 'identifyFailed' });
    return { allowed: false, subscribed: false, reserved: false };
  }

  return reserved === true
    ? { allowed: true, subscribed: false, reserved: true }
    : paymentRequired(res);
}

async function releaseUsage(deviceId, category) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('release_category_usage', {
    p_device_id: deviceId,
    p_category: category,
  });
  if (error) console.error('releaseUsage: release failed', deviceId, category, error.message);
  return !error;
}

module.exports = { checkEntitlement, releaseUsage };
