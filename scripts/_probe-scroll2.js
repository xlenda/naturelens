// Sonda 2: passa do onboarding e testa o scroll na tela real do app.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9950 + Math.floor(Math.random() * 40);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const SCROLLERS = `(() => {
  const l = [];
  for (const el of document.querySelectorAll('div')) {
    if (el.scrollHeight > el.clientHeight + 30) {
      const cs = getComputedStyle(el);
      l.push(cs.overflowY + ' ' + el.clientHeight + '/' + el.scrollHeight);
    }
  }
  return l.slice(0, 5).join(' ; ') || 'nenhum';
})()`;

const TRY_SCROLL = `(() => {
  for (const el of document.querySelectorAll('div')) {
    if (el.scrollHeight > el.clientHeight + 30) {
      const b = el.scrollTop;
      el.scrollTop += 300;
      if (el.scrollTop !== b) return 'MOVEU ' + (el.scrollTop - b) + 'px';
    }
  }
  return 'TRAVADO';
})()`;

const FIND = (re) => `(() => {
  const els = [...document.querySelectorAll('[role="button"],[tabindex],button')];
  const el = els.find((e) => ${re}.test(((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || ''))));
  if (!el) return '';
  const r = el.getBoundingClientRect();
  return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
})()`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-s2-'));
  const chrome = spawn(
    chromePath,
    [`--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=390,844'],
    { stdio: 'ignore' }
  );
  let client;
  try {
    for (let i = 0; i < 40; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    const { Page, Runtime, Emulation, Input } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(9000);

    const ev = async (e) => (await Runtime.evaluate({ expression: e, returnByValue: true })).result.value;
    const tap = async (posJson) => {
      if (!posJson) return false;
      const { x, y } = JSON.parse(posJson);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      return true;
    };

    console.log('1) ONBOARDING  |', String(await ev('document.body.innerText')).replace(/\n/g, ' / ').slice(0, 90));
    console.log('   scrollers:', await ev(SCROLLERS), '| scroll:', await ev(TRY_SCROLL));

    if (await tap(await ev(FIND('/pular|skip/i')))) await sleep(4000);
    console.log('2) APP         |', String(await ev('document.body.innerText')).replace(/\n/g, ' / ').slice(0, 90));
    console.log('   scrollers:', await ev(SCROLLERS), '| scroll:', await ev(TRY_SCROLL));

    // vai pra Curiosidades (tela longa)
    if (await tap(await ev(FIND('/curiosidades|discover/i')))) await sleep(3000);
    console.log('3) DESCOBRIR   |', String(await ev('document.body.innerText')).replace(/\n/g, ' / ').slice(0, 90));
    console.log('   scrollers:', await ev(SCROLLERS), '| scroll:', await ev(TRY_SCROLL));
  } catch (e) {
    console.log('FALHA:', e.message);
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    process.exit(0);
  }
})();
