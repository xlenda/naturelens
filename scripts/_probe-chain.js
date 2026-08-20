// Mede a CADEIA DE ANCESTRAIS do scroller principal para achar quem limita a
// altura (metodo que resolveu o mesmo bug no Cosmic Guide). Temporario.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9960 + Math.floor(Math.random() * 30);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const CHAIN = `(() => {
  let el = [...document.querySelectorAll('div')].find(
    (e) => getComputedStyle(e).overflowY === 'hidden' && e.scrollHeight > e.clientHeight + 30
  );
  if (!el) return 'sem scroller';
  const out = [];
  let n = el;
  for (let i = 0; n && n !== document.documentElement && i < 10; i++) {
    const cs = getComputedStyle(n);
    out.push(
      i + ') ' + n.tagName +
      ' h=' + n.clientHeight +
      ' sh=' + n.scrollHeight +
      ' oy=' + cs.overflowY +
      ' flex=' + cs.flexGrow + '/' + cs.flexShrink + '/' + cs.flexBasis +
      ' pos=' + cs.position +
      ' height=' + cs.height +
      ' cls=' + (n.className || '').toString().slice(0, 34)
    );
    n = n.parentElement;
  }
  return out.join('\\n');
})()`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-ch-'));
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

    // pula onboarding
    const find = `(() => {
      const els = [...document.querySelectorAll('[role="button"],[tabindex]')];
      const el = els.find((e) => /pular|skip/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')));
      if (!el) return '';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`;
    const pos = await ev(find);
    if (pos) {
      const { x, y } = JSON.parse(pos);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(4000);
    }

    console.log('=== CADEIA DE ANCESTRAIS DO SCROLLER ===');
    console.log(await ev(CHAIN));
    console.log('=== dock presente? ===');
    console.log(await ev(`(() => {
      const els = [...document.querySelectorAll('div')].filter((e) => /Plantas|Cole/.test(e.textContent || '') && e.clientHeight < 200 && e.clientHeight > 40);
      return els.length ? 'dock h=' + els[els.length - 1].clientHeight + ' pos=' + getComputedStyle(els[els.length - 1]).position : 'sem dock visivel';
    })()`));
  } catch (e) {
    console.log('FALHA:', e.message);
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    process.exit(0);
  }
})();
