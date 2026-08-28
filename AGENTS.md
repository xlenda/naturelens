# NatureLens — o que qualquer agente precisa saber antes de mexer

App de identificacao de natureza (plantas, arvores, cogumelos, insetos, peixes,
aves, lavoura, som). React Native / Expo SDK 54, roda como PWA em
https://naturelensapp.cloud e vai para Play Store e App Store como `app.naturelens`.
17 idiomas. Tem assinante pagando.

## A unica forma de publicar

    npm run deploy

Isso roda, nesta ordem: 767 testes + 6 checagens de cuidado por especie -> preflight do banco -> `expo export -p web` -> `patch-pwa.js` ->
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
- **Build NATIVO nao pode ter preco, link ou CTA de pagamento** fora do Google
  Play Billing / Apple In-App Purchase. Consumo de acesso ja validado e permitido.
- **`@textmarker_device_id` e `@textmarker_language` NUNCA mudam de nome** —
  quebra o vinculo de assinatura paga.
- **Quente primeiro, ficha depois.** Aplicacao abre a tela, dado tecnico fecha.
- **"Abas completas" significa dossie completo, nao apenas navegacao visivel.**
  Cada identificacao precisa preencher, com dados especificos da especie, todas
  as secoes verdadeiras que a categoria permite. Em insetos, por exemplo:
  identificacao/evidencia, ciclo de vida e estagios, alimentacao, habitat,
  reproducao, sazonalidade, distribuicao, papel ecologico, risco, relacao com
  plantas/culturas, problemas e MIP quando realmente aplicavel. A mesma regra
  vale para plantas, arvores, lavouras, cogumelos, aves, peixes e sons, cada uma
  com seu proprio modelo editorial. Uma aba vazia nao conta como completa;
  enriqueca pelo nome cientifico e fontes confiaveis quando possivel, e se o
  dado continuar ausente, nao renderize o bloco. Nunca copie rega/adubacao para
  animais, fungos ou sons.
- Comentario explica POR QUE, nunca o que. Em portugues, sem acentos.
- Diff mais curto que resolve a CAUSA RAIZ. Sem abstracao especulativa.

## Estado do 3S e da profundidade por categoria

- **PULSO VIVO IMPLEMENTADO.** Foto revisada exige segurar por 820 ms antes do
  consentimento do fornecedor; audio web fica em memoria e audio nativo usa
  apenas o cache temporario exclusivo do app. Ambos exigem o mesmo gesto antes
  do envio ao servidor NatureLens. Timer, cancelamento ao
  perder foco, movimento reduzido, teclado/leitor de tela e haptica opcional
  possuem testes proprios. O resultado recebe NaturePrint deterministica e e
  salvo automaticamente antes de abrir a ficha. Risco conhecido suprime
  celebracao; peixe sem registro especifico mostra seguranca nao verificada.
  O visor cinematografico nativo usa `expo-camera`, moldura propria e permissao
  contextual; o PWA preserva o seletor do navegador. O fluxo nativo ainda exige
  validacao em aparelhos Android e iPhone reais antes de ser chamado de pronto.

- **SOM NATIVO IMPLEMENTADO EM ANDROID E IOS, AINDA SEM PROVA EM IPHONE REAL.**
  `@siteed/audio-studio` grava PCM16 mono em primeiro plano; o adaptador valida o
  WAV no cache exclusivo, converte para o contrato Perch de 32 kHz e apaga o
  arquivo antes do upload. O app limpa esse cache ao abrir e antes de gravar;
  tambem remove apenas WAVs UUID legados que a dependencia deixava em Documents.
  Blur, bloqueio e app em segundo plano cancelam a captura. O iOS minimo e 16.4
  porque o pod 3.2.1 exige esse target. A permissao de microfone e contextual e
  localizada nos 17 idiomas. Nao declarar background audio, telefone ou Bluetooth.
  Expo Go e simulador nao validam esse caminho: usar development build em iPhone.

