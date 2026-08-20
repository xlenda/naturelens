# NatureLens — o que qualquer agente precisa saber antes de mexer

App de identificacao de natureza (plantas, arvores, cogumelos, insetos, peixes,
aves, lavoura, som). React Native / Expo SDK 54, roda como PWA em
https://naturelensapp.cloud e vai para a Play Store como `app.naturelens`.
17 idiomas. Tem assinante pagando.

## A unica forma de publicar

    npm run deploy

Isso roda, nesta ordem: 133 testes -> `expo export -p web` -> `patch-pwa.js` ->
`vercel deploy --prod` -> 5 portoes contra a producao ja publicada.

NUNCA rode `vercel deploy` direto. O app vive num sub-caminho e o deploy cru
derruba producao (ja aconteceu num projeto irmao em 03/08).

## Os 5 portoes, e por que cada um existe

| Portao | Pega o que |
|---|---|
| `verify-live` | HTTP: bundle serve, locales servem, splash chegou no HTML, cor do chrome bate com o tema |
| `e2e-render` | A tela MONTA em Chrome de verdade, sem excecao e sem ErrorBoundary |
| `e2e-mic` | O caminho de identificacao por som |
| `scroll` | Toque REAL (CDP, 390x844) em 3 rotas — inclusive uma sem dock |
| `check-species-care` | O banco do USDA nao saiu de sincronia com o loader |

Todo portao tem prova por MUTACAO. Se voce criar outro, prove que ele fica
vermelho quebrando de proposito, senao ele nao vale nada — ja houve portao aqui
que nascia quebrado e passava verde a toa.

## Armadilhas que ja custaram caro (todas com comentario no codigo)

1. **Scroll travado.** A tabBar customizada tem que ficar NO FLUXO. `return null`
   e `position: absolute` produzem o MESMO defeito: a cena cresce ate a altura
   do conteudo e o ScrollView nunca vira area rolavel — o dedo nao rola, mas
   `scrollTop` por script rola, entao sonda automatica MENTE. Nas rotas sem dock,
   devolva uma View de altura zero. E o `cardStyle` do Stack precisa de
   `flex: 1`. Ver `components/TwoRowTabBar.js` e `App.js`.
2. **Lookbehind derruba o app inteiro.** Lookbehind em regex e SyntaxError de
   PARSE no Safari < 16.4: o bundle morre e o app abre em BRANCO em todo iPhone
   com iOS 15. Use `components/sentences.js`. Ha portao varrendo o projeto.
3. **Valor cru e chave, traducao e rotulo.** `edibility`, `danger`, `severity` e
   `water` escolhem COR ou intervalo casando a palavra em INGLES. Traduzir no
   lugar faz um cogumelo MORTAL sair laranja. A traducao vai para
   `<campo>Label`. Ver `api/_lib/translateEntity.js` e `risk-label.test.js`.
4. **Aviso de risco nunca colapsa.** Toxicidade e perigo renderizam INTEIROS.
   Colapsado em 1 frase, "Nao e toxica para humanos. E FATAL para gatos."
   mostrava so a primeira metade.
5. **Cronograma e por ESTACAO, nunca por MES.** O app tem usuario nos dois
   hemisferios. Ha portao com lista de meses por idioma. Cuidado: em turco
   `aralik` e "intervalo" E dezembro; `ekim` e "plantio" E outubro.
6. **Nao invente lista-negra de sufixo de locale.** Ja quebrou o deploy 4 vezes.
   Locale de interface e o que esta em `SUPPORTED_LANGUAGES` (`test-locales.js`).

## Regras do dono (nao negociaveis)

- **Dado ausente = bloco NAO renderiza.** Nunca placeholder, nunca inventar.
- **App inteiro no mesmo idioma.** Nada cai pro ingles no meio de uma tela.
- **Build NATIVO nao pode ter preco, link ou CTA de pagamento** fora do Play
  Billing. Consumo de quem ja pagou no site e permitido.
- **`@textmarker_device_id` e `@textmarker_language` NUNCA mudam de nome** —
  quebra o vinculo de assinatura paga.
- **Quente primeiro, ficha depois.** Aplicacao abre a tela, dado tecnico fecha.
- Comentario explica POR QUE, nunca o que. Em portugues, sem acentos.
- Diff mais curto que resolve a CAUSA RAIZ. Sem abstracao especulativa.

## O que esta pendente (decisao do dono, nao bug)

- **Cuidado por especie cobre 2% das tropicais.** O USDA PLANTS (dominio
  publico, uso comercial livre) traz 2.135 especies, mas e banco de conservacao
  norte-americana: Monstera, jiboia, orquidea e suculenta de vaso ficam de fora
  e caem pro conselho do GRUPO — o card diz isso, nunca finge. Cobrir tropical
  exige curadoria propria, especie por especie.
- **Localizacao nao funciona no APK.** `navigator.geolocation` nao existe em
  React Native. Religar exige `expo-location`, a permissao
  ACCESS_COARSE_LOCATION e declaracao no formulario de Seguranca de Dados do
  Google. Nao instale "so pra resolver o aviso".
- **Telefone de emergencia saiu dos 17 idiomas** (dava numero brasileiro e
  americano pra todo mundo). Numero certo por pais exige detectar PAIS, nao
  idioma.
- **Falta conta Expo** para `eas build -p android --profile preview` (o APK de
  teste) e a conta Google Play (US$ 25).
- **Ofertas na Hotmart** precisam ser criadas em exatamente US$ 5 / 11 / 33 —
  a tela promete esses valores e nada e buscado dinamicamente.
