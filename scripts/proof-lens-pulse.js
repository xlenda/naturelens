// Prova manual automatizada do gesto Pulso Vivo em Chrome real. Injeta uma
// imagem no seletor do navegador, segura o CTA por mais de 820 ms e verifica
// que o browser nao selecionou texto e que o consentimento abriu antes do
// upload. O e2e-render chama esta prova depois de validar a montagem geral.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CDP = require('chrome-remote-interface');

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const photo = path.resolve(process.argv[3] || path.join(__dirname, '..', 'assets', 'topics', 'watering.jpg'));
const port = 9500 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function browserPath() {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function main() {
  const executable = browserPath();
  if (!executable) {
    console.log('SKIP Pulso Vivo: Chrome ou Edge nao encontrado');
    return;
  }
  if (!fs.existsSync(photo)) throw new Error(`Foto de prova ausente: ${photo}`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'naturelens-pulse-'));
  const browser = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=390,844',
    '--lang=pt-BR',
  ], { stdio: 'ignore' });

  let client;
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        client = await CDP({ port });
        break;
      } catch (error) {
        await sleep(300);
      }
    }
    if (!client) throw new Error('Chrome nao abriu a porta de depuracao');

    const { DOM, Emulation, Input, Page, Runtime } = client;
    await Promise.all([DOM.enable(), Page.enable(), Runtime.enable()]);
    await Emulation.setDeviceMetricsOverride({
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await Emulation.setLocaleOverride({ locale: 'pt-BR' });
    await Page.setInterceptFileChooserDialog({ enabled: true });

    const evaluate = async (expression) => {
      const { result } = await Runtime.evaluate({
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.value;
    };
    const waitForValue = async (expression, budgetMs = 10000) => {
      const deadline = Date.now() + budgetMs;
      let value = null;
      do {
        value = await evaluate(expression);
        if (value) return value;
        await sleep(250);
      } while (Date.now() < deadline);
      return value;
    };
    const clickMatching = async (pattern) => {
      const rawPoint = await evaluate(`(() => {
      const matcher = new RegExp(${JSON.stringify(pattern)}, 'i');
      const nodes = [...document.querySelectorAll('[role="button"],[role="radio"],button,[tabindex]')];
      const node = nodes.find((item) => {
        const label = (item.getAttribute('aria-label') || '').trim();
        return matcher.test(label) || matcher.test(label + ' ' + (item.textContent || ''));
      });
      if (!node) return null;
      node.scrollIntoView({ block: 'center' });
      const rect = node.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    })()`);
      if (!rawPoint) return false;
      const point = JSON.parse(rawPoint);
      await Input.dispatchMouseEvent({ type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      return true;
    };

    await Page.navigate({ url });
    await Page.loadEventFired();
    // O onboarding ja possui prova propria no e2e-render. Esta sonda isola o
    // gesto e entra no app por armazenamento, sem depender do texto de slides
    // nem gastar o orcamento do seletor percorrendo outra jornada.
    await evaluate(`(() => {
      localStorage.setItem('@naturelens_onboarding_seen', 'true');
      localStorage.setItem('@textmarker_language', 'pt');
    })()`);
    await Page.navigate({ url });
    await Page.loadEventFired();

    const uploadReady = await waitForValue(`(() => [...document.querySelectorAll('[role="button"],button')]
      .some((node) => /^(Enviar foto para identificar|Upload photo to identify)$/i
        .test((node.getAttribute('aria-label') || '').trim())))()`, 25000);
    if (!uploadReady) throw new Error(`CTA de upload nao montou: ${(await evaluate('document.body.innerText')).slice(0, 500)}`);

    // O palco tambem contem "Tirar foto" e abre um input com capture=camera.
    // A prova precisa do CTA explicito de upload; casar o aria-label exato
    // impede que a ordem visual escolha o seletor errado.
    const chooserPromise = new Promise((resolve) => Page.fileChooserOpened(resolve));
    const photoButton = await clickMatching('^(Enviar foto para identificar|Upload photo to identify)$');
    if (!photoButton) throw new Error(`CTA de foto nao encontrado: ${(await evaluate('document.body.innerText')).slice(0, 500)}`);
    const chooser = await Promise.race([
      chooserPromise,
      sleep(5000).then(() => null),
    ]);
    if (!chooser?.backendNodeId) throw new Error('Seletor de arquivo nao abriu apos o CTA de upload');
    await DOM.setFileInputFiles({ files: [photo], backendNodeId: chooser.backendNodeId });

    const targetExpression = `(() => {
      const nodes = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
      const node = nodes.find((item) => /Segure para revelar|Hold to reveal/i.test(
        (item.getAttribute('aria-label') || '') + ' ' + (item.textContent || '')
      ));
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      window.getSelection()?.removeAllRanges();
      return JSON.stringify({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        userSelect: style.userSelect,
        webkitUserSelect: style.webkitUserSelect,
        touchAction: style.touchAction,
      });
    })()`;
    // ImageManipulator e a leitura base64 terminam de forma assincrona. Um
    // sleep fixo de 1,6 s falhava sob carga mesmo quando a foto era aceita;
    // a condicao real e o Pulso montado, com limite curto e diagnostico abaixo.
    const rawTarget = await waitForValue(targetExpression, 10000);
    if (!rawTarget) {
      const state = await evaluate(`JSON.stringify({
        text: (document.body.innerText || '').slice(0, 900),
        buttons: [...document.querySelectorAll('[role="button"],button,[tabindex]')]
          .map((node) => (node.getAttribute('aria-label') || '') + ' :: ' + (node.textContent || ''))
          .slice(0, 30)
      })`);
      throw new Error(`Pulso Vivo nao apareceu depois da foto: ${state}`);
    }
    const target = JSON.parse(rawTarget);

    // Emula o caso mais hostil do celular: o browser tenta abrir contextmenu
    // durante o toque. RN Web so conserva o responder se onLongPress existir;
    // CSS sozinho evita selecao, mas nao evita essa terminacao.
    await Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 1 });
    const touch = { x: target.x, y: target.y, radiusX: 2, radiusY: 2, force: 1, id: 1 };
    await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [touch] });
    await sleep(240);
    const contextDefaultPrevented = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll('[role="button"],button,[tabindex]')];
      const node = nodes.find((item) => /Segure para revelar|Continue segurando|Hold to reveal|Keep holding/i.test(
        (item.getAttribute('aria-label') || '') + ' ' + (item.textContent || '')
      ));
      if (!node) return false;
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    })()`);
    await sleep(900);
    const whileHeld = JSON.parse(await evaluate(`JSON.stringify({
      selection: window.getSelection()?.toString() || '',
      consent: /Antes de enviar suas fotos|Before sending your photos/i.test(document.body.innerText || '')
    })`));
    await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });

    console.log(JSON.stringify({ target, contextDefaultPrevented, whileHeld }, null, 2));
    if (target.userSelect !== 'none' || target.touchAction !== 'none') {
      throw new Error('CSS do gesto nao bloqueou selecao/rolagem na superficie');
    }
    if (!contextDefaultPrevented) throw new Error('Menu de contexto nao foi bloqueado');
    if (whileHeld.selection) throw new Error(`Browser selecionou texto: ${whileHeld.selection}`);
    if (!whileHeld.consent) throw new Error('Consentimento nao abriu apos gesto touch sustentado');
    console.log('PASS Pulso Vivo: gesto completou sem selecionar texto');
  } finally {
    try { await client?.close(); } catch (error) {}
    browser.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (error) {}
  }
}

main().catch((error) => {
  console.error(`FAIL Pulso Vivo: ${error.message}`);
  process.exit(1);
});
