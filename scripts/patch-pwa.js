const fs = require('fs');
const path = require('path');

// Cor de fundo vinda do TEMA, nao copiada.
//
// O chrome do PWA dizia #0E1512 e o splash terminava em #0a100d enquanto o
// app pintava #070B09: tres tons diferentes de "preto esverdeado", entao a
// barra de status do celular e a emenda entre o splash e a primeira tela
// apareciam como costura. Ninguem lembra de atualizar tres lugares quando
// muda a paleta - por isso o valor agora e LIDO do components/theme.js, que
// e ESM e nao da pra importar daqui (este script e CommonJS).
function corDoTema(nome, padrao) {
  try {
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'components', 'theme.js'), 'utf8');
    const achado = fonte.match(new RegExp(nome + ":\\s*'(#[0-9a-fA-F]{3,8})'"));
    return achado ? achado[1] : padrao;
  } catch (e) {
    return padrao;
  }
}
const FUNDO = corDoTema('background', '#070B09');
const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>NatureLens</title>');

const gtmHead = [
  '    <!-- Google Tag Manager -->',
  '    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({\'gtm.start\':',
  "    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],",
  "    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=",
  "    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);",
  "    })(window,document,'script','dataLayer','GTM-5XB5TSQW');</script>",
  '    <!-- End Google Tag Manager -->',
].join('\n');
html = html.replace(/<head>/, '<head>\n' + gtmHead);

const gtmBody = [
  '    <!-- Google Tag Manager (noscript) -->',
  '    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5XB5TSQW"',
  '    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
  '    <!-- End Google Tag Manager (noscript) -->',
].join('\n');
html = html.replace(/<body([^>]*)>/, '<body$1>\n' + gtmBody);

const utmifyPixel = [
  '    <!-- Utmify Pixel -->',
  '    <script>',
  '      window.pixelId = "6a50501d04329fff12ab988a";',
  '      var utmifyScript = document.createElement("script");',
  '      utmifyScript.setAttribute("async", "");',
  '      utmifyScript.setAttribute("defer", "");',
  '      utmifyScript.setAttribute("src", "https://cdn.utmify.com.br/scripts/pixel/pixel.js");',
  '      document.head.appendChild(utmifyScript);',
  '    </script>',
  '    <!-- End Utmify Pixel -->',
].join('\n');
html = html.replace(/<head>/, '<head>\n' + utmifyPixel);

// Open Graph / Twitter card.
//
// Without these, pasting the URL into WhatsApp (or Telegram, Facebook, X,
// LinkedIn, Slack, Discord) shows a bare blue link with no image, no title and
// no description - invisible in a busy chat. This is the counterpart to the
// in-app share card: that one covers "I found this plant", this one covers
// "check out this app".
//
// Absolute URLs are mandatory: every scraper fetches og:image on its own, from
// its own servers, so a relative path resolves against nothing.
const SITE_URL = 'https://naturelensapp.cloud';
const OG_TITLE = 'NatureLens - Identifique a natureza por foto';
const OG_DESC =
  'Fotografe qualquer planta, inseto, cogumelo, cultura, peixe ou pássaro e descubra o que é em segundos, com fotos de referência para confirmar.';

const ogInject = [
  '    <meta name="description" content="' + OG_DESC + '" />',
  '    <meta property="og:type" content="website" />',
  '    <meta property="og:site_name" content="NatureLens" />',
  '    <meta property="og:url" content="' + SITE_URL + '/" />',
  '    <meta property="og:title" content="' + OG_TITLE + '" />',
  '    <meta property="og:description" content="' + OG_DESC + '" />',
  '    <meta property="og:image" content="' + SITE_URL + '/og-image.png" />',
  '    <meta property="og:image:width" content="1200" />',
  '    <meta property="og:image:height" content="630" />',
  '    <meta property="og:image:alt" content="NatureLens - identificacao de especies por foto" />',
  '    <meta property="og:locale" content="pt_BR" />',
  '    <meta name="twitter:card" content="summary_large_image" />',
  '    <meta name="twitter:title" content="' + OG_TITLE + '" />',
  '    <meta name="twitter:description" content="' + OG_DESC + '" />',
  '    <meta name="twitter:image" content="' + SITE_URL + '/og-image.png" />',
].join('\n');
html = html.replace(/<head>/, '<head>\n' + ogInject);

const headInject = [
  '    <link rel="manifest" href="/manifest.json" />',
  '    <meta name="theme-color" content="' + FUNDO + '" />',
  '    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
  '    <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" />',
  '    <meta name="apple-mobile-web-app-capable" content="yes" />',
  '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '    <meta name="apple-mobile-web-app-title" content="NatureLens" />',
  // Phone frame on desktop. A mobile-first app stretched across 1900px reads
  // as a broken web page, and the owner's verdict on his own desktop is "está
  // tudo esticado". Below 600px nothing here applies, so phones and the e2e
  // gate (390x844 viewport) never see it.
  '    <style>',
  '      @media (min-width: 600px) {',
  '        body { background: radial-gradient(circle at 50% 0%, #17241d 0%, ' + FUNDO + ' 70%); }',
  '        #root {',
  '          max-width: 480px;',
  '          margin: 0 auto;',
  '          min-height: 100vh;',
  '          box-shadow: 0 0 60px rgba(0,0,0,0.55);',
  '        }',
  '      }',
  '    </style>',
].join('\n');
html = html.replace('</head>', headInject + '\n  </head>');

