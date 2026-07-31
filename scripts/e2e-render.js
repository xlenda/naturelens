// E2E render gate - opens the PUBLISHED app in a real browser and checks it
// actually renders.
//
// WHY THIS EXISTS (2026-07-29): the app shipped completely broken for every
// user - OnboardingScreen rendered outside SafeAreaProvider and threw "No safe
// area value available" on first open. scripts/verify-live.js passed 14/14
// through the whole incident, because it only speaks HTTP: the bundle
// downloaded, the locales served, the APIs answered. None of that proves a
// screen mounts.
//
// This is the gate that closes that gap. It drives headless Chrome over the
// DevTools Protocol - deliberately NOT Playwright, which would pull ~150MB of
// browser binaries into a project that already has Chrome installed.
//
// What it asserts, all of it born from a real failure:
//   1. The app mounts and paints real content (not a blank body).
//   2. No uncaught exception and no console error during boot.
//   3. The ErrorBoundary fallback is NOT on screen (its presence means a crash
//      was caught - the app "works" but the user sees an apology).
//   4. Onboarding (first visit, empty storage) renders and can be dismissed.
//   5. After onboarding, the tab bar with the scan categories is present.
//   6. A reload does NOT show onboarding again.
//
// Usage:  node scripts/e2e-render.js  [url]
// Exit 1 on any failure so npm run deploy can abort.

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CDP = require('chrome-remote-interface');

const URL_UNDER_TEST = process.argv[2] || process.env.E2E_URL || 'https://naturelensapp.cloud/';
const PORT = 9222 + Math.floor(Math.random() * 200);

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

