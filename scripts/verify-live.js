// Post-deploy live verification gate.
//
// Ported (as a concept) from Cosmic Guide's e2e-regression.js, adapted to what
// this project can honestly run: there is no Playwright installed here, so this
// probes the PRODUCTION deployment over HTTP instead of driving a browser.
// Every check below was born from a real incident in this app - nothing is a
// hypothetical.
//
// Usage:  node scripts/verify-live.js          (run after every prod deploy)
//         npm run deploy                        (test -> build -> deploy -> this)
//
// Exit code 1 on any failure, so a wrapper script can abort/alert.

const fs = require('fs');
const path = require('path');

const BASE = process.env.VERIFY_BASE_URL || 'https://naturelensapp.cloud';

// Production secrets are not in the shell by default. Loading the pulled env
// file (npx vercel env pull .env.check) lets the database check below run during
// npm run deploy without anyone exporting anything by hand.
for (const candidate of ['.env.check', '.env.production.local', '.env.local']) {
  const file = path.join(__dirname, '..', candidate);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=([\s\S]*)$/);
    // Never overwrite something already set in the real environment.
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
  }
  break;
}

let failures = 0;
const results = [];

function ok(name, detail = '') {
  results.push(`  OK   ${name}${detail ? ' - ' + detail : ''}`);
}
function fail(name, detail = '') {
  failures++;
  results.push(`  FAIL ${name}${detail ? ' - ' + detail : ''}`);
}
// A check that could not run is neither a pass nor a failure. Reporting it as OK
// would be a lie; failing it would block a contributor who simply has no
// production credentials.
function skip(name, why) {
  results.push(`  SKIP ${name}${why ? ' - ' + why : ''}`);
}

async function get(pathname, init) {
  return fetch(BASE + pathname, { ...init, signal: AbortSignal.timeout(20000) });
}