// Mouse-wheel -> horizontal scroll nas faixas (estante de Livros, trending,
// achados recentes). RN-web so rola strips horizontais com gesto de
// touch/trackpad e esconde a barrinha; usuario de MOUSE no desktop ficava
// travado ("nao consigo scrollar para a direita"). Um listener global:
// se a roda girar sobre um elemento horizontalmente rolavel (e que nao rola
// na vertical), converte deltaY em scrollLeft. So para ponteiro fino (mouse).
const wheelScroll = [
  '<script>',
  "if (matchMedia('(pointer: fine)').matches) {",
  "  document.addEventListener('wheel', function (e) {",
  '    var el = e.target;',
  '    while (el && el !== document.body) {',
  '      var canX = el.scrollWidth > el.clientWidth + 8;',
  '      var canY = el.scrollHeight > el.clientHeight + 8;',
  '      if (canX && !canY) {',
  '        var before = el.scrollLeft;',
  '        el.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);',
  '        if (el.scrollLeft !== before) { e.preventDefault(); }',
  '        return;',
  '      }',
  '      el = el.parentElement;',
  '    }',
  "  }, { passive: false });",
  '}',
  '<' + '/script>',
].join(String.fromCharCode(10));
html = html.replace('</body>', wheelScroll + String.fromCharCode(10) + '</body>');

// O "matador de splash" que morava aqui foi REMOVIDO (auditoria 20/08).
//
// Ele nasceu de um diagnostico errado: o splash foi acusado de ser o vidro
// invisivel que travava o scroll. Medicao no navegador provou o contrario -
// injetei um clone do splash dentro do #root antes do boot e o React o
// apagou em menos de um frame (react-native-web 0.21 usa createRoot, e o
// React 19 limpa o container no primeiro commit). O splash nunca capturou
// toque nenhum; a causa real era a tabBar fora do fluxo.
//
// Pior: o script dele continha a string 'nl-splash' e a guarda de
// idempotencia logo abaixo testa exatamente essa string. Com o matador no
// HTML, a guarda dava sempre falso e o splash de verdade NUNCA era injetado.
// A animacao da folha se desenhando esteve morta em todo build desde entao.

// Entry splash: the NatureLens leaf DRAWING ITSELF (stroke-dasharray /
// stroke-dashoffset, pure CSS, ~1.6s) plus the wordmark fading in.
//
// It is injected INSIDE #root on purpose: ReactDOM's render replaces the
// container's children, so the splash vanishes by itself the instant the real
// app mounts - no JS to remove it, no listener to leak, and the e2e gate
// (which polls for real app text) is unaffected because the splash simply is
// not there once anything assertable exists. The <style> rides inside #root
// too, so it is swept away with the markup.
//
// prefers-reduced-motion: no animation at all - the leaf shows fully drawn and
// the wordmark fully visible, statically.
const splash = [
  '<style>',
  '  #nl-splash{position:fixed;inset:0;display:flex;flex-direction:column;',
  '    align-items:center;justify-content:center;gap:18px;background:' + FUNDO + ';z-index:9999;',
  // pointer-events:none e a defesa que faltava: se o React montar SEM
  // limpar este no (foi o que travou o scroll de todas as telas em
  // 20/08 - a camada fixa continuava por cima capturando cada toque),
  // o splash vira decoracao inerte em vez de um vidro invisivel.
  '    pointer-events:none}',
  '  #nl-splash svg path{fill:none;stroke:#4E9F6B;stroke-width:3.5;stroke-linecap:round;',
  '    stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;',
  '    animation:nl-draw .9s ease-out forwards}',
  '  #nl-splash svg path:nth-child(2){animation-delay:.45s;animation-duration:.5s}',
  '  #nl-splash svg path:nth-child(3){animation-delay:.8s;animation-duration:.35s}',
  '  #nl-splash svg path:nth-child(4){animation-delay:.95s;animation-duration:.35s}',
  '  #nl-wordmark{color:#F2F5F3;font-family:system-ui,sans-serif;font-size:22px;',
  '    font-weight:700;letter-spacing:1px;opacity:0;animation:nl-fade .6s ease-out .7s forwards}',
  '  @keyframes nl-draw{to{stroke-dashoffset:0}}',
  '  @keyframes nl-fade{to{opacity:1}}',
  '  @media (prefers-reduced-motion: reduce){',
  '    #nl-splash svg path{animation:none;stroke-dashoffset:0}',
  '    #nl-wordmark{animation:none;opacity:1}',
  '  }',
  '</style>',
  '<div id="nl-splash">',
  '  <svg width="96" height="96" viewBox="0 0 120 120" aria-hidden="true">',
  '    <path pathLength="1" d="M60 110 C22 84 24 34 60 12 C96 34 98 84 60 110 Z"/>',
  '    <path pathLength="1" d="M60 106 C58 76 58 48 60 22"/>',
  '    <path pathLength="1" d="M59 80 C48 72 41 63 37 52"/>',
  '    <path pathLength="1" d="M60 58 C70 52 78 43 82 33"/>',
  '  </svg>',
  '  <div id="nl-wordmark">NatureLens</div>',
  '</div>',
].join('\n');
// Idempotent: a second run of this script must not stack a second splash.
if (!html.includes('nl-splash')) {
  html = html.replace(/(<div id="root"[^>]*>)/, '$1' + splash);
}

const swInject = [
  '    <script>',
  "      if ('serviceWorker' in navigator) {",
  "        window.addEventListener('load', function () {",
  "          navigator.serviceWorker.register('/sw.js').catch(function () {});",
  '        });',
  '      }',
  '    </script>',
].join('\n');
html = html.replace('</body>', swInject + '\n</body>');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('PWA tags injected into dist/index.html');
