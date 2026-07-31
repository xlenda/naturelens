const fs = require('fs');
const path = require('path');
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
  '    <meta name="theme-color" content="#0E1512" />',
  '    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
  '    <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" />',
  '    <meta name="apple-mobile-web-app-capable" content="yes" />',
  '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '    <meta name="apple-mobile-web-app-title" content="NatureLens" />',
].join('\n');
html = html.replace('</head>', headInject + '\n  </head>');

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
