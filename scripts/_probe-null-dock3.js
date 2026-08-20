// Identifica QUEM é o ancestral com min-height:100% que estoura a cena.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9500 + Math.floor(Math.random() * 80);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const ID = `(() => {
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
    out.push(i + ') h=' + n.clientHeight + ' minh=' + c.minHeight + ' flex=' + c.flexGrow +
      ' pos=' + c.position + ' dsp=' + c.display +
      ' cls=[' + (n.className||'') + ']' +
      ' attrs=' + JSON.stringify([...n.attributes].filter(a=>a.name!=='class'&&a.name!=='style').map(a=>a.name+'='+a.value).join(',')).slice(0,90));
    n = n.parentElement;
  }
  return out.join('\\n');
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-n3-'));
  const chrome = spawn(chromePath, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=390,844'], { stdio: 'ignore' });
  let client;
  try {
    for (let i = 0; i < 40; i++) { try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); } }
    const { Page, Runtime, Emulation, Input } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 5 });
    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(11000);
    const ev = async (e) => (await Runtime.evaluate({ expression: e, returnByValue: true })).result.value;
    const tap = async (re) => {
      const pos = await ev(CLICK(re)); if (!pos) return false;
      const { x, y } = JSON.parse(pos);
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(3500); return true;
    };
    await tap('/pular|skip|come|start/i'); await sleep(1500);
    console.log('=== HOME (dock visivel) ==='); console.log(await ev(ID));
    await tap('/perfil|profile/i');
    await tap('/ajustes|configura|settings/i');
    console.log('=== AJUSTES (dock null) ==='); console.log(await ev(ID));
  } catch (e) { console.log('FALHA:', e.message); }
  finally { try { await client.close(); } catch (e) {} chrome.kill(); }
})();
