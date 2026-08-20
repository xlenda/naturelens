// Sonda: por que o manual profundo nao renderiza? Abre o site, executa o
// MESMO fetch que components/manualContent.js faz e reporta o resultado, mais
// os erros de console. Temporario.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9800 + Math.floor(Math.random() * 150);
const CANDIDATES = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = CANDIDATES.find((p) => p && fs.existsSync(p));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-probe-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${dir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--window-size=390,900',
    ],
    { stdio: 'ignore' }
  );

  let client;
  try {
    for (let i = 0; i < 30; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    const { Page, Runtime, Log } = client;
    await Promise.all([Page.enable(), Runtime.enable(), Log.enable()]);
    Runtime.consoleAPICalled(({ type, args }) => {
      const txt = args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (/manual|locale|404|error/i.test(txt)) console.log('[console]', type, txt.slice(0, 160));
    });
    Runtime.exceptionThrown(({ exceptionDetails }) => {
      console.log('[exception]', (exceptionDetails.exception?.description || exceptionDetails.text || '').slice(0, 200));
    });

    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(8000);

    const probe = `(async () => {
      const out = {};
      try {
        const r = await fetch('/locales/pt-manual.json');
        out.status = r.status;
        const j = await r.json();
        out.topics = Object.keys(j);
        out.wateringAdvice = (j.watering && j.watering.advice || []).length;
      } catch (e) { out.err = String(e); }
      // o bundle publicado contem o texto do manual e a chave de secao?
      const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src).filter(s => s.includes('AppEntry'));
      if (scripts[0]) {
        const code = await (await fetch(scripts[0])).text();
        out.bundleTemManualJson = code.includes('-manual.json');
        out.bundleTemFundamentals = code.includes('detail.fundamentals');
        out.bundleTemAboutSpecies = code.includes('detail.aboutSpecies');
        out.bundleTemGroupContent = code.includes('-groups.json');
      }
      return JSON.stringify(out);
    })()`;
    const { result } = await Runtime.evaluate({ expression: probe, awaitPromise: true, returnByValue: true });
    console.log('[fetch de dentro do app]', result.value);
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
  }
})();
