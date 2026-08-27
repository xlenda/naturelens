# Pacote Google Play — NatureLens

## Arquivos prontos

- `play-icon-512.png`: ícone da ficha, PNG RGBA 512 x 512.
- `feature-graphic-1024x500.png`: arte de destaque, PNG 1024 x 500.
- `screenshots-ready/pt-BR/` e `screenshots-ready/en-US/`: cinco capturas reais
  da interface em cada idioma, 1080 x 1920 (9:16).
- `screenshots-listing/pt-BR/` e `screenshots-listing/en-US/`: capturas finais
  diagramadas para a ficha, com manchetes localizadas e a interface real dentro
  de uma moldura editorial consistente.
- `metadata/`: título, descrição curta e descrição completa nos mesmos 17 idiomas do app.
- `aso-strategy.md`: posicionamento, arquitetura de busca, ordem das capturas e testes A/B.
- `aso-experiments.csv`: registro versionado dos experimentos da ficha.
- `data-safety.md`: respostas auditadas para Segurança dos dados e declarações relacionadas.
- `play-console-checklist.md`: respostas dos demais formulários e ordem de lançamento.

As capturas não têm moldura de navegador e representam a mesma interface React Native usada no Android. Antes de promover a versão de teste para produção, confira as cinco no AAB instalado em um aparelho real.

As capturas brutas ficam nas duas pastas localizadas de `screenshots-ready/`
como prova da interface. Para
subir na Play, use a pasta localizada de `screenshots-listing/`. Elas podem ser
recriadas deterministicamente com `node scripts/build-play-listing.js`; nenhum
texto é desenhado por IA e nenhuma tela do produto é inventada.

As cinco fontes também são reproduzíveis: sirva o export web localmente e rode
os dois comandos abaixo. O script semeia um exemplar apenas no storage
descartável do Chrome, navega pela interface real e não chama o identificador
nem consome crédito. O fixture vem do registro exibido na captura histórica
`screenshots/07-specimen-top.png`; ele não contém score de confiança nem fatos
do classificador. O alerta de segurança foi corrigido a partir da fonte
versionada em `docs/agronomia/grupos/folhagens-tropicais-de-interior.md`.

```powershell
node scripts/capture-play-result.js http://localhost:4180 store-assets/screenshots-ready pt
node scripts/capture-play-result.js http://localhost:4180 store-assets/screenshots-ready en
node scripts/build-play-listing.js
```

## Campos da ficha

- Nome pt-BR: `NatureLens: Identifica Plantas`
- Nome en-US: `NatureLens: Plant Identifier`
- Idioma padrão: `Português (Brasil)`
- Categoria sugerida: `Educação`
- Contém anúncios: `Não`
- Política de privacidade: `https://naturelensapp.cloud/privacy.html`
- Exclusão de conta/dados: `https://naturelensapp.cloud/account-deletion.html`
- Público-alvo sugerido: `13 anos ou mais`; o app não é dirigido a crianças.
- E-mail de suporte: preencher com um endereço monitorado pelo responsável antes de enviar a ficha. Não inventar um endereço.

## Build Android

O perfil `production` de `eas.json` já gera Android App Bundle e incrementa a versão. O pacote usa `app.naturelens`, Expo SDK 54 e target API 36.

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production
```

O primeiro envio do `.aab` pode ser feito manualmente no Play Console. Ative o Play App Signing e publique primeiro em `Teste interno`. O envio automático com `eas submit` só deve ser configurado depois do primeiro upload e de uma conta de serviço própria.

## Ainda depende do dono da conta

1. Entrar ou criar a conta Expo usada pelo projeto e concluir o build acima.
2. Criar/abrir a conta Google Play Console e pagar a taxa de cadastro, se ainda não existir.
3. Informar um e-mail público de suporte monitorado.
4. Fornecer ao revisor acesso de demonstração caso recursos restaurados de assinante precisem ser avaliados.
5. Preencher `Segurança dos dados` a partir de `data-safety.md`, além de `Classificação de conteúdo`, `Público-alvo` e a declaração de conteúdo gerado por IA.
6. Se a conta pessoal da Play foi criada depois de 13/11/2023, concluir o teste fechado exigido antes de pedir acesso à produção.
7. Executar `supabase-migration-ratelimit.sql` no Supabase e publicar as páginas legais atualizadas antes de enviar a ficha para revisão.

## ASO

O título da ficha combina a marca provisória com a principal intenção de busca.
Não altere o identificador `app.naturelens` se a marca mudar. Os limites de
30 caracteres no título, 80 na descrição curta e 4.000 na completa são
protegidos por `android-release.test.js` para todos os 17 locales.

Português e inglês possuem capturas localizadas. Os outros 15 locales já têm
metadados completos e podem reutilizar temporariamente a arte padrão; só
localize todas as imagens depois de um experimento confirmar a mensagem
vencedora. Veja `aso-strategy.md` antes de alterar título, textos ou ordem.

Referências oficiais: [recursos gráficos](https://support.google.com/googleplay/android-developer/answer/9866151), [nível de API](https://support.google.com/googleplay/android-developer/answer/11926878), [teste para contas pessoais novas](https://support.google.com/googleplay/android-developer/answer/14151465), [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) e [primeiro envio de um AAB Expo](https://docs.expo.dev/submit/android-manual/).

## Arte gerada

A arte `feature-graphic-1024x500.png` foi criada com a ferramenta integrada de geração de imagens a partir de `assets/art/store-banner.jpg` e `assets/icon.png`. Prompt final: feature graphic extra-wide de floresta editorial premium, identidade NatureLens à esquerda, mesa de campo à direita, texto exato “NatureLens”, paleta verde/sálvia/creme e sem preço, assinatura, selo de loja, alegação médica ou marca d'água.
