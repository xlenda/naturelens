// Sonda: por que nenhuma tela rola? Abre o app como TOUCH (mobile), mede o
// scroller principal e tenta rolar de verdade. Temporario.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9900 + Math.floor(Math.random() * 90);
const CANDIDATES = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = CANDIDATES.find((p) => p && fs.existsSync(p));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-scroll-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${dir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--window-size=390,844',
    ],
    { stdio: 'ignore' }
  );

  let client;
  try {
    for (let i = 0; i < 30; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    const { Page, Runtime, Emulation, Input } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await Emulation.setEmitTouchEventsForMouse({ enabled: true, configuration: 'mobile' });

    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(9000);

    // pula onboarding
    const skip = `(() => {
      const els=[...document.querySelectorAll('[role="button"],[tabindex]')];
      const el=els.find(e=>/pular|skip/i.test((e.getAttribute('aria-label')||'')+(e.textContent||'')));
      if(!el) return 'sem skip';
      const r=el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});
    })()`;
    const { result: sk } = await Runtime.evaluate({ expression: skip, returnByValue: true });
    if (sk.value !== 'sem skip') {
      const { x, y } = JSON.parse(sk.value);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(3000);
    }

    const probe = `(() => {
      const out = { scrollers: [] };
      const all = [...document.querySelectorAll('div')];
      for (const el of all) {
        if (el.scrollHeight > el.clientHeight + 40) {
          const cs = getComputedStyle(el);
          out.scrollers.push({
            cls: (el.className||'').toString().slice(0,40),
            h: el.clientHeight, sh: el.scrollHeight,
            overflowY: cs.overflowY, touchAction: cs.touchAction,
            pos: cs.position,
          });
        }
      }
      out.bodyOverflow = getComputedStyle(document.body).overflowY;
      out.htmlOverflow = getComputedStyle(document.documentElement).overflowY;
      out.bodyTouch = getComputedStyle(document.body).touchAction;
      // tenta rolar o maior scroller
      const main = out.scrollers.sort((a,b)=>b.sh-a.sh)[0];
      const el = all.find(e => e.scrollHeight > e.clientHeight + 40);
      if (el) { const b = el.scrollTop; el.scrollTop += 400; out.moveu = el.scrollTop - b; }
      return JSON.stringify(out).slice(0, 900);
    })()`;
    const { result } = await Runtime.evaluate({ expression: probe, returnByValue: true });
    console.log(result.value);
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
  }
})();