async function main() {
  // 1/2. The page serves and the hashed bundle it references actually loads.
  //      (Real incident class: deploy "succeeded" but served a broken page.)
  try {
    const r = await get('/');
    const html = await r.text();
    const bundle = html.match(/AppEntry-[a-f0-9]+\.js/);
    if (r.status === 200 && bundle) ok('index.html', bundle[0]);
    else fail('index.html', `status ${r.status}, bundle ${bundle ? 'found' : 'MISSING'}`);

    if (bundle) {
      const rb = await get(`/_expo/static/js/web/${bundle[0]}`, { method: 'HEAD' });
      if (rb.status === 200) ok('bundle serves');
      else fail('bundle serves', `status ${rb.status}`);
    }
  } catch (e) {
    fail('index.html', e.message);
  }

  // 3. Locales parse and carry a sentinel key from every feature wave.
  //    (Features shipping in code without their strings render raw key names.)
  try {
    const j = await (await get('/locales/pt.json')).json();
    const sentinels = [
      ['categories.fish.tabLabel', j.categories?.fish?.tabLabel],
      ['categories.bird.tabLabel', j.categories?.bird?.tabLabel],
      ['store.title', j.store?.title],
      ['missions.title', j.missions?.title],
      ['recap.title', j.recap?.title],
      ['onboarding.what.title', j.onboarding?.what?.title],
      ['subscription.title', j.subscription?.title],
      ['notifications.row', j.notifications?.row],
      ['share.message', j.share?.message],
      ['identify.lowConfidenceBare', j.identify?.lowConfidenceBare],
      ['identify.addAngle', j.identify?.addAngle],
    ];
    const missing = sentinels.filter(([, v]) => !v).map(([k]) => k);
    if (missing.length === 0) ok('pt.json sentinels', `${sentinels.length} keys`);
    else fail('pt.json sentinels', `missing: ${missing.join(', ')}`);
  } catch (e) {
    fail('pt.json', e.message);
  }

  // 3b. Field-guide content for fish and birds (loaded on demand, so a
  //     missing file only shows up when a user taps a species).
  try {
    const j = await (await get('/locales/pt-species.json')).json();
    const fish = Object.keys(j.fishDetails || {}).length;
    const bird = Object.keys(j.birdDetails || {}).length;
    if (fish >= 10 && bird >= 10) ok('species field guide', fish + ' fish, ' + bird + ' birds');
    else fail('species field guide', fish + ' fish, ' + bird + ' birds');
  } catch (e) {
    fail('species field guide', e.message);
  }

  // 4. Icon fonts still serve. (The Vercel-ignores-node_modules trap: if asset
  //    path handling ever changes, every icon in the app silently disappears.)
  try {
    const html = await (await get('/')).text();
    const font = html.match(/\/assets\/node_modules\/[^"']*Ionicons[^"']*\.ttf/);
    if (font) {
      const rf = await get(font[0], { method: 'HEAD' });
      if (rf.status === 200) ok('icon fonts');
      else fail('icon fonts', `status ${rf.status}`);
    } else {
      ok('icon fonts', 'not referenced in html (bundled elsewhere)');
    }
  } catch (e) {
    fail('icon fonts', e.message);
  }

  // 5. Identify API guards + the legacy rewrite that keeps installed PWAs alive.
  try {
    const r405 = await get('/api/identify', { method: 'GET' });
    if (r405.status === 405) ok('identify rejects GET');
    else fail('identify rejects GET', `status ${r405.status}`);

    const r400 = await get('/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'dinossauro' }),
    });
    if (r400.status === 400) ok('identify rejects unknown category');
    else fail('identify rejects unknown category', `status ${r400.status}`);

    const rLegacy = await get('/api/identify-plant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (rLegacy.status === 400) ok('legacy rewrite reaches handler');
    else fail('legacy rewrite reaches handler', `status ${rLegacy.status} (404 = rewrite broken)`);
  } catch (e) {
    fail('identify API', e.message);
  }

  // 6. Hotmart webhook rejects a forged call. 401 is the ONE non-200 this
  //    endpoint must return - answering 200 to no token would let anyone mint
  //    subscriptions.
  try {
    const r = await get('/api/hotmart-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'PURCHASE_APPROVED' }),
    });
    if (r.status === 401) ok('webhook rejects missing hottok');
    else fail('webhook rejects missing hottok', `status ${r.status}`);
  } catch (e) {
    fail('webhook', e.message);
  }

  // 7. Push endpoint exists and validates. (A 404 here means the function was
  //    dropped, e.g. by hitting the Hobby function cap.)
  try {
    const r = await get('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (r.status === 400) ok('push endpoint validates');
    else fail('push endpoint validates', `status ${r.status}`);
  } catch (e) {
    fail('push endpoint', e.message);
  }

  // 8. Stripe stays dead. A resurrected endpoint means a deploy from an old tree.
  try {
    const r = await get('/api/stripe/create-checkout-session', { method: 'POST' });
    if (r.status === 404) ok('stripe endpoints gone');
    else fail('stripe endpoints gone', `status ${r.status}`);
  } catch (e) {
    fail('stripe check', e.message);
  }

  // 9. Landing page carries the subscription disclosures Google Ads requires on
  //    the destination page of a subscription ad. Missing them = ad rejected.
  try {
    const r = await get('/premium/');
    const html = await r.text();
    const needed = ['Renova', 'Cancele quando quiser', 'Assinar'];
    const missing = needed.filter((n) => !html.includes(n));
    if (r.status === 200 && missing.length === 0) ok('landing /premium');
    else fail('landing /premium', `status ${r.status}, missing: ${missing.join(', ') || 'none'}`);
  } catch (e) {
    fail('landing /premium', e.message);
  }

  // 10. Open Graph tag + image. Without these, every shared link is a bare URL
  //     with no preview card.
  try {
    const html = await (await get('/')).text();
    const hasOg = html.includes('property="og:image"') && html.includes('og-image.png');
    const rImg = await get('/og-image.png', { method: 'HEAD' });
    if (hasOg && rImg.status === 200) ok('og:image');
    else fail('og:image', `tag ${hasOg ? 'ok' : 'MISSING'}, image ${rImg.status}`);
  } catch (e) {
    fail('og:image', e.message);
  }

  // 11. Service worker still carries the push handlers - a rebuild that lost
  //     them would silently kill every notification.
  try {
    const sw = await (await get('/sw.js')).text();
    const hasPush = sw.includes("addEventListener('push'");
    const hasClick = sw.includes("addEventListener('notificationclick'");
    if (hasPush && hasClick) ok('service worker push handlers');
    else fail('service worker push handlers', `push ${hasPush}, click ${hasClick}`);
  } catch (e) {
    fail('service worker', e.message);
  }

  // 12. Security headers, verified LIVE - the standing lesson that config files
  //     lie and only the served response tells the truth.
  try {
    const r = await get('/', { method: 'HEAD' });
    const need = {
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    };
    const bad = Object.entries(need).filter(([h, v]) => r.headers.get(h) !== v);
    if (bad.length === 0) ok('security headers');
    else fail('security headers', bad.map(([h]) => h).join(', '));
  } catch (e) {
    fail('security headers', e.message);
  }

  // 12b. Permissions-Policy must ALLOW every browser capability the app uses.
  //
  //      An empty allowlist - microphone=() - denies the feature to EVERYONE,
  //      including this site itself. It is not "default" or "ask": the browser
  //      rejects getUserMedia with NotAllowedError before any prompt appears,
  //      and nothing in the page can override it.
  //
  //      On 2026-07-30 that header shipped sound identification stone dead. The
  //      inference host, the API and the recorder were all correct and verified
  //      end to end with real recordings - but no browser would ever hand over a
  //      microphone, and SoundScreen told the user to check THEIR settings for a
  //      problem that was ours. camera=(self) was already correct, which is
  //      exactly why photo identification never hit this.
  //
  //      So the header is now derived from what the code actually calls, not
  //      from what someone remembered to allow.
  try {
    const r = await get('/', { method: 'HEAD' });
    const policy = r.headers.get('permissions-policy') || '';

    // Each capability: the directive name, and the source files whose use of it
    // makes the permission mandatory.
    const CAPABILITIES = [
      { directive: 'microphone', callSite: /getUserMedia\s*\(\s*\{[\s\S]{0,200}?audio/, files: ['components/audioRecorder.js'] },
      { directive: 'camera', callSite: /getUserMedia|expo-camera|CameraView/, files: ['screens/IdentifyScreen.js'] },
      { directive: 'geolocation', callSite: /getCurrentPosition|expo-location/, files: ['components/identify.js', 'screens/IdentifyScreen.js'] },
    ];

    const problems = [];
    for (const cap of CAPABILITIES) {
      const used = cap.files.some((f) => {
        const full = path.join(__dirname, '..', f);
        return fs.existsSync(full) && cap.callSite.test(fs.readFileSync(full, 'utf8'));
      });

      // Matches "microphone=(self)", "microphone=()", "microphone=*".
      const match = policy.match(new RegExp(cap.directive + '\\s*=\\s*(\\([^)]*\\)|\\*)'));
      const value = match ? match[1] : null;
      const allowed = value !== null && value !== '()';

      if (used && !allowed) {
        problems.push(
          `${cap.directive} is used by the app but the header ${
            value === '()' ? 'DENIES it to everyone (empty allowlist)' : 'never allows it'
          }`
        );
      }
      // The reverse is not a failure, just noise-free least privilege: a
      // capability allowed but unused costs nothing and may be pending a feature.
    }

    if (problems.length === 0) ok('Permissions-Policy allows what the app uses');
    else fail('Permissions-Policy allows what the app uses', problems.join('; '));
  } catch (e) {
    fail('Permissions-Policy allows what the app uses', e.message);
  }

  // 13. The database must accept a usage row for EVERY category the app offers.
  //
  //     This check exists because of a two-day silent revenue leak. recordUsage()
  //     catches the Supabase error and only console.errors it (supabase-js does
  //     not throw - it resolves with {data:null,error}), so when the
  //     category_usage CHECK constraint did not list 'fish' and 'bird', every
  //     scan of those categories succeeded, the counter never incremented, and
  //     the free-tier limit never applied. Nothing failed. Nothing alerted.
  //     Confirmed live on 2026-07-30 by inserting into production: plant 201,
  //     fish/bird/sound/tree all 400 (23514 check_violation).
  //
  //     Reading the constraint needs no DDL: inserting a throwaway row and
  //     deleting it tells us exactly what production will accept, which is the
  //     only thing that matters. Skipped when the service key is absent (a
  //     contributor running the script locally should not be blocked by it).
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceKey) {
      skip('db accepts every category', 'no service key in this environment');
    } else {
      // Read the enabled categories from the app itself rather than hardcoding
      // them, so adding a category cannot forget to update this check.
      const categoriesSrc = fs.readFileSync(
        path.join(__dirname, '..', 'components', 'categories.js'),
        'utf8'
      );
      const enabled = [];
      for (const m of categoriesSrc.matchAll(/^\s{2}(\w+):\s*\{([\s\S]*?)^\s{2}\},/gm)) {
        // enabled: false keeps a category in CATEGORIES for old saved entries
        // but removes it from the tabs - those cannot be scanned, so the
        // database does not need to accept them.
        if (!/enabled:\s*false/.test(m[2])) enabled.push(m[1]);
      }

      const headers = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      };
      // A device id that is a valid uuid but cannot belong to a real device.
      const probeDevice = '00000000-0000-4000-8000-0000000000ff';
      const rejected = [];

      for (const category of enabled) {
        const insert = await fetch(`${supabaseUrl}/rest/v1/category_usage`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ device_id: probeDevice, category, used_count: 1 }),
        });
        if (insert.ok) {
          await fetch(
            `${supabaseUrl}/rest/v1/category_usage?device_id=eq.${probeDevice}&category=eq.${category}`,
            { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          );
        } else {
          rejected.push(category);
        }
      }

      if (rejected.length === 0) {
        ok('db accepts every category', `${enabled.length} checked`);
      } else {
        fail(
          'db accepts every category',
          `${rejected.join(', ')} rejected - these are FREE AND UNLIMITED right now; ` +
            'run supabase-migration-hotmart.sql'
        );
      }
    }
  } catch (e) {
    fail('db accepts every category', e.message);
  }

  console.log(`\nverify-live against ${BASE}\n`);
  console.log(results.join('\n'));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('verify-live crashed:', e);
  process.exit(1);
});
