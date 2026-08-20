// Sonda de scroll: abre o app como CELULAR, mede os scrollers e reporta o que
// esta por cima do conteudo. Temporario.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9910 + Math.floor(Math.random() * 80);
const chromePath = [
  process.env['ProgramFiles'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-sc-'));
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
  const out = (label, v) => console.log('>>', label, typeof v === 'string' ? v : JSON.stringify(v));

  try {
    for (let i = 0; i < 40; i++) {
      try { client = await CDP({ port: PORT }); break; } catch (e) { await sleep(400); }
    }
    if (!client) throw new Error('sem CDP');
    const { Page, Runtime, Emulation, Input } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    await Page.navigate({ url: 'https://naturelensapp.cloud/' });
    await sleep(10000);

    const ev = async (expr) => {
      const { result, exceptionDetails } = await Runtime.evaluate({ expression: expr, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) return 'ERRO: ' + (exceptionDetails.exception?.description || exceptionDetails.text || '').slice(0, 200);
      return result.value;
    };

    out('splash presente?', await ev("!!document.getElementById('nl-splash')"));
    out('filhos do #root', await ev("document.getElementById('root') ? document.getElementById('root').children.length : -1"));

    // o que esta no ponto central da tela (quem recebe o toque)
    out('elemento no centro', await ev(`(() => {
      const el = document.elementFromPoint(195, 400);
      if (!el) return 'nada';
      const cs = getComputedStyle(el);
      return [el.tagName, (el.className||'').toString().slice(0,50), cs.position, 'pe=' + cs.pointerEvents, 'z=' + cs.zIndex].join(' | ');
    })()`));

    // scrollers verticais existentes
    out('scrollers', await ev(`(() => {
      const list = [];
      for (const el of document.querySelectorAll('div')) {
        if (el.scrollHeight > el.clientHeight + 30) {
          const cs = getComputedStyle(el);
          list.push({ h: el.clientHeight, sh: el.scrollHeight, oy: cs.overflowY, ta: cs.touchAction, pos: cs.position });
        }
      }
      return list.slice(0, 6);
    })()`));

    // tenta rolar programaticamente
    out('scroll programatico', await ev(`(() => {
      for (const el of document.querySelectorAll('div')) {
        if (el.scrollHeight > el.clientHeight + 30) {
          const before = el.scrollTop; el.scrollTop += 300;
          return 'moveu ' + (el.scrollTop - before) + 'px';
        }
      }
      return 'nenhum scroller encontrado';
    })()`));

    // tenta rolar por GESTO (o que o dono faz)
    await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x: 195, y: 700 }] });
    await Input.dispatchTouchEvent({ type: 'touchMove', touchPoints: [{ x: 195, y: 400 }] });
    await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
    await sleep(900);
    out('apos gesto de toque', await ev(`(() => {
      for (const el of document.querySelectorAll('div')) {
        if (el.scrollHeight > el.clientHeight + 30) return 'scrollTop=' + el.scrollTop;
      }
      return 'sem scroller';
    })()`));
  } catch (e) {
    console.log('FALHA:', e.message);
  } finally {
    try { client && (await client.close()); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    process.exit(0);
  }
})();
