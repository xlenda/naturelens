// Capturas reproduziveis do payoff principal da ficha Play: resultado, registro
// e diario reais, navegados pela propria UI a partir de um exemplar local. Nao chama o
// identificador, nao consome credito e mantem a foto de demonstracao local; a
// tela ainda pode buscar a referencia publica pela cadeia normal do app.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const CDP = require('chrome-remote-interface');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.argv[2] || 'http://localhost:4180';
const OUTPUT_ROOT = process.argv[3]
  || path.join(ROOT, 'store-assets', 'screenshots-ready');
const LANGUAGE = String(process.argv[4] || 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt';
const CAPTURE_COMPARISON = process.argv.includes('--comparison');
const STORE_LOCALE = LANGUAGE === 'en' ? 'en-US' : 'pt-BR';
const OUTPUT_DIR = path.join(OUTPUT_ROOT, STORE_LOCALE);
const PORT = 9700 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const COPY = {
  pt: {
    collection: ['Coleção'],
    discover: ['Curiosidades'],
    entry: ['Monstera da sala', 'Costela-de-adão'],
    observation: 'Minha observação',
    timeline: 'Linha do tempo',
    guide: ['Abrir guia', 'Guia da espécie'],
    name: 'Costela-de-adão',
    nickname: 'Monstera da sala',
    toxicity: 'Tóxica se ingerida. Pode causar irritação na boca, nos lábios e na língua.',
    note: 'Uma folha nova começou a abrir esta semana.',
    compare: 'Comparar fotos',
    sideBySide: 'Lado a lado',
  },
  en: {
    collection: ['Collection'],
    discover: ['Fun Facts'],
    entry: ['Living-room Monstera', 'Monstera'],
    observation: 'My observation',
    timeline: 'Timeline',
    guide: ['Open guide', 'Species guide'],
    name: 'Monstera',
    nickname: 'Living-room Monstera',
    toxicity: 'Toxic if swallowed. May irritate the mouth, lips, and tongue.',
    note: 'A new leaf started to unfurl this week.',
    compare: 'Compare photos',
    sideBySide: 'Side by side',
  },
}[LANGUAGE];

const chromeCandidates = [
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chromePath) throw new Error('Google Chrome nao encontrado.');

async function demoPhotoDataUri() {
  // A mesma foto real que ja aparece no Meu Registro. O recorte evita inventar
  // uma tela ou baixar uma imagem nova apenas para marketing.
  const source = path.join(ROOT, 'store-assets', 'screenshots', '07-specimen-top.png');
  const jpeg = await sharp(source)
    .extract({ left: 104, top: 211, width: 325, height: 325 })
    .resize(900, 900)
    .jpeg({ quality: 88 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

function demoEntry(photoUri) {
  // Fixture editorial conservador, reconstruido do registro real que originou
  // 07-specimen-top.png. Nao simula resposta do classificador: por isso nao ha
  // confidence, overview, luz, solo ou qualquer outro fato nao comprovado pela
  // captura de origem. O aviso corrige a antiga frase contraditoria usando a
  // propria fonte agronomica versionada em docs/agronomia/grupos/.
  return {
    savedId: 'play-demo-monstera',
    id: 'play-demo-monstera',
    category: 'plant',
    name: COPY.name,
    nickname: COPY.nickname,
    scientific: 'Monstera deliciosa',
    photoUri,
    savedAt: '2026-08-20T18:00:00.000Z',
    updatedAt: '2026-08-20T18:30:00.000Z',
    // `Medium` e o valor cru que produziu a tarefa "checar a terra hoje" na
    // captura de origem; ele mantem o fluxo de cuidado sem inventar prazo.
    water: 'Medium',
    toxicity: COPY.toxicity,
    room: 'Living Room',
    specimenNote: COPY.note,
    specimenNoteUpdatedAt: '2026-08-20T18:30:00.000Z',
  };
}

async function clickByText(Runtime, Input, needle) {
  const expression = `(() => {
    const wanted = ${JSON.stringify(needle)}.toLocaleLowerCase('pt-BR');
    const semantic = [...document.querySelectorAll('[role="button"],[role="tab"],button')];
    const focusable = [...document.querySelectorAll('[tabindex]')]
      .filter((item) => Number(item.getAttribute('tabindex')) >= 0);
    const nodes = [...semantic, ...focusable.filter((item) => !semantic.includes(item))];
    const node = nodes.find((item) =>
      (item.getAttribute('aria-label') || '').toLocaleLowerCase('pt-BR').includes(wanted)
      || (item.textContent || '').toLocaleLowerCase('pt-BR').includes(wanted)
    );
    if (!node) return null;
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = node.getBoundingClientRect();
    node.click();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  const point = result.value;
  if (!point) return false;
  // `click()` above is the reliable path for react-native-web in headless mode;
  // dispatching a second pointer click here could activate the next screen.
  return true;
}

async function waitForClick(Runtime, Input, needles, attempts = 15) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const needle of needles) {
      if (await clickByText(Runtime, Input, needle)) return true;
    }
    await sleep(300);
  }
  return false;
}

async function waitForText(Runtime, needles, attempts = 20) {
  const wanted = Array.isArray(needles) ? needles : [needles];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const text = (document.body?.innerText || '').toLocaleLowerCase(${JSON.stringify(STORE_LOCALE)});
        return ${JSON.stringify(wanted)}.some((needle) =>
          text.includes(String(needle).toLocaleLowerCase(${JSON.stringify(STORE_LOCALE)}))
        );
      })()`,
      returnByValue: true,
    });
    if (result.value) return true;
    await sleep(250);
  }
  return false;
}

async function settleVisual(Runtime) {
  await Runtime.evaluate({
    expression: `(async () => {
      document.documentElement.style.backgroundColor = '#070B09';
      document.body.style.backgroundColor = '#070B09';
      if (document.fonts?.ready) await document.fonts.ready;
      const pending = [...document.images]
        .filter((item) => !item.complete)
        .map((item) => new Promise((resolve) => {
          item.addEventListener('load', resolve, { once: true });
          item.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 2500);
        }));
      await Promise.all(pending);
      return true;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(350);
}

async function resetScroll(Runtime) {
  await Runtime.evaluate({
    expression: `(() => {
      const nodes = [...document.querySelectorAll('div')];
      nodes.forEach((node) => { if (node.scrollWidth > node.clientWidth) node.scrollLeft = 0; });
      window.scrollTo(0, 0);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      const scroller = nodes
        .filter((node) => node.scrollHeight > node.clientHeight + 80)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (scroller) scroller.scrollTop = 0;
    })()`,
  });
}

async function scrollToText(Runtime, needle) {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const wanted = ${JSON.stringify(needle)}.toLocaleLowerCase(${JSON.stringify(STORE_LOCALE)});
      const nodes = [...document.querySelectorAll('[role="header"],h1,h2,h3')];
      const node = nodes.find((item) =>
        (item.textContent || '').toLocaleLowerCase(${JSON.stringify(STORE_LOCALE)}).includes(wanted)
      );
      if (!node) return false;

      let scroller = node.parentElement;
      while (scroller && scroller !== document.body) {
        const overflowY = getComputedStyle(scroller).overflowY;
        if (/(auto|scroll)/.test(overflowY) && scroller.scrollHeight > scroller.clientHeight + 8) break;
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller === document.body) {
        scroller = [...document.querySelectorAll('div')]
          .filter((item) => item.scrollHeight > item.clientHeight + 80)
          .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      }
      if (!scroller) return false;

      const nodeTop = node.getBoundingClientRect().top;
      const scrollerTop = scroller.getBoundingClientRect().top;
      // 20 px deixa o titulo respirando logo abaixo do TopBar, sem revelar um
      // fragmento do card anterior na captura editorial do diario.
      scroller.scrollTop = Math.max(0, scroller.scrollTop + nodeTop - scrollerTop - 20);
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      return true;
    })()`,
    returnByValue: true,
  });
  return result.value === true;
}

async function captureReady(Page, Runtime, fileName) {
  const { result: scrollResult } = await Runtime.evaluate({
    expression: 'window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0',
    returnByValue: true,
  });
  if (scrollResult.value !== 0) {
    throw new Error(`Documento deslocado ${scrollResult.value}px antes de capturar ${fileName}.`);
  }
  // O Chrome headless pode manter uma largura de surface maior que a viewport
  // em emulacao mobile. Recorta pelas coordenadas CSS do aparelho para nunca
  // levar a area branca lateral para a ficha.
  const { data } = await Page.captureScreenshot({
    format: 'png',
    fromSurface: true,
    clip: { x: 0, y: 0, width: 390, height: 694, scale: 3 },
  });
  const output = path.join(OUTPUT_DIR, fileName);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await sharp(Buffer.from(data, 'base64'))
    .resize(1080, 1920, { fit: 'fill' })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(output);
  console.log(`Captura Play pronta (${STORE_LOCALE}): ${output}`);
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'naturelens-play-result-'));
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    '--window-size=390,694',
    '--lang=pt-BR',
  ], { stdio: 'ignore' });

  let client;
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        client = await CDP({ port: PORT });
        break;
      } catch {
        await sleep(300);
      }
    }
    if (!client) throw new Error('Chrome nao abriu a porta de depuracao.');

    const { Page, Runtime, Input, Emulation, Network } = client;
    await Promise.all([Page.enable(), Runtime.enable(), Network.enable()]);
    await Emulation.setDeviceMetricsOverride({
      width: 390,
      height: 694,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await Emulation.setLocaleOverride({ locale: STORE_LOCALE });

    await Page.navigate({ url: BASE_URL });
    await sleep(1800);
    const entry = demoEntry(await demoPhotoDataUri());
    await Runtime.evaluate({
      expression: `(() => {
        localStorage.clear();
        localStorage.setItem('@naturelens_onboarding_seen', 'true');
        localStorage.setItem('@textmarker_language', ${JSON.stringify(LANGUAGE)});
        localStorage.setItem('@plantid_collection', ${JSON.stringify(JSON.stringify([entry]))});
      })()`,
    });
    await Page.reload({ ignoreCache: true });
    await sleep(3000);

    await resetScroll(Runtime);
    await settleVisual(Runtime);
    await captureReady(Page, Runtime, '01-identificar.png');

    if (!(await waitForClick(Runtime, Input, COPY.discover))) {
      throw new Error(`Aba de descoberta nao encontrada em ${STORE_LOCALE}.`);
    }
    await sleep(900);
    await resetScroll(Runtime);
    await settleVisual(Runtime);
    await captureReady(Page, Runtime, '04-descobrir.png');

    // Daqui em diante todas as imagens da peca sao locais. Bloquear Wikipedia
    // impede a ficha de variar entre uma foto unica e um mosaico conforme rede,
    // cache ou disponibilidade editorial da pagina naquele instante.
    await Network.setBlockedURLs({
      urls: ['*://*.wikipedia.org/*', '*://*.wikimedia.org/*'],
    });

    if (!(await waitForClick(Runtime, Input, COPY.collection))) {
      throw new Error('Aba Colecao nao encontrada.');
    }
    await sleep(1000);
    if (!(await waitForClick(Runtime, Input, COPY.entry))) {
      throw new Error('Exemplar demo nao encontrado.');
    }
    await sleep(1800);

    await resetScroll(Runtime);
    if (!(await waitForText(Runtime, COPY.entry))) throw new Error('Meu Registro nao estabilizou.');
    await settleVisual(Runtime);
    await captureReady(Page, Runtime, '03-meu-registro.png');

    if (!(await waitForText(Runtime, COPY.timeline))) {
      throw new Error(`Secao ${COPY.timeline} nao encontrada.`);
    }
    if (!(await scrollToText(Runtime, COPY.observation))) {
      throw new Error(`Secao ${COPY.observation} nao encontrada.`);
    }
    await settleVisual(Runtime);
    await captureReady(Page, Runtime, '05-diario.png');

    if (!(await waitForClick(Runtime, Input, COPY.guide))) {
      const { result } = await Runtime.evaluate({ expression: 'document.body.innerText', returnByValue: true });
      throw new Error(`Botao Abrir guia nao encontrado. Tela: ${String(result.value).slice(0, 800)}`);
    }
    await sleep(1800);

    // A navegação pode herdar uma posição profunda do scroll anterior em builds
    // web. Zera a maior região rolável para a peça sempre começar no hero.
    await resetScroll(Runtime);
    await settleVisual(Runtime);
    await captureReady(Page, Runtime, '02-resultado.png');

    if (CAPTURE_COMPARISON) {
      if (!(await waitForClick(Runtime, Input, [COPY.compare]))) {
        throw new Error(`Comparador de fotos nao encontrado em ${STORE_LOCALE}.`);
      }
      if (!(await waitForText(Runtime, COPY.sideBySide))) {
        throw new Error(`Modo lado a lado nao abriu em ${STORE_LOCALE}.`);
      }
      await settleVisual(Runtime);
      await captureReady(Page, Runtime, '06-comparacao.png');
    }
  } finally {
    try { if (client) await client.close(); } catch {}
    try { chrome.kill(); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
