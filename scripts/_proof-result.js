// Prova do hub do resultado: perfil limpo em pt-BR, upload de uma foto real
// pelo obturador (file chooser interceptado via CDP), screenshots do resultado
// novo e do manual de abas. Temporário.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9400 + Math.floor(Math.random() * 300);
const OUT = process.argv[2];
const PHOTO = process.argv[3];

const CANDIDATES = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = CANDIDATES.find((p) => p && fs.existsSync(p));

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-hub-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--window-size=390,900',
      '--hide-scrollbars',
      '--lang=pt-BR',
    ],
    { stdio: 'ignore' }
  );

  let client;
  const shot = async (Page, name) => {
    const { data } = await Page.captureScreenshot({ format: 'jpeg', quality: 80 });
    fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(data, 'base64'));
    console.log('shot', name);
  };
  const clickByText = async (Runtime, Input, needle) => {
    const expr = `(() => {
      const n = ${JSON.stringify(needle)}.toLowerCase();
      const els = [...document.querySelectorAll('[role="button"],[role="tab"],button,[tabindex]')];
      const el = els.find(e => (e.getAttribute('aria-label')||'').toLowerCase().includes(n)
        || (e.textContent||'').toLowerCase().includes(n));
      if (!el) return 'NOT';
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`;
    const { result } = await Runtime.evaluate({ expression: expr, returnByValue: true });
    if (result.value === 'NOT') { console.log('nao achei:', needle); return false; }
    const { x, y } = JSON.parse(result.value);
    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return true;
  };
  const scrollBy = async (Runtime, px) => {
    await Runtime.evaluate({
      expression: `(() => { const s=[...document.querySelectorAll('div')].filter(d=>d.scrollHeight>d.clientHeight+50).sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]; if(s) s.scrollTop += ${px}; })()`,
    });
  };

  try {
    for (let i = 0; i < 30; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    const { Page, Runtime, Input, DOM, Emulation } = client;
    await Promise.all([Page.enable(), Runtime.enable(), DOM.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
    await Emulation.setLocaleOverride({ locale: 'pt-BR' });

    // intercepta o file chooser: quando o obturador abrir o input, injeta a foto
    await Page.setInterceptFileChooserDialog({ enabled: true });
    Page.on('fileChooserOpened', async (ev) => {
      try {
        await DOM.setFileInputFiles({ files: [PHOTO], backendNodeId: ev.backendNodeId });
        console.log('foto injetada no chooser');
      } catch (e) {
        console.log('chooser err', e.message);
      }
    });

    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(6500);

    // pular onboarding
    if (!(await clickByText(Runtime, Input, 'pular'))) await clickByText(Runtime, Input, 'skip');
    await sleep(2500);

    // obturador
    if (!(await clickByText(Runtime, Input, "enviar foto para i"))) await clickByText(Runtime, Input, "tirar foto para");
    await sleep(1200);
    // aguarda identificacao + traducao
    await sleep(16000);
    // fecha os modais de celebracao (Voce sabia? -> conquista) ate sobrar a tela
    for (let i = 0; i < 3; i++) {
      const closed = await clickByText(Runtime, Input, 'continuar');
      if (!closed) break;
      await sleep(1400);
    }
    await sleep(1500);
    await shot(Page, 'r1-resultado-topo');

    await scrollBy(Runtime, 700);
    await sleep(1200);
    await shot(Page, 'r2-resultado-meio');

    await scrollBy(Runtime, 700);
    await sleep(1200);
    await shot(Page, 'r3-resultado-fim');

    // abre o manual pelas portas: tenta um card de fatos rapidos / porta
    const opened =
      (await clickByText(Runtime, Input, 'guia de rega')) ||
      (await clickByText(Runtime, Input, 'rega')) ||
      (await clickByText(Runtime, Input, 'luz'));
    if (opened) {
      await sleep(1800);
      await shot(Page, 'r4-manual-abas');
      await clickByText(Runtime, Input, 'solo');
      await sleep(1000);
      await shot(Page, 'r5-manual-aba2');
    }
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
  }
})();
