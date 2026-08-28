# Auditoria nativa de Android e iPhone — 28/08/2026

## Resultado reproduzivel

- Build de desenvolvimento: commit `f7b634e3726ee19f78e5610a6bdb5faa587dc5be`,
  EAS `e8d9cd21-cbc3-4469-ae69-627ed20fa149`, perfil
  `development-simulator`; status concluido.
- Build autonomo proximo de producao: commit
  `1ebdcaf0e79e250db2ef02d4ab3818eb3d27b573`, EAS
  `a571d505-eb07-4591-828e-00b3d46e412a`, perfil
  `preview-simulator`; status concluido.
- Bundle: `app.naturelens`; versao `1.0.0`; build `1`; Expo SDK `54.0.0`.
- Artefato de simulador: `.app`, baixado somente em `D:\Temp\User`.
- Nenhum `eas submit`, TestFlight, App Store Connect ou Google Play foi acionado.

## Provas no artefato iOS

- `UIDeviceFamily = [1]`: o lancamento inicial atende somente iPhone.
- `MinimumOSVersion = 16.4`.
- `UIBackgroundModes = []`: o app nao declara gravacao em segundo plano.
- `NSAllowsArbitraryLoads = false`; apenas `localhost` aceita HTTP durante desenvolvimento.
- Camera, fotos escolhidas, localizacao aproximada e microfone possuem finalidade
  localizada nos 17 idiomas do app.
- `ITSAppUsesNonExemptEncryption = false`.
- O binario contem `AudioStudioModule`; o modulo nativo de captura entrou no link do Xcode.
- O pacote inclui `PrivacyInfo.xcprivacy` e manifests de privacidade das dependencias Expo/React.
- A previa nao contem `EXDevLauncher.bundle`, contem `main.jsbundle` e abre sem
  depender do servidor de desenvolvimento.
- O `.app` de previa extraido ocupa 72,5 MB; o antigo video bruto de 41,5 MB nao
  faz parte do fluxo nem do upload EAS.

## Provas no artefato Android

- Build de producao: commit `bf915dbe9feae99b39f884361a2d3d2089a7aedf`,
  EAS `391ce28c-e8e0-417e-aca8-b35c62a72e4a`, perfil `production`; status
  concluido. O resultado e um AAB assinado, ainda nao enviado ao Google Play.
- Pacote `app.naturelens`; versao `1.0.0`; version code `5`; Expo SDK `54.0.0`.
- AAB local:
  `D:\\Projetos\\NatureLensBuilds\\2026-08-28\\NatureLens-1.0.0-vc5-bf915db.aab`,
  77.169.371 bytes, SHA-256
  `003CE6FDF44049E8FD987C21CCB2F40C9CCBC9B468633E6E7E1D5F2BF9E01B41`.
- O `bundletool 1.18.3` oficial validou o AAB sem erro. O modulo base contem a
  biblioteca nativa `libaudio-studio-cpp.so` para Android, confirmando que a
  captura de som nativa entrou no pacote.
- O manifesto final contem camera, microfone, notificacoes, boot para lembretes e
  somente localizacao aproximada. Nao contem localizacao precisa/em segundo plano,
  leitura do telefone, Bluetooth, sobreposicao, alarme exato nem armazenamento amplo.
- Build de desenvolvimento para aparelho/emulador: EAS
  `c90052be-37b2-476b-bb73-a856809e180b`, mesmo commit e version code; status
  concluido. APK local:
  `D:\\Projetos\\NatureLensBuilds\\2026-08-28\\NatureLens-dev-bf915db.apk`,
  171.296.845 bytes, SHA-256
  `A8798DC4D7574058D9716A4CF953453BB978917B5DA18AEB57591494A53953E4`.
- O APK abre como ZIP valido, inclui quatro ABIs (`arm64-v8a`, `armeabi-v7a`,
  `x86`, `x86_64`) e inclui `libaudio-studio-cpp.so` em `arm64-v8a`, `x86` e
  `x86_64`, inclusive a arquitetura usada pelo emulador no Windows.
- Android Studio Quail 3 Feature Drop `2026.1.3 Patch 1` foi preparado em
  `D:\\Android\\android-studio`. SDK, AVD, Gradle e caches foram direcionados a D:.
  A aceitacao pessoal dos termos do Google e a criacao do primeiro AVD continuam
  como etapa interativa do proprietario antes da instalacao do APK.

## Portoes executados

- `npm test`: 768 testes aprovados, alem de 6 checagens de cuidado por especie.
- `npm run verify:db`: banco, comunidade, clima, relatorios e conhecimento prontos.
- `expo install --check`: dependencias corretas.
- `expo-doctor --verbose`: 18/18.
- `expo-modules-autolinking verify --platform both --verbose`: 34 modulos, sem conflito.
- EAS/Xcode: compilacoes Debug e Release de simulador concluidas.
- EAS/Gradle: compilacoes Android de desenvolvimento e producao concluidas.
- `bundletool validate`: AAB Android aprovado.

## O que esta prova nao substitui

- Simulador nao prova microfone, camera, galeria, notificacoes, localizacao ou
  interrupcao da gravacao em um iPhone fisico.
- O `.app` de simulador nao instala em iPhone. Um build de aparelho exige equipe
  Apple Developer da organizacao, iPhone registrado e provisioning profile.
- A tentativa de execucao no iPhone 16 Pro remoto do EAS foi bloqueada antes de
  criar sessao porque esse servico ainda nao esta disponivel para a conta. Portanto,
  compilacao e pacote foram provados, mas a montagem visual iOS continua pendente.
- O host Perch e publicado separadamente. O repositorio nao possui acesso ou
  pipeline do provedor que permita provar que a versao endurecida esta no ar.
- Antes da ficha, ainda sao obrigatorios um e-mail de suporte monitorado e a
  conferencia real de logs, APM, backups, retencao e subprocessadores do audio.
- Venda nova continua desativada. Para cobrar, ainda e necessario criar os produtos
  nas duas lojas e implementar Billing/StoreKit com validacao server-side.

Esses itens dependem de conta, contrato, aparelho ou infraestrutura externa. Eles
nao devem ser marcados como concluidos por inferencia e nunca autorizam submissao
automatica para as lojas.
