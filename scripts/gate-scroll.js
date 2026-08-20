// Portao de SCROLL POR TOQUE.
//
// POR QUE EXISTE (2026-08-20): o dono relatou tres vezes "nenhuma tela, ta
// travado, nao consigo ir pra baixo" e as tres vezes uma sonda automatica
// respondeu "rola normal". A sonda estava usando `element.scrollTop = N`, que
// funciona mesmo quando a area NAO e rolavel - o dedo nao rola, o script rola.
// Foram dois diagnosticos errados (splash, altura do dock) antes da causa
// real: sem um irmao flex ocupando espaco, a cena do navigator cresce ate a
// altura do conteudo dentro de uma caixa com overflow:hidden, e o ScrollView
// nunca fica menor que o proprio conteudo. Nada rola, e nada acusa.
//
// Este portao dispara TOQUE de verdade (Input.dispatchTouchEvent) e mede o
// scrollTop antes e depois. Cobre as duas familias de rota:
//   HOME    - dock visivel
//   AJUSTES - dock escondido (HIDE_DOCK_ON), a rota mais barata de alcancar
//             das 24 que escondem a barra: dois toques, sem foto, sem API.
//
// Usage:  node scripts/gate-scroll.js [url]
// Exit 1 se alguma rota nao rolar ao toque.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CDP = require('chrome-remote-interface');

const URL_ALVO = process.argv[2] || 'https://naturelensapp.cloud/';
const PORT = 9333;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findChrome = () => CHROME_CANDIDATES.find((p) => fs.existsSync(p)) || null;

// O scroller REAL da tela: o unico elemento que se declara rolavel E tem
// conteudo sobrando. Se nao existe nenhum, a tela ja esta quebrada antes do
// toque - e esse e exatamente o estado que passou despercebido.
const ACHAR_SCROLLER = `(() => {
  for (const el of document.querySelectorAll('div')) {
    const c = getComputedStyle(el);
    if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 30) {
      return { achou: true, top: el.scrollTop, altura: el.clientHeight, conteudo: el.scrollHeight };
    }
  }
  return { achou: false };
})()`;

async function avaliar(Runtime, expressao) {
  const { result } = await Runtime.evaluate({ expression: expressao, returnByValue: true });
  return result.value;
}

// Um arrasto de verdade, com pontos intermediarios: um touchStart seguido de
// um unico touchEnd nao rola nada em lugar nenhum.
async function arrastar(Input, deY, ateY) {
  const x = 195;
  await Input.dispatchTouchEvent({
    type: 'touchStart',
    touchPoints: [{ x, y: deY }],
  });
  for (let y = deY; y >= ateY; y -= 25) {
    await Input.dispatchTouchEvent({ type: 'touchMove', touchPoints: [{ x, y }] });
    await sleep(16);
  }
  await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
  await sleep(800); // momentum
}

async function medirRota(Runtime, Input, nome) {
  const antes = await avaliar(Runtime, ACHAR_SCROLLER);
  if (!antes.achou) {
    return { nome, ok: false, motivo: 'nenhuma area rolavel na tela (a cena cresceu junto com o conteudo)' };
  }
  await arrastar(Input, 700, 300);
  const depois = await avaliar(Runtime, ACHAR_SCROLLER);
  const andou = (depois.top || 0) - (antes.top || 0);
  return {
    nome,
    ok: andou > 20,
    motivo: andou > 20 ? `rolou ${Math.round(andou)}px` : `o dedo nao moveu a tela (scrollTop ${antes.top} -> ${depois.top})`,
    altura: antes.altura,
    conteudo: antes.conteudo,
  };
}

