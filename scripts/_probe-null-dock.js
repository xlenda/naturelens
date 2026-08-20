// Cetico: o `return null` do TwoRowTabBar reserva altura na cena?
// Mede a cena (container flex:1 do BottomTabView) em rota COM dock (Home)
// e em rota SEM dock (Ajustes). Se null reservasse altura, Ajustes < 844.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9700 + Math.floor(Math.random() * 80);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

// Cena = descendente direto do #root que tem overflow hidden e flex 1.
// Reporta TODOS os scrollers reais (overflow-y auto com overflow de verdade).
const MEASURE = `(() => {
  const out = { vp: innerHeight, scroll: [], dock: null, cena: null };
  for (const el of document.querySelectorAll('div')) {
    const c = getComputedStyle(el);
    if (c.overflowY === 'auto' || c.overflowY === 'scroll') {
      out.scroll.push({ h: el.clientHeight, sh: el.scrollHeight, rola: el.scrollHeight > el.clientHeight + 20 });
    }
    if (c.overflow === 'hidden' && c.flexGrow === '1' && el.clientHeight > 300 && !out.cena) {
      out.cena = { h: el.clientHeight, w: el.clientWidth };
    }
    if (c.position === 'absolute' && c.bottom === '0px' && el.clientHeight > 40 && el.clientHeight < 200) {
      out.dock = { h: el.clientHeight, pos: c.position };
    }
  }
  return JSON.stringify(out);
})()`;

const CLICK = (re) => `(() => {
  const els = [...document.querySelectorAll('[role="button"],[tabindex],a')];
  const el = els.reverse().find((e) => ${re}.test(((e.getAttribute('aria-label')||'') + ' ' + (e.textContent||'')).trim()));
  if (!el) return '';
  const r = el.getBoundingClientRect();
  if (!r.width) return '';
  return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
})()`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-null-'));
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--headless=new',
    '--disable-gpu', '--no-first-run', '--window-size=390,844',
  ], { stdio: 'ignore' });
  let client;
  try {
    for (let i = 0; i < 40; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    const { Page, Runtime, Emulation, Input } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 5 });
    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(11000);
    const ev = async (e) => (await Runtime.evaluate({ expression: e, returnByValue: true })).result.value;
    const tap = async (re, label) => {
      const pos = await ev(CLICK(re));
      if (!pos) { console.log('  (nao achei botao: ' + label + ')'); return false; }
      const { x, y } = JSON.parse(pos);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(3500);
      return true;
    };

    await tap('/pular|skip|come|start/i', 'pular onboarding');
    await sleep(1500);
    console.log('HOME (dock VISIVEL):', await ev(MEASURE));

    await tap('/perfil|profile/i', 'Perfil');
    console.log('PERFIL (dock VISIVEL):', await ev(MEASURE));

    await tap('/ajustes|configura|settings/i', 'Ajustes');
    console.log('AJUSTES (dock NULL):', await ev(MEASURE));
    console.log('titulo visivel:', await ev(`document.body.innerText.slice(0,120).replace(/\\n/g,' | ')`));
  } catch (e) {
    console.log('FALHA:', e.message);
  } finally {
    try { await client.close(); } catch (e) {}
    chrome.kill();
  }
})();