- **MATRIZ DAS OITO CATEGORIAS IMPLEMENTADA, COBERTURA AINDA PARCIAL.** Todas as
  oito categorias enriquecem dinamicamente pelo binomio confirmado e exibem a
  ficha verdadeira inteira por padrao. GBIF prova a identidade; secoes do artigo
  Wikipedia no idioma do leitor so entram quando pertencem a mesma especie e
  carregam artigo, historico de autores e licenca CC BY-SA 4.0. Inseto tambem
  inclui relacoes GloBI e estagios documentados; MIP continua apenas nos pares
  praga-cultura auditados. Cogumelo e som nunca sintetizam substrato, esporos,
  frequencia ou comportamento ausente. `category-depth-contract.test.js` impede
  que chave estatica, placeholder ou chrome conte como profundidade. Plantas,
  arvores e lavouras preservam o motor agronomico existente, mas tropical,
  adubacao numerica e MIP ainda tem os limites descritos abaixo. Nunca chamar o
  conjunto de cobertura mundial total.

- **PERFIL AGRONOMICO V2 E MUNDIAL.** O perfil local aceita os 249 codigos
  territoriais ISO, subdivisao opcional e localidade, com seletor pesquisavel
  traduzido; perfis V1 de municipio/UF migram para BR/BR-UF sem perder diario.
  A area de manejo mostra um dossie mundial apenas quando GBIF confirma a mesma
  especie exata de Plantae e a secao local da Wikipedia traz fonte/licenca. Essa
  camada e descritiva e nunca libera dose ou tabela regional. Regras brasileiras
  continuam presas a BR-UF. O registro comercial permite GBIF, SoilGrids,
  AgERA5 e NASA POWER apenas nos usos auditados; WorldClim, EcoCrop e GAEZ v4
  ficam bloqueados, e fontes FAO ambiguas ficam em quarentena. Clima mensal
  oficial da NASA POWER foi ativado sob demanda com `expo-location`, localizacao
  aproximada, arredondamento para grade de 0,5 grau antes do envio e cache de sete
  dias. A camada e descritiva, nunca prescreve dose. Solo mundial por coordenada
  continua bloqueado enquanto a API publica do SoilGrids estiver indisponivel.

- **Cuidado tropical exato continua parcial.** O USDA PLANTS (dominio
  publico, uso comercial livre) traz 2.135 especies, mas e banco de conservacao
  norte-americana: Monstera, jiboia, orquidea e suculenta de vaso ficam de fora
  e caem pro conselho do GRUPO — o card diz isso, nunca finge. A camada tropical
  propria comecou por Monstera deliciosa, zamioculca, jiboia e manga, sempre com
  fonte UF/IFAS por especie. Expandir apenas por curadoria exata, nunca por palpite.
- **Localizacao aproximada funciona no APK sob demanda.** Usa `expo-location`
  com `ACCESS_COARSE_LOCATION`; `ACCESS_FINE_LOCATION` esta bloqueada. O app nao
  guarda a coordenada exata e a declaracao da Play precisa permanecer sincronizada.
- **Telefone de emergencia saiu dos 17 idiomas** (dava numero brasileiro e
  americano pra todo mundo). Numero certo por pais exige detectar PAIS, nao
  idioma.
- **EAS esta ligado ao projeto**, com perfis de development fisico, simulator,
  preview e production. O lancamento inicial iOS e somente iPhone; iPad fica
  desativado ate existir layout e capturas validados. Ainda faltam a equipe Apple
  Developer da organizacao, registro do iPhone e validacao fisica; no Android
  ainda falta a conta Google Play e a validacao do AAB em aparelho real.
- **Pagamento antigo removido.** Nao existe checkout web nem preco hardcoded.
  Compras futuras devem usar exclusivamente Google Play Billing / Apple IAP,
  com produtos e precos vindos da loja e validacao server-side antes de liberar
  `subscriptions`. Ate isso existir, a venda permanece desativada sem CTA falsa.
