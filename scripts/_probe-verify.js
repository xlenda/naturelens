// Verificacao cetica do achado "dock absolute matou o scroll".
// Mede HOME, PERFIL e AJUSTES em 390x844 com touch real.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9700 + Math.floor(Math.random() * 200);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const SCROLLERS = `(() => {
  const l = [];
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
      l.push('oy=' + cs.overflowY + ' h=' + el.clientHeight + ' sh=' + el.scrollHeight + ' pos=' + cs.position);
    }
  }
  return l.length ? l.join(' ;; ') : 'NENHUM SCROLLER COM OVERFLOW';
})()`;

const CHAIN = `(() => {
  // pega o scroller vertical mais alto (o principal da tela) e sobe a cadeia
  let best = null;
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if (cs.overflowY === 'auto' && el.clientHeight > 300) { if (!best || el.clientHeight > best.clientHeight) best = el; }
  }
  if (!best) return 'sem scroller vertical grande';
  const out = []; let n = best;
  for (let i = 0; n && n !== document.documentElement && i < 9; i++) {
    const cs = getComputedStyle(n);
    out.push(i + ') ' + n.tagName + ' h=' + n.clientHeight + ' sh=' + n.scrollHeight + ' oy=' + cs.overflowY +
      ' flex=' + cs.flexGrow + '/' + cs.flexShrink + '/' + cs.flexBasis + ' pos=' + cs.position + ' minh=' + cs.minHeight);
    n = n.parentElement;
  }
  return out.join('\\n   ');
})()`;

const DOCK = `(() => {
  const els = [...document.querySelectorAll('div')].filter((e) => {
    const cs = getComputedStyle(e);
    return cs.position === 'absolute' && cs.bottom === '0px' && e.clientHeight > 40 && e.clientHeight < 220 && e.clientWidth > 300;
  });
  return els.length ? 'DOCK ABSOLUTO h=' + els[els.length - 1].clientHeight : 'sem dock absoluto visivel';
})()`;

const GESTURE = async (Input) => {
  for (let k = 0; k < 3; k++) {
    await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x: 195, y: 700 }] });
    for (let y = 660; y >= 380; y -= 40)
      await Input.dispatchTouchEvent({ type: 'touchMove', touchPoints: [{ x: 195, y }] });
    await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  }
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-verify-'));
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--headless=new',
    '--disable-gpu', '--no-first-run', '--window-size=390,844',
  ], { stdio: 'ignore' });
  let client;
  try {
    for (let i = 0; i < 50; i++) { try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); } }
    const { Page, Runtime, Emulation, Input } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await Emulation.setEmitTouchEventsForMouse({ enabled: true, configuration: 'mobile' });
    await Page.navigate({ url: process.argv[2] || 'https://naturelensapp.cloud/' });
    await sleep(11000);

    const ev = async (e) => {
      const r = await Runtime.evaluate({ expression: e, returnByValue: true });
      return r.exceptionDetails ? 'ERRO ' + (r.exceptionDetails.exception?.description || '').slice(0, 120) : r.result.value;
    };
    const find = (re) => `(() => {
      const els = [...document.querySelectorAll('[role="button"],[tabindex],button')];
      const el = els.find((e) => ${re}.test(((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim()));
      if (!el) return '';
      const r = el.getBoundingClientRect();
      if (r.width === 0) return '';
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`;
    const tap = async (re) => {
      const p = await ev(find(re));
      if (!p) return false;
      const { x, y } = JSON.parse(p);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    };

    console.log('BUNDLE:', await ev(`[...document.querySelectorAll('script[src]')].map(s=>s.src.split('/').pop()).join(', ')`));

    if (await tap('/pular|skip/i')) await sleep(4500);

    const report = async (nome) => {
      console.log('\n### ' + nome);
      console.log('  scrollers :', await ev(SCROLLERS));
      console.log('  dock      :', await ev(DOCK));
      console.log('  cadeia    :', await ev(CHAIN));
      const before = await ev(`(() => { for (const el of document.querySelectorAll('div')) { const cs=getComputedStyle(el); if (cs.overflowY==='auto' && el.scrollHeight>el.clientHeight+20) return el.scrollTop; } return -1; })()`);
      await GESTURE(Input);
      await sleep(700);
      const after = await ev(`(() => { for (const el of document.querySelectorAll('div')) { const cs=getComputedStyle(el); if (cs.overflowY==='auto' && el.scrollHeight>el.clientHeight+20) return el.scrollTop; } return -1; })()`);
      console.log('  GESTO     : scrollTop ' + before + ' -> ' + after + (after > before ? '  ROLOU' : '  TRAVADO'));
      console.log('  texto     :', String(await ev('document.body.innerText')).replace(/\n/g, ' / ').slice(0, 110));
    };

    await report('HOME');
    if (await tap('/perfil|profile/i')) await sleep(3500);
    await report('PERFIL');
    if (await tap('/ajustes|configura|settings/i')) await sleep(3000);
    await report('AJUSTES');
  } catch (e) {
    console.log('FALHA:', e.message);
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    process.exit(0);
  }
})();
