const { getSupabaseAdmin, requireDeviceId } = require('./_lib/supabaseAdmin');
const { checkRateLimit } = require('./_lib/rateLimit');

const PARAMETERS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function finiteCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

// POWER usa uma grade de 0,5 grau. Arredondar antes da requisicao evita
// transmitir ou persistir uma coordenada residencial que o produto nao usa.
function gridCoordinate(value) {
  return Math.round(value * 2) / 2;
}

function useful(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > -900 ? number : null;
}

function normalizePower(payload, latitude, longitude) {
  const parameter = payload?.properties?.parameter;
  if (!parameter || typeof parameter !== 'object') throw new Error('NASA POWER returned no parameters');
  const months = MONTHS.map((month, index) => ({
    month: index + 1,
    temperatureMeanC: useful(parameter.T2M?.[month]),
    temperatureMaxC: useful(parameter.T2M_MAX?.[month]),
    temperatureMinC: useful(parameter.T2M_MIN?.[month]),
    precipitationMmMonth: useful(parameter.PRECTOTCORR?.[month]),
    humidityPercent: useful(parameter.RH2M?.[month]),
    solarKwhM2Day: useful(parameter.ALLSKY_SFC_SW_DWN?.[month]),
  }));
  if (!months.some((month) => month.temperatureMeanC !== null || month.precipitationMmMonth !== null)) {
    throw new Error('NASA POWER returned empty climatology');
  }
  return {
    grid: { latitude, longitude, precisionDegrees: 0.5 },
    months,
    source: {
      id: 'nasa-power-climatology',
      name: 'NASA POWER',
      url: 'https://power.larc.nasa.gov/',
      temporalScope: 'climatology',
    },
  };
}

async function fetchPower(latitude, longitude) {
  const query = new URLSearchParams({
    parameters: PARAMETERS.join(','),
    community: 'AG',
    longitude: String(longitude),
    latitude: String(latitude),
    format: 'JSON',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://power.larc.nasa.gov/api/temporal/climatology/point?${query}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'NatureLens/1.0 naturelensapp.cloud' },
    });
    if (!response.ok) throw new Error(`NASA POWER ${response.status}`);
    return normalizePower(await response.json(), latitude, longitude);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const deviceId = requireDeviceId(req, res);
  if (!deviceId) return;
  if (!(await checkRateLimit(req, res, {
    scope: `site-climate:${deviceId}`,
    limit: 20,
    windowSeconds: 3600,
    ignoreIp: true,
  }))) return;

  const latitude = finiteCoordinate(req.body?.latitude, -90, 90);
  const longitude = finiteCoordinate(req.body?.longitude, -180, 180);
  if (latitude === null || longitude === null) return res.status(400).json({ error: 'Invalid coordinates' });
  const gridLatitude = gridCoordinate(latitude);
  const gridLongitude = gridCoordinate(longitude);

  try {
    const admin = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
    const { data: cached, error: cacheError } = await admin.from('site_climate_cache')
      .select('payload,fetched_at').eq('grid_latitude', gridLatitude).eq('grid_longitude', gridLongitude)
      .gte('fetched_at', cutoff).maybeSingle();
    if (!cacheError && cached?.payload) return res.status(200).json({ ...cached.payload, cached: true });

    const payload = await fetchPower(gridLatitude, gridLongitude);
    const { error: writeError } = await admin.from('site_climate_cache').upsert({
      grid_latitude: gridLatitude,
      grid_longitude: gridLongitude,
      payload,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'grid_latitude,grid_longitude' });
    if (writeError) console.error('site climate cache write failed', writeError.message);
    return res.status(200).json({ ...payload, cached: false });
  } catch (error) {
    console.error('site climate failed', error.message);
    return res.status(503).json({ error: 'Climate context unavailable' });
  }
};

module.exports._test = { gridCoordinate, normalizePower };
