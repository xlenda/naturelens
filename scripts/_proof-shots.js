// Prova visual pós-deploy: abre o site AO VIVO num Chrome headless com perfil
// descartável (usuário NOVO, storage vazio), navega pelas telas-chave e salva
// screenshots. Temporário — apagar depois da conferência.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9300 + Math.floor(Math.random() * 400);
const OUT = process.argv[2] || '.';

const CANDIDATES = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!chromePath) throw new Error('chrome not found');

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-proof-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--window-size=390,844',
      '--hide-scrollbars',
    ],
    { stdio: 'ignore' }
  );

  let client;
  const shot = async (Page, name) => {
    const { data } = await Page.captureScreenshot({ format: 'jpeg', quality: 80 });
    fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(data, 'base64'));
    console.log('shot', name);
  };
  // Clica no elemento cujo texto/aria-label contém `needle` (case-insensitive).
  const clickByText = async (Runtime, needle) => {
    const expr = `(() => {
      const n = ${JSON.stringify(needle)}.toLowerCase();
      const els = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
      const el = els.find(e => (e.getAttribute('aria-label')||'').toLowerCase().includes(n)
        || (e.textContent||'').toLowerCase().includes(n));
      if (!el) return 'NOT FOUND: ' + n;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`;
    const { result } = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.value;
  };
  const tap = async (Input, pos) => {
    const { x, y } = JSON.parse(pos);
    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  try {
    for (let i = 0; i < 30; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    if (!client) throw new Error('no CDP');
    const { Page, Runtime, Input, Emulation } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(2500);
    await shot(Page, '01-splash-ou-onboarding');
    await sleep(4500);
    await shot(Page, '02-onboarding-1');

    let pos = await clickByText(Runtime, 'next');
    if (pos.startsWith('NOT')) pos = await clickByText(Runtime, 'avan');
    if (!pos.startsWith('NOT')) { await tap(Input, pos); await sleep(900); await shot(Page, '03-onboarding-2'); }

    // pular pro app
    let skip = await clickByText(Runtime, 'skip');
    if (skip.startsWith('NOT')) skip = await clickByText(Runtime, 'pular');
    if (!skip.startsWith('NOT')) { await tap(Input, skip); await sleep(2500); }
    await shot(Page, '04-home-scan');

    // Curiosidades / Discover
    let disc = await clickByText(Runtime, 'curiosidades');
    if (disc.startsWith('NOT')) disc = await clickByText(Runtime, 'discover');
    if (!disc.startsWith('NOT')) {
      await tap(Input, disc);
      await sleep(3500); // fotos das capas chegando
      await shot(Page, '05-discover');
    }

    // Perfil
    let prof = await clickByText(Runtime, 'perfil');
    if (prof.startsWith('NOT')) prof = await clickByText(Runtime, 'profile');
    if (!prof.startsWith('NOT')) {
      await tap(Input, prof);
      await sleep(1500);
      await shot(Page, '06-perfil');
    }
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
  }
})();
