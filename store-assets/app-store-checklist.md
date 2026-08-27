# Checklist da App Store — NatureLens

## Binário

- Bundle ID imutável: `app.naturelens`.
- O perfil `production` do EAS incrementa a versão remotamente.
- Ícone iOS: `assets/icon.png`, 1024 x 1024, RGB e sem transparência.
- O vídeo de abertura usa `expo-video`, começa mudo, repete em loop e respeita
  Reduzir Movimento.
- Som fica oculto no iOS até o gravador ser validado em aparelho real; por isso
  o Info.plist não declara microfone. Câmera, fotos escolhidas e localização
  aproximada possuem finalidades específicas.
- Assinatura não é vendida nem anunciada no binário. O app apenas restaura
  acesso adquirido fora dele.

## Ficha

- Nome sugerido pt-BR: `NatureLens: Identifica Plantas`.
- Categoria sugerida: Educação.
- Política: `https://naturelensapp.cloud/privacy.html`.
- Exclusão: `https://naturelensapp.cloud/account-deletion.html`.
- Capturas 6,7 polegadas: `app-store-screenshots/pt-BR/` e `en-US/`, cinco
  arquivos 1290 x 2796 sem moldura de navegador.
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
- Preencher a seção App Privacy a partir de `data-safety.md`, adaptando os nomes
  de campos ao formulário da Apple.

## Portões antes do upload

1. `npm test`.
2. `npm run verify:db`.
3. `npx expo-doctor`.
4. Build production no EAS e instalação em iPhone real/TestFlight.
5. Validar câmera, galeria, idioma do aparelho, salvamento/restauração, exclusão
   de conta, Comunidade, localização aproximada e pedido de avaliação após uso real.

Não enviar à revisão enquanto qualquer portão estiver vermelho ou enquanto a
conta Apple Developer da organização e os dados legais da empresa estiverem pendentes.
