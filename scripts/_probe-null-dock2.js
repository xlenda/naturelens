// Cadeia de ancestrais do scroller em Ajustes (rota HIDE_DOCK_ON) + swipe real.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9600 + Math.floor(Math.random() * 80);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const CHAIN = `(() => {
  // maior scroller RNW (overflow-y auto)
  let best = null;
  for (const el of document.querySelectorAll('div')) {
    const c = getComputedStyle(el);
    if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.clientHeight > 300) {
      if (!best || el.clientHeight > best.clientHeight) best = el;
    }
  }
  if (!best) return 'sem scroller';
  const out = [];
  let n = best;
  for (let i = 0; n && n !== document.documentElement && i < 12; i++) {
    const c = getComputedStyle(n);
    out.push(i + ') ' + n.tagName + (n.id ? '#' + n.id : '') +
      ' h=' + n.clientHeight + ' sh=' + n.scrollHeight +
      ' oy=' + c.overflowY + ' flex=' + c.flexGrow + '/' + c.flexShrink + '/' + c.flexBasis +
      ' pos=' + c.position + ' height=' + c.height + ' minh=' + c.minHeight);
    n = n.parentElement;
  }
  return out.join('\\n');
})()`;

const DOC = `JSON.stringify({docSH: document.documentElement.scrollHeight, docCH: document.documentElement.clientHeight, bodySH: document.body.scrollHeight, rootSH: (document.getElementById('root')||{}).scrollHeight, rootCH: (document.getElementById('root')||{}).clientHeight, y: window.scrollY})`;

const CLICK = (re) => `(() => {
  const els = [...document.querySelectorAll('[role="button"],[tabindex],a')];
  const el = els.reverse().find((e) => ${re}.test(((e.getAttribute('aria-label')||'') + ' ' + (e.textContent||'')).trim()));
  if (!el) return '';
  const r = el.getBoundingClientRect();
  if (!r.width) return '';
  return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
})()`;

const BOTTOM_TEXT = `(() => {
  const el = [...document.querySelectorAll('div,span')].filter(e => /vers|1\\.0\\.0|excluir|delete/i.test(e.textContent||'') && e.children.length === 0).pop();
  if (!el) return 'nao achei rodape';
  const r = el.getBoundingClientRect();
  return JSON.stringify({ txt: (el.textContent||'').slice(0,30), top: Math.round(r.top), visivel: r.top < innerHeight && r.bottom > 0 });
})()`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-n2-'));
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
      if (!pos) { console.log('  (nao achei: ' + label + ')'); return false; }
      const { x, y } = JSON.parse(pos);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(3500);
      return true;
    };
    const swipe = async () => {
      // arrasta do meio da tela pra cima (touch real)
      await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x: 195, y: 620 }] });
      for (let y = 620; y > 200; y -= 40) {
        await Input.dispatchTouchEvent({ type: 'touchMove', touchPoints: [{ x: 195, y }] });
        await sleep(16);
      }
      await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
      await sleep(900);
    };

    await tap('/pular|skip|come|start/i', 'pular onboarding');
    await sleep(1500);
    await tap('/perfil|profile/i', 'Perfil');
    await tap('/ajustes|configura|settings/i', 'Ajustes');

    console.log('=== AJUSTES: cadeia do scroller ===');
    console.log(await ev(CHAIN));
    console.log('=== doc antes ===', await ev(DOC));
    console.log('=== rodape antes ===', await ev(BOTTOM_TEXT));
    await swipe();
    await swipe();
    console.log('=== doc depois de 2 swipes ===', await ev(DOC));
    console.log('=== rodape depois ===', await ev(BOTTOM_TEXT));
  } catch (e) {
    console.log('FALHA:', e.message, e.stack);
  } finally {
    try { await client.close(); } catch (e) {}
    chrome.kill();
  }
})();
