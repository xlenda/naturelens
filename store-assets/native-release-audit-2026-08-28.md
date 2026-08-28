# Auditoria nativa de Android e iPhone — 28/08/2026

## Resultado reproduzivel

- Commit compilado: `f7b634e3726ee19f78e5610a6bdb5faa587dc5be`.
- EAS build iOS: `e8d9cd21-cbc3-4469-ae69-627ed20fa149`.
- Perfil: `development-simulator`; status: concluido.
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

## Portoes executados

- `npm test`: 768 testes aprovados, alem de 6 checagens de cuidado por especie.
- `npm run verify:db`: banco, comunidade, clima, relatorios e conhecimento prontos.
- `expo install --check`: dependencias corretas.
- `expo-doctor --verbose`: 18/18.
- `expo-modules-autolinking verify --platform both --verbose`: 34 modulos, sem conflito.
- EAS/Xcode: compilacao iOS concluida.

## O que esta prova nao substitui

- Simulador nao prova microfone, camera, galeria, notificacoes, localizacao ou
  interrupcao da gravacao em um iPhone fisico.
- O `.app` de simulador nao instala em iPhone. Um build de aparelho exige equipe
  Apple Developer da organizacao, iPhone registrado e provisioning profile.
- O host Perch e publicado separadamente. O repositorio nao possui acesso ou
  pipeline do provedor que permita provar que a versao endurecida esta no ar.
- Antes da ficha, ainda sao obrigatorios um e-mail de suporte monitorado e a
  conferencia real de logs, APM, backups, retencao e subprocessadores do audio.
- Venda nova continua desativada. Para cobrar, ainda e necessario criar os produtos
  nas duas lojas e implementar Billing/StoreKit com validacao server-side.

Esses itens dependem de conta, contrato, aparelho ou infraestrutura externa. Eles
nao devem ser marcados como concluidos por inferencia e nunca autorizam submissao
automatica para as lojas.
