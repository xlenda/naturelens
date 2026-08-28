# Modelo de AGENTS.md — app Expo para Android e iOS

Copie o bloco abaixo para o `AGENTS.md` na raiz de cada projeto. Substitua todos
os campos entre `<...>` e apague regras que não se aplicam. Não copie IDs, chaves,
credenciais ou o `projectId` de outro app.

```md
# <APP_NAME> — regras para qualquer agente

## Produto e plataformas

- App React Native / Expo SDK <SDK_VERSION>.
- Alvos oficiais: Android (Google Play) e iOS (App Store).
- Android package: `<ANDROID_PACKAGE>`.
- iOS bundle identifier: `<IOS_BUNDLE_ID>`.
- Projeto EAS: owner `<EAS_OWNER>`, slug `<EAS_SLUG>` e projectId próprio.
- O site/PWA pode servir para construir e revisar, mas não substitui a validação
  dos recursos nativos em aparelhos reais.

## Armazenamento local

- Projeto e artefatos ficam em `D:\Projetos\<APP_FOLDER>`.
- Temporários ficam em `D:\Temp\User`.
- Cache de ferramentas fica em `D:\DevCache` quando configurável.
- Não duplicar builds, vídeos ou caches grandes no drive C:.

## Um código, duas lojas

- Compartilhar lógica e interface entre Android e iOS.
- Usar `.native.js` para código comum nativo e `.android.js` / `.ios.js` apenas
  quando o sistema realmente exigir comportamento diferente.
- Toda função prometida precisa existir nas duas plataformas ou ser claramente
  marcada como exclusiva de uma delas; nunca deixar botão morto.
- Não chamar uma função nativa de pronta até testá-la em Android e iPhone reais.
- Simulador não valida câmera, microfone, notificações, compras, restauração ou
  comportamento de segundo plano.

## Desenvolvimento a partir de Windows + iPhone

- Xcode e o simulador oficial de iOS exigem macOS. No Windows, usar EAS Build e
  instalar um development build no iPhone físico.
- Para Android no Windows, usar Android Studio + Android Emulator com o SDK e os
  AVDs em D: quando esse disco existir. Instalar no emulador um development build
  do mesmo commit e executar `npm run android` para Metro + Fast Refresh.
- Alterações somente em JavaScript, TypeScript, estilos e assets entram por Fast
  Refresh. Mudanças em módulo nativo, plugin Expo, permissões, `app.json` ou versão
  do SDK exigem um novo development build.
- `expo-dev-client` deve ser compatível com o SDK instalado.
- Perfis mínimos esperados em `eas.json`:

  - `development`: `developmentClient: true`, `distribution: internal`;
  - `development-simulator`: herda `development` e usa `ios.simulator: true`;
  - `preview`: distribuição interna para QA;
  - `preview-simulator`: herda `preview`, usa `ios.simulator: true` e leva o
    bundle final embutido para validar uma abertura autonoma em iOS;
  - `production`: artefato de loja, versão remota e incremento automático.

- Registrar o iPhone com `eas device:create` antes do build ad hoc.
- Development build exige Apple Developer ativa, Apple ID com 2FA, equipe Apple
  correta e UDID incluído no provisioning profile.
- O simulador remoto do EAS pode nao estar liberado para todas as contas. Um
  build de simulador concluido prova Xcode/link/bundle, mas nao prova que a tela
  montou enquanto uma sessao real ou remota nao for executada.
- `eas build` só compila. `eas submit` envia à loja. Publicar para usuários é uma
  terceira decisão; nunca confundir esses três passos.
- Nunca enviar à revisão ou liberar produção sem autorização explícita do dono.

## Permissões nativas

- Pedir câmera, galeria, microfone, localização e notificações somente depois de
  uma ação que explique por que o acesso é necessário.
- Negar uma permissão não pode bloquear recursos não relacionados.
- Toda finalidade de iOS deve estar no Info.plist e localizada nos idiomas do app.
- Manter `CFBundleAllowMixedLocalizations: true` quando houver prompts localizados.
- Declarar no Android apenas permissões usadas pelo fluxo real.
- Não habilitar localização precisa, background audio, telefone, Bluetooth,
  sobreposição ou alarme exato sem uma necessidade funcional documentada.
- Câmera e seletor de fotos não devem gravar áudio se o produto só usa microfone
  em uma função separada.

## Áudio, câmera e arquivos temporários

- Gravação deve ter indicador visível, limite rígido e encerramento em blur,
  troca de tela, bloqueio, background e desmontagem.
- Requisição de análise deve aceitar cancelamento e timeout; uma resposta antiga
  nunca pode navegar, salvar ou mostrar alerta depois que a tela perdeu o foco.
- Arquivo temporário deve ficar em subdiretório exclusivo do app dentro do cache,
  ser validado, usado somente para a solicitação atual e apagado logo após a
  conversão local, antes do upload. Não entrar em Documents, coleção, backup,
  logs ou analytics.
- Fazer varredura somente desse cache exclusivo ao abrir o app e antes de nova
  gravação. Se uma versão antiga gravava em Documents/filesDir, migrar apenas os
  nomes legados que o app consegue provar que são dele; nunca limpar uma pasta
  ampla da dependência.
- Se uma biblioteca nativa precisar de patch, versionar o patch, fixar a versão
  da biblioteca e aplicá-lo automaticamente no `postinstall`; testar uma
  instalação limpa para provar que o build recebe a correção.
- Validar formato, canais, taxa e duração antes do upload; não confiar apenas na
  extensão do arquivo.
- Descrever todos os saltos reais do áudio (API, host de inferência, observabilidade
  e processadores), a finalidade e a retenção. Não declarar processamento efêmero
  na ficha da loja antes de validar logs, APM e retenção no ambiente de produção.
- Dependência nativa que elevar o deployment target deve ter o mínimo declarado
  explicitamente e testado. Não copiar esse número de outro app sem conferir o
  podspec/dependência atual.

## Idioma

- Abrir no idioma do aparelho e manter a tela inteira no mesmo idioma.
- Nenhuma mensagem de erro, permissão, paywall, termo ou conteúdo pode cair para
  inglês no meio de outro idioma.
- Preservar placeholders e códigos técnicos; traduzir apenas o rótulo visível.
- Adicionar teste de paridade para cada chave nova em todos os idiomas suportados.

## Compras e assinatura

- Build Android vende somente por Google Play Billing.
- Build iOS vende somente por Apple In-App Purchase / StoreKit.
- Não exibir checkout externo, preço hardcoded ou CTA web dentro do app nativo.
- Produtos e preços vêm da loja; direito de acesso é validado no servidor.
- Implementar compra, restauração, expiração, reembolso e gerenciamento da
  assinatura antes de ativar o paywall.

## Privacidade e loja

- Manter Política de Privacidade e Termos iguais no app e no site.
- App Privacy da Apple e Data Safety do Google têm definições diferentes; não
  copiar respostas mecanicamente entre formulários.
- Se houver conta, oferecer exclusão dentro do app e URL pública de exclusão.
- Se houver conteúdo de usuários, exigir regras, denúncia, bloqueio, exclusão pelo
  autor e moderação humana documentada.
- Informar IA, fornecedores, retenção, compartilhamento, uso de localização e
  limites de segurança sem prometer o que o código não prova.
- Preparar screenshots reais, ícone, ASO localizado, suporte e notas de revisão.

## Git e segredos

- Antes de build/release: working tree entendido, mudanças commitadas e remote
  confirmado.
- Nunca versionar `.env`, tokens, service-role keys, certificados, profiles,
  senhas ou códigos 2FA.
- Preservar alterações do usuário e diretórios explicitamente fora do escopo.
- Não usar `git reset --hard`, não apagar caches/diretórios amplos e não publicar
  por atalhos diferentes do comando oficial deste projeto.

## Portões obrigatórios

Executar antes de qualquer build de loja:

1. `<FULL_TEST_COMMAND>`;
2. `npx expo install --check`;
3. `npx expo-doctor --verbose`;
4. `npx expo-modules-autolinking verify --platform both --verbose`;
5. bundle/export de Android e iOS;
6. inspeção do config resolvido: IDs, deployment target, permissões e ausência de
   background modes não autorizados;
7. teste em Android físico;
8. teste em iPhone físico / TestFlight;
9. validação de compra/restauração, câmera, galeria, microfone, notificações,
   idioma, offline, salvamento, restauração e exclusão de conta;
10. conferência final das fichas Google Play Data Safety e Apple App Privacy.

## Publicação

- Único comando autorizado para publicar o site: `<WEB_DEPLOY_COMMAND>`.
- Build Android: `<ANDROID_BUILD_COMMAND>`.
- Build iOS: `<IOS_BUILD_COMMAND>`.
- Envio Google Play: `<ANDROID_SUBMIT_COMMAND>` somente com aprovação.
- Envio App Store: `<IOS_SUBMIT_COMMAND>` somente com aprovação.
- Se qualquer portão falhar, não enviar nem publicar.
```

## Aplicação nos seus outros projetos

1. Abra a raiz do outro app.
2. Crie ou atualize o `AGENTS.md` com o bloco acima.
3. Preencha os identificadores exclusivos daquele app.
4. Rode `eas init` naquele projeto; nunca reaproveite o `projectId` do NatureLens.
5. Configure uma ficha separada no Play Console e no App Store Connect.
6. Repita build e teste físico: um build aprovado em um app não valida os outros.

No Windows, o equivalente visual mais direto ao simulador dos vídeos é o Android
Emulator com um development build: ele fica ao lado do editor e recebe mudanças
de interface por Fast Refresh. Para iPhone, o equivalente é o development build
instalado no aparelho físico via EAS. O iPhone valida hardware real; o emulador
Android acelera o ciclo de interface. Ambos exigem novo build quando muda código
ou configuração nativa.