// Toca no primeiro controle que casa. Olha o TEXTO e tambem o aria-label: a
// entrada de Ajustes e um icone de engrenagem sem texto nenhum, e foi por isso
// que a primeira versao deste portao nunca chegou na rota sem dock - a unica
// que o fix precisava provar. Portao que nao alcanca o alvo nao vale nada.
async function tocarEm(Runtime, Input, regex) {
  const caixa = await avaliar(
    Runtime,
    `(() => {
      const casa = (e) => {
        const t = (e.textContent || '').trim();
        const rotulo = e.getAttribute('aria-label') || '';
        return (${regex}.test(rotulo) && rotulo.length < 30)
            || (${regex}.test(t) && t.length < 30);
      };
      const alvos = [...document.querySelectorAll('div,button,a')].filter(
        (e) => casa(e) && e.getBoundingClientRect().height > 0
      );
      if (!alvos.length) return null;
      const r = alvos[alvos.length - 1].getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`
  );
  if (!caixa) return false;
  await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x: caixa.x, y: caixa.y }] });
  await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
  await sleep(2000);
  return true;
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('Sem Chrome/Edge - portao de scroll pulado.');
    process.exit(0);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naturelens-scroll-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=390,844',
    ],
    { stdio: 'ignore' }
  );

  let client;
  const resultados = [];
  try {
    for (let i = 0; i < 30 && !client; i++) {
      try {
        client = await CDP({ port: PORT });
      } catch (e) {
        await sleep(400);
      }
    }
    if (!client) throw new Error('nao conectei no Chrome');

    const { Page, Runtime, Input, Emulation } = client;
    await Promise.all([Page.enable(), Runtime.enable()]);

    // Sem isto o Chrome headless entrega eventos de touch mas a pagina se
    // comporta como desktop, e o RN-web nunca liga o caminho de toque.
    await Emulation.setDeviceMetricsOverride({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await Emulation.setTouchEmulationEnabled({ enabled: true, maxTouchPoints: 1 });

    await Page.navigate({ url: URL_ALVO });
    await Page.loadEventFired();
    await sleep(5000);

    // PROVA POR MUTACAO: `node scripts/gate-scroll.js <url> --mutar` reintroduz
    // o defeito de proposito (mata o overflow do scroller) e o portao TEM que
    // falhar. Um portao verde que nunca ficou vermelho nao prova nada - foi
    // exatamente uma sonda assim que respondeu "rola normal" tres vezes
    // seguidas enquanto o celular do dono estava travado.
    if (process.argv.includes('--mutar')) {
      console.log('  [mutacao ligada: quebrando o scroll de proposito]');
      await Runtime.evaluate({
        expression: `(() => {
          const s = document.createElement('style');
          s.textContent = 'div { overflow-y: hidden !important; }';
          document.head.appendChild(s);
        })()`,
      });
    }

    // Onboarding da primeira visita fica na frente de tudo (perfil vazio).
    await tocarEm(Runtime, Input, /^(Comecar|Começar|Get started|Start|Continuar|Continue|Pular|Skip)$/i);
    await sleep(1500);

    resultados.push(await medirRota(Runtime, Input, 'HOME'));

    // Perfil -> Ajustes: a rota SEM dock, obrigatoria. Ela representa as 24
    // rotas do HIDE_DOCK_ON, que sao exatamente as que quebraram. Se o portao
    // nao conseguir chegar la, ele falha em vez de dar PASS com 2 de 3 - foi
    // esse tipo de silencio que deixou o app quebrado por tres relatos.
    if (await tocarEm(Runtime, Input, /^(Perfil|Profile|Eu|Me)$/i)) {
      resultados.push(await medirRota(Runtime, Input, 'PERFIL'));
      if (await tocarEm(Runtime, Input, /(Ajustes|Settings|Configura)/i)) {
        resultados.push(await medirRota(Runtime, Input, 'AJUSTES (sem dock)'));
      } else {
        resultados.push({ nome: 'AJUSTES (sem dock)', ok: false, motivo: 'nao achei a entrada de Ajustes - rota nao medida' });
      }
    } else {
      resultados.push({ nome: 'PERFIL', ok: false, motivo: 'nao achei a aba Perfil - rota nao medida' });
    }
  } finally {
    if (client) await client.close().catch(() => {});
    chrome.kill();
    // No Windows o Chrome ainda segura arquivos do perfil por um instante
    // depois do kill e o rmSync estoura EPERM. Falha de FAXINA nunca pode
    // derrubar o portao - foi o que escondeu a primeira medicao boa.
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {
      /* perfil temporario fica pro sistema limpar */
    }
  }

  console.log('\n  PORTAO DE SCROLL (toque real, 390x844)');
  for (const r of resultados) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.nome.padEnd(20)} ${r.motivo}`);
  }

  const falhou = resultados.filter((r) => !r.ok);
  if (!resultados.length) {
    console.error('\n  Nenhuma rota foi medida - o portao nao provou nada. Tratando como falha.');
    process.exit(1);
  }
  if (falhou.length) {
    console.error(
      '\n  O dedo nao rola. Antes de mexer em splash, altura de dock ou CSS: confira se\n' +
        '  a cena tem altura DEFINIDA (cardStyle com flex:1 no App.js) e se a tabBar\n' +
        '  continua no fluxo com altura zero nas rotas do HIDE_DOCK_ON.'
    );
    process.exit(1);
  }
  console.log('  Todas as rotas medidas rolam ao toque.\n');
}

main().catch((e) => {
  console.error('portao de scroll quebrou:', e.message);
  process.exit(1);
});