let failures = 0;
const results = [];
const ok = (n, d) => results.push(`  OK   ${n}${d ? ' - ' + d : ''}`);
const fail = (n, d) => {
  failures++;
  results.push(`  FAIL ${n}${d ? ' - ' + d : ''}`);
};

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('No Chrome/Edge found - skipping E2E render gate.');
    // Not a failure: a machine without a browser should not block a deploy,
    // it just does not get this check. Says so loudly rather than pretending.
    process.exit(0);
  }

  // A throwaway profile guarantees EMPTY storage, which is what makes the
  // first-visit onboarding assertion meaningful. Reusing the real profile
  // would silently skip it after the first ever run.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naturelens-e2e-'));

  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=390,844', // a phone-sized viewport: this is a mobile app
    ],
    { stdio: 'ignore' }
  );

  let client;
  try {
    // Chrome needs a moment before the debugging port accepts connections.
    for (let i = 0; i < 30; i++) {
      try {
        client = await CDP({ port: PORT });
        break;
      } catch (e) {
        await sleep(400);
      }
    }
    if (!client) throw new Error(`Could not connect to Chrome on port ${PORT}`);

    const { Page, Runtime, Console, Network } = client;
    await Promise.all([Page.enable(), Runtime.enable(), Console.enable(), Network.enable()]);

    const consoleErrors = [];
    const pageExceptions = [];

    Runtime.exceptionThrown(({ exceptionDetails }) => {
      pageExceptions.push(
        exceptionDetails?.exception?.description || exceptionDetails?.text || 'unknown exception'
      );
    });
    Runtime.consoleAPICalled(({ type, args }) => {
      if (type !== 'error') return;
      const text = args.map((a) => a.value || a.description || '').join(' ');
      // The i18n init catch logs deliberately on a degraded boot; and browsers
      // emit noise for blocked third-party trackers that says nothing about
      // whether OUR app works.
      if (/googletagmanager|utmify|favicon|ERR_BLOCKED/i.test(text)) return;
      consoleErrors.push(text);
    });

    const evaluate = async (expression) => {
      const { result } = await Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
      return result.value;
    };

    // Waits for the app to reach a KNOWN state, not merely to have some text.
    //
    // Two false failures taught this shape:
    //
    //   1. A fixed sleep(4000) started failing the moment the bundle grew - the
    //      app rendered fine at ~5s and the gate had already given up.
    //   2. Polling for "any body text over 20 chars" then failed differently: it
    //      returned on a partial first paint, before OnboardingScreen mounted, so
    //      the onboarding check ran too early, took the "already seen" branch, and
    //      reported both "neither onboarding nor tab bar found" AND "the seen flag
    //      is not sticking" on the reload - a contradiction that was entirely the
    //      harness's own timing.
    //
    // A flake here is worse than useless: it blocks good deploys and trains you
    // to ignore the one gate that catches a genuinely blank screen. So the wait
    // ends on one of the app's two real end states - the onboarding CTA, or the
    // tab bar - and only reports blank after the full budget.
    const BOOT_BUDGET_MS = 25000;

    // Onboarding's Skip/Next, in every language the gate might meet.
    const ONBOARDING_RE = 'Skip|Pular|Saltar|Next|Avan|Start identifying|Come\\u00e7ar';
    const TAB_LABELS = ['Plants', 'Plantas', 'Insects', 'Insetos', 'Collection', 'Cole\\u00e7\\u00e3o', 'Discover', 'Descobrir'];

    const probeState = async () => {
      const raw = await evaluate(`
        (function () {
          var t = (document.body.innerText || '').trim();
          var tabs = ${JSON.stringify(TAB_LABELS)}.filter(function (h) { return t.indexOf(h) >= 0; }).length;
          return JSON.stringify({
            len: t.length,
            onboarding: new RegExp('${ONBOARDING_RE}', 'i').test(t),
            tabs: tabs,
          });
        })()
      `);
      return JSON.parse(raw || '{"len":0,"onboarding":false,"tabs":0}');
    };

    const waitForAppReady = async () => {
      const started = Date.now();
      let state = { len: 0, onboarding: false, tabs: 0 };
      while (Date.now() - started < BOOT_BUDGET_MS) {
        state = await probeState();
        // Either end state means the app is genuinely up and interactive.
        if (state.onboarding || state.tabs >= 2) return { ...state, ms: Date.now() - started };
        await sleep(300);
      }
      return { ...state, ms: Date.now() - started, timedOut: true };
    };

    // ---- 1. Load ----
    await Page.navigate({ url: URL_UNDER_TEST });
    await Page.loadEventFired();

    const ready = await waitForAppReady();
    if (!ready.timedOut) {
      // The boot time is reported, not asserted: a jump from 2s to 20s is worth
      // seeing even when the check passes.
      ok(
        'app renders content',
        `${ready.len} chars in ${(ready.ms / 1000).toFixed(1)}s (${
          ready.onboarding ? 'onboarding' : `${ready.tabs} tab labels`
        })`
      );
    } else {
      fail(
        'app renders content',
        `never reached onboarding or the tab bar in ${(ready.ms / 1000).toFixed(0)}s ` +
          `(body ${ready.len} chars, ${ready.tabs} tab labels)`
      );
    }

    // ---- 2. No crash ----
    if (pageExceptions.length === 0) ok('no uncaught exceptions');
    else fail('no uncaught exceptions', pageExceptions[0].split('\n')[0]);

    if (consoleErrors.length === 0) ok('no console errors');
    else fail('no console errors', consoleErrors[0].slice(0, 160));

    // ---- 3. ErrorBoundary must NOT be showing ----
    // Its copy is hardcoded (it cannot use i18n), so these exact strings are a
    // reliable signal that a render crashed and was caught.
    const boundaryVisible = await evaluate(`
      (function () {
        var t = document.body.innerText || '';
        return t.includes('Something went wrong') || t.includes('Algo deu errado') || t.includes('Algo salió mal');
      })()
    `);
    if (!boundaryVisible) ok('no ErrorBoundary fallback');
    else fail('no ErrorBoundary fallback', 'a render crash was caught - app is broken for users');

    // ---- 4. Onboarding on a first visit ----
    const onboardingVisible = await evaluate(`
      (function () {
        var t = document.body.innerText || '';
        return /Skip|Pular|Saltar|Next|Avan|Start identifying|Come\\u00e7ar/i.test(t);
      })()
    `);
    if (onboardingVisible) {
      ok('onboarding shows on first visit');

      // Click through it by finding the primary CTA and clicking its centre.
      const clicked = await evaluate(`
        (function () {
          var els = Array.prototype.slice.call(document.querySelectorAll('div[role="button"], button, [tabindex]'));
          var cta = els.filter(function (e) {
            var t = (e.innerText || '').trim();
            return /^(Next|Avan|Siguiente|Weiter|Start identifying|Come\\u00e7ar|Empezar)/i.test(t);
          })[0];
          if (!cta) return false;
          cta.click();
          return true;
        })()
      `);

      if (clicked) {
        // Three screens: click through the rest.
        for (let i = 0; i < 3; i++) {
          await sleep(700);
          await evaluate(`
            (function () {
              var els = Array.prototype.slice.call(document.querySelectorAll('div[role="button"], button, [tabindex]'));
              var cta = els.filter(function (e) {
                var t = (e.innerText || '').trim();
                return /^(Next|Avan|Siguiente|Weiter|Start identifying|Come\\u00e7ar|Empezar)/i.test(t);
              })[0];
              if (cta) cta.click();
            })()
          `);
        }
        // Poll for the tab bar rather than sleeping a guessed amount. The
        // navigator mounts seven scan screens plus Collection/Profile/Discover/
        // Botanist, and that got slower every time a category was added.
        let inApp = 0;
        const navDeadline = Date.now() + 12000;
        do {
          inApp = await evaluate(`
            (function () {
              var t = document.body.innerText || '';
              // The tab bar labels are the proof the navigator mounted.
              var hits = ['Plants','Plantas','Insects','Insetos','Collection','Cole\\u00e7\\u00e3o','Discover','Descobrir'];
              return hits.filter(function (h) { return t.includes(h); }).length;
            })()
          `);
          if (inApp >= 2) break;
          await sleep(400);
        } while (Date.now() < navDeadline);
        if (inApp >= 2) ok('reaches the app after onboarding', `${inApp} tab labels found`);
        else fail('reaches the app after onboarding', `only ${inApp} tab labels visible`);
      } else {
        fail('onboarding CTA clickable', 'could not find the primary button');
      }
    } else {
      // Not automatically a failure - a cached "seen" flag or a different
      // language would do this. But then the tab bar must be there instead.
      const inApp = await evaluate(`
        (function () {
          var t = document.body.innerText || '';
          var hits = ['Plants','Plantas','Insects','Insetos','Collection','Cole\\u00e7\\u00e3o','Discover','Descobrir'];
          return hits.filter(function (h) { return t.includes(h); }).length;
        })()
      `);
      if (inApp >= 2) ok('app shell renders (onboarding already seen)', `${inApp} tab labels`);
      else fail('app shell renders', 'neither onboarding nor tab bar found on screen');
    }

    // ---- 5. Reload must not replay onboarding ----
    await Page.navigate({ url: URL_UNDER_TEST });
    await Page.loadEventFired();
    // Same reason as the first load, and this one is the dangerous direction:
    // "onboarding did not reappear" would pass simply because nothing had
    // rendered yet. Waiting for a real end state makes the assertion mean
    // something.
    await waitForAppReady();
    const onboardingAgain = await evaluate(`
      (function () {
        var t = document.body.innerText || '';
        return /Skip|Pular|Saltar/i.test(t);
      })()
    `);
    if (!onboardingAgain) ok('onboarding does not repeat after reload');
    else fail('onboarding does not repeat after reload', 'the seen flag is not sticking');
  } catch (e) {
    fail('e2e harness', e.message);
  } finally {
    try {
      if (client) await client.close();
    } catch (e) {}
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }

  console.log(`\ne2e-render against ${URL_UNDER_TEST}\n`);
  console.log(results.join('\n'));
  console.log(`\n${failures === 0 ? 'ALL RENDER CHECKS PASSED' : failures + ' RENDER CHECK(S) FAILED'}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('e2e-render crashed:', e);
  process.exit(1);
});
