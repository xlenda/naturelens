# Checklist da App Store — NatureLens

## Binário

- Bundle ID imutável: `app.naturelens`.
- O perfil `production` do EAS incrementa a versão remotamente.
- Ícone iOS: `assets/icon.png`, 1024 x 1024, RGB e sem transparência.
- O vídeo de abertura usa `expo-video`, começa mudo, repete em loop e respeita
  Reduzir Movimento.
- A identificação por som funciona na web, no Android e no iOS. No iOS, a
  permissão de microfone do sistema deve aparecer somente no primeiro toque em
  gravar, nunca na abertura do app.
- A gravação funciona apenas com o app em primeiro plano. No fluxo concluído, o
  WAV nativo temporário é apagado logo após a conversão local e antes do upload;
  o áudio convertido não entra na coleção.
- O áudio convertido segue por HTTPS para uma função Vercel do NatureLens e
  depois, em requisição autenticada, para o host Perch operado para o
  NatureLens. Ambos atuam como operadores transitórios somente para a
  identificação solicitada, sem venda nem uso independente do áudio.
- O Info.plist deve declarar uma finalidade específica para o microfone, assim
  como já faz para câmera, fotos escolhidas e localização aproximada.
- Assinatura não é vendida nem anunciada no binário. O app apenas restaura
  acesso adquirido fora dele.

## Ficha

- Nome sugerido pt-BR: `NatureLens: Identifica Plantas`.
- Categoria sugerida: Educação.
- Política: `https://naturelensapp.cloud/privacy.html`.
- Exclusão: `https://naturelensapp.cloud/account-deletion.html`.
- Capturas 6,7 polegadas: `app-store-screenshots/pt-BR/` e `en-US/`, cinco
  arquivos 1290 x 2796 sem moldura de navegador.
- `supportsTablet` ainda está ativo. Antes da submissão, validar o layout em iPad
  real/simulador macOS e preparar as capturas exigidas para iPad; se o produto
  decidir ser somente iPhone, desativar esse alvo antes do build final em vez de
  enviar uma experiência de tablet sem revisão.
- Descrição: usar a mesma base localizada de `metadata/`, removendo qualquer
  frase exclusiva da Play Store.
- Informar um e-mail de suporte real e uma URL de suporte monitorada.

## Questionário e revisão

- Declarar conteúdo gerado por IA e conteúdo público de usuários.
- Explicar nas notas que identificações são probabilísticas, alertas de risco
  não substituem especialista e dado ausente não é inventado.
- Para Comunidade: regras aceitas antes de publicar, denúncia e bloqueio dentro
  do app, exclusão pelo autor e revisão humana diária conforme
  `docs/COMMUNITY_MODERATION.md`.
- Fornecer uma conta de demonstração somente se a Apple solicitar acesso aos
  recursos de assinante; não inclua credenciais em arquivo versionado.
- Não copiar mecanicamente `data-safety.md` para a App Privacy: as lojas usam
  perguntas e exceções diferentes, e a arquitetura pretendida não prova por si
  só que o dado foi descartado logo após a solicitação em tempo real.
- Antes de deixar `User Content > Audio Data` desmarcado ou declarar o fluxo
  efêmero à Apple, arquivar evidência das configurações e dos contratos de
  produção da Vercel e do host Perch: o corpo de áudio não pode permanecer em
  logs de acesso ou aplicação, APM, log drains, backups ou subprocessadores, e
  os operadores não podem vendê-lo nem usá-lo para finalidade própria.
- Se qualquer camada não puder ser validada, bloquear a declaração de
  efemeridade e marcar `User Content > Audio Data` conforme o fluxo real antes
  da submissão. Toda mudança futura de retenção, logging, APM, contrato ou
  subprocessador exige nova revisão do rótulo.

## Portões antes do upload

1. `npm test`.
2. `npm run verify:db`.
3. `npx expo-doctor`.
4. Build production no EAS e instalação em iPhone real/TestFlight.
5. Enquanto `supportsTablet` estiver ativo, validar também iPad e anexar as
   capturas correspondentes na ficha.
6. Validar câmera, galeria, idioma do aparelho, salvamento/restauração, exclusão
   de conta, Comunidade, localização aproximada e pedido de avaliação após uso real.
7. Em iPhone real, validar que o microfone é solicitado somente no primeiro toque
   em gravar, que a captura para ao tirar o app do primeiro plano e que nenhum
   áudio aparece na coleção. Confirmar também que o WAV temporário já foi
   apagado antes de a função Vercel receber o upload.
8. Validar e arquivar as configurações efetivas de retenção, access/application
   logs, APM, log drains, backups e subprocessadores da Vercel e do host Perch.
   Sem essa prova, não declarar o áudio efêmero ou não coletado à Apple.

Não enviar à revisão enquanto qualquer portão estiver vermelho ou enquanto a
conta Apple Developer da organização e os dados legais da empresa estiverem pendentes.
