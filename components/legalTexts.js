// legalTexts.js — modulo de DADOS puro (sem componente, sem estilo).
// Transcricao FIEL de public/privacy.html e public/terms.html, decidida em
// 19/08/2026: o dono reclamou que o in-app era so resumo enquanto o
// concorrente mostra o documento juridico inteiro dentro do app. Os legais
// completos existem SO em PT+EN por design (mesmo padrao do concorrente, que
// mostra o juridico em ingles para qualquer idioma de UI); o resumo segue
// localizado nos 17 idiomas. Sumario/ancoras dos HTML foram omitidos de
// proposito (nao ha navegacao por ancora dentro de um ScrollView).
//
// Formato: secao = { heading, blocks }
// block = { type: 'p', text } | { type: 'li', text }
//       | { type: 'table', headers: [], rows: [][] }

export const privacyPt = [
  {
    heading: `Política de Privacidade — NatureLens`,
    blocks: [
      { type: 'p', text: `Vigente a partir de 19 de agosto de 2026 · naturelensapp.cloud` },
      { type: 'p', text: `O NatureLens identifica plantas, árvores, insetos, cogumelos, lavouras, peixes e pássaros por foto, e sons de animais por gravação (versão web). Esta política explica, com honestidade, o que coletamos, por quê, com quem compartilhamos e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018) e o Regulamento Geral de Proteção de Dados europeu (GDPR).` },
      { type: 'p', text: `Aviso importante: a identificação por IA pode errar. Nunca consuma um cogumelo, planta ou erva com base apenas no app. O conteúdo sobre ervas e usos tradicionais é educacional e não substitui orientação médica.` },
    ],
  },
  {
    heading: `1. Quem somos`,
    blocks: [
      { type: 'p', text: `O NatureLens é desenvolvido e mantido por um desenvolvedor independente, responsável pelo tratamento dos dados descritos nesta política (controlador, nos termos da LGPD e do GDPR). O site oficial é naturelensapp.cloud.` },
      { type: 'p', text: `Nosso princípio é coletar o mínimo possível: o app funciona sem conta, não exibe anúncios, não vende dados pessoais e não contém rastreadores de publicidade no aplicativo Android.` },
    ],
  },
  {
    heading: `2. Dados que coletamos`,
    blocks: [
      { type: 'p', text: `Coletamos apenas o necessário para cada recurso funcionar. Nada além do listado abaixo.` },
      {
        type: 'table',
        headers: [`Categoria`, `Exemplo`, `Obrigatório?`],
        rows: [
          [`Foto enviada para identificação`, `A foto da planta, inseto, cogumelo, peixe ou pássaro que você tirou`, `Sim, apenas para usar a identificação por foto (processada e descartada — seção 5)`],
          [`Gravação de áudio (só na versão web)`, `O canto de pássaro que você gravou`, `Sim, apenas para usar a identificação por som (processada no nosso servidor — seção 5)`],
          [`Localização aproximada (~1 km)`, `Região onde a foto foi tirada, com coordenadas arredondadas no seu aparelho`, `Não — opcional, desligável no Perfil; nunca armazenada por nós`],
          [`Identificador anônimo do aparelho`, `Um código aleatório (device_id), sem vínculo com seu nome`, `Sim — gerado automaticamente para controlar o uso gratuito e restaurar assinatura`],
          [`E-mail`, `O e-mail usado no login de assinante`, `Não — só se você for assinante e optar por entrar na conta`],
          [`Token de notificação (push)`, `Código técnico que permite enviar notificações ao seu aparelho`, `Não — só se você ativar notificações`],
          [`Mensagens do chat da especialista e textos do botão Traduzir`, `A pergunta que você fez sobre uma espécie`, `Não — só se você usar esses recursos (processadas e descartadas — seção 5)`],
          [`Dados de texto da coleção sincronizada`, `Nome da espécie, anotações e datas (nunca as fotos)`, `Não — só assinante que faz login e sincroniza`],
          [`Analytics do site (só na versão web)`, `Páginas visitadas e origem da visita, via Google Tag Manager e Utmify`, `Só existe na versão web; o app Android não tem nenhum analytics ou rastreador`],
        ],
      },
      { type: 'p', text: `Suas fotos ficam no seu aparelho. A coleção salva localmente nunca é compartilhada com outros usuários. O pagamento de assinatura acontece somente no site, processado pela Hotmart (preços exibidos em dólar americano); no app Android nada é vendido.` },
    ],
  },
  {
    heading: `3. Para que usamos e bases legais`,
    blocks: [
      { type: 'p', text: `Cada finalidade tem uma base legal na LGPD (art. 7º) e no GDPR (art. 6):` },
      {
        type: 'table',
        headers: [`Finalidade`, `Base legal (LGPD / GDPR)`],
        rows: [
          [`Identificar a espécie a partir da sua foto ou gravação`, `Execução de contrato — é o serviço que você pediu`],
          [`Melhorar a precisão da identificação com a localização aproximada`, `Consentimento — você ativa e desativa no Perfil`],
          [`Controlar o uso gratuito por categoria (identificador anônimo)`, `Legítimo interesse — impedir abuso do plano gratuito, com dado anônimo e de baixo risco`],
          [`Reconhecer sua assinatura e restaurar seu acesso (e-mail e status vindos da Hotmart)`, `Execução de contrato`],
          [`Sincronizar os dados de texto da sua coleção entre aparelhos`, `Execução de contrato — recurso de assinante que você aciona ao fazer login`],
          [`Enviar notificações push`, `Consentimento — só se você ativar`],
          [`Responder no chat da especialista e traduzir descrições`, `Execução de contrato`],
          [`Medir visitas e assinaturas no site (só web)`, `Legítimo interesse (LGPD) / Consentimento quando exigido (GDPR)`],
          [`Manter a segurança do serviço e prevenir fraude`, `Legítimo interesse`],
        ],
      },
      { type: 'p', text: `Não usamos seus dados para publicidade, não criamos perfis de comportamento e não tomamos decisões automatizadas com efeito jurídico sobre você.` },
    ],
  },
  {
    heading: `4. Com quem compartilhamos (operadores)`,
    blocks: [
      { type: 'p', text: `Não vendemos dados pessoais a ninguém. Compartilhamos apenas com os operadores abaixo, cada um estritamente para a função indicada:` },
      {
        type: 'table',
        headers: [`Operador`, `Papel`, `O que recebe`],
        rows: [
          [`Kindwise`, `Identificação de plantas, árvores, insetos, cogumelos e lavouras`, `A foto (e a localização aproximada, se ativada) — processamento efêmero`],
          [`Fishial`, `Identificação de peixes`, `A foto — processamento efêmero`],
          [`Nyckel`, `Identificação de pássaros`, `A foto — processamento efêmero`],
          [`Anthropic`, `Chat da especialista e botão Traduzir`, `O texto das mensagens ou o texto a traduzir — processamento efêmero`],
          [`Supabase`, `Banco de dados e autenticação`, `E-mail de assinante logado, identificador anônimo, dados de texto da coleção sincronizada, token de push`],
          [`Vercel`, `Hospedagem do site e das funções de servidor`, `Tráfego de rede necessário para servir o app e o site`],
          [`Hotmart`, `Venda e cobrança da assinatura (somente no site)`, `Seu e-mail e dados de pagamento, coletados diretamente por ela; nós recebemos de volta o status da assinatura e o e-mail`],
          [`Google Tag Manager (só web)`, `Analytics do site`, `Eventos de navegação no site — não existe no app Android`],
          [`Utmify (só web)`, `Atribuição de campanhas do site`, `Eventos de visita e assinatura no site — não existe no app Android`],
        ],
      },
      { type: 'p', text: `Para exibir a foto de referência e a descrição de uma espécie, o app também consulta a Wikipédia pelo nome científico: a Wikipédia vê qual espécie foi consultada, mas não quem você é.` },
      { type: 'p', text: `Para desenhar o mapa de distribuição e o gráfico de estação, o app consulta o GBIF (Global Biodiversity Information Facility) pelo nome científico da espécie. Isso acontece para todo usuário, com ou sem assinatura: o GBIF vê qual espécie foi consultada, mas não quem você é — nenhum identificador seu, nenhuma foto e nenhuma localização são enviados.` },
      { type: 'p', text: `O áudio da identificação por som não vai a nenhum terceiro: é processado no nosso próprio servidor (modelo Perch, só na versão web).` },
    ],
  },
  {
    heading: `5. Processamento efêmero de fotos e áudio`,
    blocks: [
      { type: 'p', text: `Fotos: quando você tira ou envia uma foto, ela é transmitida ao serviço de identificação correspondente apenas para gerar o resultado. Não armazenamos suas fotos em nenhum servidor sob nosso controle — elas existem no servidor apenas durante o processamento e permanecem guardadas somente no seu aparelho. Mesmo assinantes que sincronizam a coleção enviam apenas os dados de texto (nome da espécie, anotações, datas), nunca as fotos.` },
      { type: 'p', text: `Áudio: a gravação de som (recurso da versão web) é processada no nosso próprio servidor apenas para gerar a identificação e não é compartilhada com terceiros nem retida após o processamento.` },
      { type: 'p', text: `Localização: quando ativada, as coordenadas são arredondadas para cerca de 1 km ainda no seu aparelho — o suficiente para situar uma espécie, insuficiente para identificar um endereço — e nunca são armazenadas por nós.` },
      { type: 'p', text: `Chat e tradução: os textos enviados à Anthropic servem apenas para gerar a resposta ou a tradução daquele momento.` },
    ],
  },
  {
    heading: `6. Retenção`,
    blocks: [
      { type: 'li', text: `Fotos e áudio: não retidos em nossos servidores (seção 5).` },
      { type: 'li', text: `Localização aproximada: nunca armazenada.` },
      { type: 'li', text: `Identificador anônimo e contadores de uso gratuito: mantidos enquanto necessários para operar o plano gratuito; apagados quando você exclui a conta.` },
      { type: 'li', text: `Dados de conta de assinante (e-mail, dados de texto da coleção sincronizada, token de push): mantidos enquanto a conta existir; apagados na exclusão da conta (seção 7).` },
      { type: 'li', text: `Coleção local: fica só no seu aparelho. Se você limpar os dados do navegador ou desinstalar o app sem ser assinante sincronizado, ela é perdida permanentemente — nada é copiado remotamente.` },
      { type: 'li', text: `Registros de pagamento: mantidos pela Hotmart conforme as políticas dela e as obrigações fiscais aplicáveis.` },
      { type: 'li', text: `Analytics do site (só web): retidos conforme a configuração das ferramentas (Google Tag Manager e Utmify).` },
    ],
  },
  {
    heading: `7. Seus direitos e como exercê-los`,
    blocks: [
      { type: 'p', text: `A LGPD (art. 18) e o GDPR (arts. 15 a 21) garantem a você, entre outros: confirmação de tratamento, acesso, correção, anonimização, portabilidade, exclusão, informação sobre compartilhamentos, revogação do consentimento e oposição a tratamentos baseados em legítimo interesse.` },
      { type: 'p', text: `Como quase tudo fica no seu aparelho, a maior parte dos direitos você exerce diretamente:` },
      { type: 'li', text: `Excluir a conta e os dados no servidor: no app, em Perfil > Configurações > Conta > Excluir conta, ou pela página naturelensapp.cloud/account-deletion.html. A exclusão apaga a conta, o vínculo da assinatura, a coleção sincronizada, o token de push e os contadores de uso.` },
      { type: 'li', text: `Atenção: excluir a conta não cancela a cobrança da assinatura na Hotmart. Para parar de pagar, cancele em consumer.hotmart.com.` },
      { type: 'li', text: `Revogar a localização: desligue no Perfil, a qualquer momento; a identificação continua funcionando.` },
      { type: 'li', text: `Revogar notificações: desative nas configurações do app ou do sistema.` },
      { type: 'li', text: `Acesso e correção da coleção: seus dados estão visíveis e editáveis dentro do próprio app.` },
      { type: 'li', text: `Dados que não temos: se você não é assinante logado, não temos nada que identifique você — apagar os dados do aparelho (ou desinstalar) remove tudo.` },
      { type: 'p', text: `Titulares no Brasil podem ainda peticionar à Autoridade Nacional de Proteção de Dados (ANPD); titulares na União Europeia, à autoridade de proteção de dados do seu país.` },
    ],
  },
  {
    heading: `8. Crianças`,
    blocks: [
      { type: 'p', text: `O NatureLens não é dirigido a menores de 13 anos e não coletamos conscientemente dados de crianças. O app não exige conta nem coleta identificadores pessoais no uso comum. Se um responsável acredita que uma criança criou uma conta de assinante, pode excluí-la pelos canais da seção 7.` },
    ],
  },
  {
    heading: `9. Segurança`,
    blocks: [
      { type: 'li', text: `Todo o tráfego entre o app, o site e os servidores usa HTTPS (criptografia em trânsito).` },
      { type: 'li', text: `O banco de dados usa Row Level Security (RLS) no Supabase: cada usuário só consegue acessar os próprios registros.` },
      { type: 'li', text: `A melhor proteção é estrutural: não guardamos fotos, não guardamos localização e não temos conta para a maioria dos usuários — o que não é coletado não pode vazar.` },
    ],
  },
  {
    heading: `10. Transferências internacionais`,
    blocks: [
      { type: 'p', text: `Os operadores listados na seção 4 estão total ou parcialmente localizados fora do Brasil (por exemplo, nos Estados Unidos e na Europa). Ao usar o app, seus dados podem ser processados nesses países. Essas transferências se apoiam nas garantias contratuais e nos mecanismos de conformidade oferecidos por cada operador (como cláusulas contratuais padrão), e limitamos o que cada um recebe ao mínimo descrito nesta política.` },
    ],
  },
  {
    heading: `11. Mudanças nesta política`,
    blocks: [
      { type: 'p', text: `Podemos atualizar esta política para refletir mudanças no app ou na legislação. A versão vigente fica sempre nesta página, com a data de vigência no topo e no rodapé. Mudanças relevantes serão sinalizadas no app ou no site antes de entrarem em vigor.` },
    ],
  },
  {
    heading: `12. Contato`,
    blocks: [
      { type: 'p', text: `O NatureLens é mantido por um desenvolvedor independente. Os canais para dúvidas e solicitações sobre privacidade são:` },
      { type: 'li', text: `O site oficial: naturelensapp.cloud` },
      { type: 'li', text: `A página de exclusão de conta: naturelensapp.cloud/account-deletion.html` },
      { type: 'li', text: `As configurações dentro do próprio app (Perfil > Configurações)` },
      { type: 'p', text: `Última atualização: 19 de agosto de 2026.` },
    ],
  },
];

export const privacyEn = [
  {
    heading: `Privacy Policy — NatureLens`,
    blocks: [
      { type: 'p', text: `Effective August 19, 2026 · naturelensapp.cloud` },
      { type: 'p', text: `NatureLens identifies plants, trees, insects, mushrooms, crops, fish and birds from photos, and animal sounds from recordings (web version). This policy explains, honestly, what we collect, why, who we share it with, and how you exercise your rights, under Brazil's General Data Protection Law (LGPD, Law 13,709/2018) and the EU General Data Protection Regulation (GDPR).` },
      { type: 'p', text: `Important notice: AI identification can be wrong. Never eat a mushroom, plant or herb based on the app alone. Content about herbs and traditional uses is educational and is not medical advice.` },
    ],
  },
  {
    heading: `1. Who we are`,
    blocks: [
      { type: 'p', text: `NatureLens is built and maintained by an independent developer, who is the controller of the data described in this policy under the LGPD and the GDPR. The official website is naturelensapp.cloud.` },
      { type: 'p', text: `Our principle is to collect as little as possible: the app works without an account, shows no ads, sells no personal data, and contains no advertising trackers in the Android app.` },
    ],
  },
  {
    heading: `2. Data we collect`,
    blocks: [
      { type: 'p', text: `We collect only what each feature needs. Nothing beyond the list below.` },
      {
        type: 'table',
        headers: [`Category`, `Example`, `Required?`],
        rows: [
          [`Photo submitted for identification`, `The photo you took of a plant, insect, mushroom, fish or bird`, `Yes, only to use photo identification (processed and discarded — section 5)`],
          [`Audio recording (web version only)`, `The bird call you recorded`, `Yes, only to use sound identification (processed on our own server — section 5)`],
          [`Approximate location (~1 km)`, `The region where the photo was taken, with coordinates rounded on your device`, `No — optional, can be turned off in Profile; never stored by us`],
          [`Anonymous device identifier`, `A random code (device_id), not linked to your name`, `Yes — generated automatically to manage free usage and restore subscriptions`],
          [`Email`, `The email used for subscriber sign-in`, `No — only if you are a subscriber and choose to sign in`],
          [`Push notification token`, `Technical code that lets us send notifications to your device`, `No — only if you enable notifications`],
          [`Specialist chat messages and Translate button texts`, `The question you asked about a species`, `No — only if you use those features (processed and discarded — section 5)`],
          [`Text data of the synced collection`, `Species name, notes and dates (never your photos)`, `No — only subscribers who sign in and sync`],
          [`Website analytics (web version only)`, `Pages visited and visit source, via Google Tag Manager and Utmify`, `Only exists on the web version; the Android app has no analytics or trackers`],
        ],
      },
      { type: 'p', text: `Your photos stay on your device. Your locally saved collection is never shared with other users. Subscription payments happen only on the website, processed by Hotmart (prices shown in US dollars); nothing is sold inside the Android app.` },
    ],
  },
  {
    heading: `3. Why we use it and legal bases`,
    blocks: [
      { type: 'p', text: `Each purpose has a legal basis under the LGPD (art. 7) and the GDPR (art. 6):` },
      {
        type: 'table',
        headers: [`Purpose`, `Legal basis (LGPD / GDPR)`],
        rows: [
          [`Identify the species from your photo or recording`, `Performance of a contract — it is the service you requested`],
          [`Improve identification accuracy with approximate location`, `Consent — you turn it on and off in Profile`],
          [`Manage free usage per category (anonymous identifier)`, `Legitimate interest — preventing abuse of the free tier, using anonymous, low-risk data`],
          [`Recognize your subscription and restore your access (email and status from Hotmart)`, `Performance of a contract`],
          [`Sync your collection's text data across devices`, `Performance of a contract — a subscriber feature you trigger by signing in`],
          [`Send push notifications`, `Consent — only if you enable them`],
          [`Answer in the specialist chat and translate descriptions`, `Performance of a contract`],
          [`Measure website visits and subscriptions (web only)`, `Legitimate interest (LGPD) / Consent where required (GDPR)`],
          [`Keep the service secure and prevent fraud`, `Legitimate interest`],
        ],
      },
      { type: 'p', text: `We do not use your data for advertising, we do not build behavioral profiles, and we make no automated decisions with legal effect about you.` },
    ],
  },
  {
    heading: `4. Who we share it with (processors)`,
    blocks: [
      { type: 'p', text: `We sell personal data to no one. We share only with the processors below, each strictly for the role stated:` },
      {
        type: 'table',
        headers: [`Processor`, `Role`, `What it receives`],
        rows: [
          [`Kindwise`, `Identification of plants, trees, insects, mushrooms and crops`, `The photo (and approximate location, if enabled) — ephemeral processing`],
          [`Fishial`, `Fish identification`, `The photo — ephemeral processing`],
          [`Nyckel`, `Bird identification`, `The photo — ephemeral processing`],
          [`Anthropic`, `Specialist chat and Translate button`, `The message text or the text to translate — ephemeral processing`],
          [`Supabase`, `Database and authentication`, `Signed-in subscriber email, anonymous identifier, synced collection text data, push token`],
          [`Vercel`, `Hosting of the website and server functions`, `Network traffic needed to serve the app and website`],
          [`Hotmart`, `Subscription sale and billing (website only)`, `Your email and payment details, collected directly by Hotmart; we receive back the subscription status and email`],
          [`Google Tag Manager (web only)`, `Website analytics`, `Browsing events on the website — does not exist in the Android app`],
          [`Utmify (web only)`, `Website campaign attribution`, `Visit and subscription events on the website — does not exist in the Android app`],
        ],
      },
      { type: 'p', text: `To show a reference picture and species description, the app also queries Wikipedia by scientific name: Wikipedia sees which species was looked up, but not who you are.` },
      { type: 'p', text: `To draw the distribution map and the seasonal chart, the app queries GBIF (the Global Biodiversity Information Facility) by the species' scientific name. This happens for every user, subscriber or not: GBIF sees which species was looked up, but not who you are — none of your identifiers, photos or location are sent.` },
      { type: 'p', text: `Sound identification audio never reaches a third party: it is processed on our own server (Perch model, web version only).` },
    ],
  },
  {
    heading: `5. Ephemeral processing of photos and audio`,
    blocks: [
      { type: 'p', text: `Photos: when you take or upload a photo, it is transmitted to the matching identification service only to produce the result. We do not store your photos on any server we control — they exist on the server only during processing and remain stored only on your device. Even subscribers who sync their collection upload only text data (species name, notes, dates), never the photos.` },
      { type: 'p', text: `Audio: the sound recording (a web-version feature) is processed on our own server only to produce the identification and is neither shared with third parties nor retained after processing.` },
      { type: 'p', text: `Location: when enabled, coordinates are rounded to about 1 km on your device — enough to place a species, not enough to identify an address — and are never stored by us.` },
      { type: 'p', text: `Chat and translation: texts sent to Anthropic are used only to generate that moment's answer or translation.` },
    ],
  },
  {
    heading: `6. Retention`,
    blocks: [
      { type: 'li', text: `Photos and audio: not retained on our servers (section 5).` },
      { type: 'li', text: `Approximate location: never stored.` },
      { type: 'li', text: `Anonymous identifier and free-usage counters: kept as long as needed to operate the free tier; deleted when you delete your account.` },
      { type: 'li', text: `Subscriber account data (email, synced collection text data, push token): kept while the account exists; deleted upon account deletion (section 7).` },
      { type: 'li', text: `Local collection: lives only on your device. If you clear browser data or uninstall the app without being a synced subscriber, it is permanently lost — nothing is backed up remotely.` },
      { type: 'li', text: `Payment records: kept by Hotmart under its own policies and applicable tax obligations.` },
      { type: 'li', text: `Website analytics (web only): retained per the tools' configuration (Google Tag Manager and Utmify).` },
    ],
  },
  {
    heading: `7. Your rights and how to exercise them`,
    blocks: [
      { type: 'p', text: `The LGPD (art. 18) and the GDPR (arts. 15–21) grant you, among others: confirmation of processing, access, correction, anonymization, portability, deletion, information about sharing, withdrawal of consent, and objection to processing based on legitimate interest.` },
      { type: 'p', text: `Because almost everything stays on your device, you exercise most rights directly:` },
      { type: 'li', text: `Delete your account and server-side data: in the app, under Profile > Settings > Account > Delete account, or via naturelensapp.cloud/account-deletion.html. Deletion erases the account, the linked subscription record, the synced collection, the push token and the usage counters.` },
      { type: 'li', text: `Note: deleting the account does not cancel the subscription billing at Hotmart. To stop payments, cancel at consumer.hotmart.com.` },
      { type: 'li', text: `Withdraw location consent: turn it off in Profile at any time; identification keeps working.` },
      { type: 'li', text: `Withdraw notifications: disable them in the app or system settings.` },
      { type: 'li', text: `Access and correct your collection: your data is visible and editable inside the app itself.` },
      { type: 'li', text: `Data we do not have: if you are not a signed-in subscriber, we hold nothing that identifies you — clearing the device data (or uninstalling) removes everything.` },
      { type: 'p', text: `Data subjects in Brazil may also petition the national authority (ANPD); data subjects in the EU, their national data protection authority.` },
    ],
  },
  {
    heading: `8. Children`,
    blocks: [
      { type: 'p', text: `NatureLens is not directed at children under 13 and we do not knowingly collect data from children. The app requires no account and collects no personal identifiers in ordinary use. If a guardian believes a child created a subscriber account, it can be deleted through the channels in section 7.` },
    ],
  },
  {
    heading: `9. Security`,
    blocks: [
      { type: 'li', text: `All traffic between the app, the website and the servers uses HTTPS (encryption in transit).` },
      { type: 'li', text: `The database uses Row Level Security (RLS) on Supabase: each user can only access their own records.` },
      { type: 'li', text: `The best protection is structural: we store no photos, we store no location, and most users have no account — what is not collected cannot leak.` },
    ],
  },
  {
    heading: `10. International transfers`,
    blocks: [
      { type: 'p', text: `The processors listed in section 4 are fully or partly located outside Brazil (for example, in the United States and Europe). By using the app, your data may be processed in those countries. These transfers rely on the contractual safeguards and compliance mechanisms each processor offers (such as standard contractual clauses), and we limit what each one receives to the minimum described in this policy.` },
    ],
  },
  {
    heading: `11. Changes to this policy`,
    blocks: [
      { type: 'p', text: `We may update this policy to reflect changes in the app or in the law. The current version always lives on this page, with the effective date at the top and in the footer. Material changes will be signaled in the app or on the website before taking effect.` },
    ],
  },
  {
    heading: `12. Contact`,
    blocks: [
      { type: 'p', text: `NatureLens is maintained by an independent developer. The channels for privacy questions and requests are:` },
      { type: 'li', text: `The official website: naturelensapp.cloud` },
      { type: 'li', text: `The account deletion page: naturelensapp.cloud/account-deletion.html` },
      { type: 'li', text: `The settings inside the app itself (Profile > Settings)` },
      { type: 'p', text: `Last updated: August 19, 2026.` },
    ],
  },
];

export const termsPt = [
  {
    heading: `Termos de Uso`,
    blocks: [
      { type: 'p', text: `NatureLens (naturelensapp.cloud) — vigentes a partir de 19 de agosto de 2026.` },
      { type: 'p', text: `Estes Termos de Uso ("Termos") regem o uso do aplicativo e do site NatureLens ("Serviço"), operados pelo desenvolvedor independente do NatureLens ("nós"). Leia com atenção — em especial a Seção 10, que contém um aviso crítico de segurança.` },
    ],
  },
  {
    heading: `1. Aceitação dos Termos`,
    blocks: [
      { type: 'p', text: `Ao instalar, acessar ou usar o NatureLens, você declara que leu, entendeu e concorda em ficar vinculado a estes Termos e à nossa Política de Privacidade. Se você não concordar com qualquer parte destes Termos, não use o Serviço. O uso continuado após qualquer atualização dos Termos constitui aceitação da versão atualizada.` },
    ],
  },
  {
    heading: `2. O Serviço`,
    blocks: [
      { type: 'p', text: `O NatureLens permite identificar elementos da natureza a partir de fotos e, na versão web, de sons. As funcionalidades incluem:` },
      { type: 'li', text: `Identificação por foto: plantas, árvores, insetos, cogumelos e lavouras (processadas pelo serviço Kindwise), peixes (Fishial) e pássaros (Nyckel). A foto é enviada ao serviço de identificação correspondente apenas para gerar o resultado, em processamento efêmero — ela não é armazenada em servidor nosso.` },
      { type: 'li', text: `Identificação de sons (somente na versão web): o áudio é processado em servidor próprio com o modelo Perch.` },
      { type: 'li', text: `Guia e conteúdo educacional: fichas de espécies e conteúdo educacional, incluindo informações sobre ervas (veja as Seções 10 e 11).` },
      { type: 'li', text: `Chat com especialista de IA e botão Traduzir: suas mensagens e os textos enviados para tradução são processados via Anthropic, de forma efêmera, apenas para gerar a resposta.` },
      { type: 'li', text: `Coleção: suas identificações ficam salvas no seu aparelho. Assinantes logados podem sincronizar os dados de texto da coleção (nunca as fotos) com o servidor.` },
      { type: 'p', text: `Os resultados de identificação são gerados automaticamente por inteligência artificial e não passam por revisão de especialista humano. O Serviço não exibe anúncios e não vende seus dados.` },
    ],
  },
  {
    heading: `3. Elegibilidade`,
    blocks: [
      { type: 'p', text: `O Serviço não é dirigido a menores de 13 anos. Ao usar o NatureLens, você declara ter pelo menos 13 anos de idade (ou a idade mínima equivalente exigida na sua jurisdição) ou usar o Serviço sob supervisão de um responsável legal que aceite estes Termos em seu nome.` },
    ],
  },
  {
    heading: `4. Conta e acesso de assinante`,
    blocks: [
      { type: 'p', text: `Não é necessário criar conta para usar os recursos gratuitos. Assinantes podem, opcionalmente, fazer login (via Supabase) para vincular a assinatura e sincronizar os dados de texto da coleção entre aparelhos. Nesse caso, coletamos apenas o e-mail do assinante para essa finalidade. Você é responsável por manter suas credenciais seguras e por toda atividade realizada através da sua conta. Notifique-nos pelos canais da Seção 18 se suspeitar de uso não autorizado.` },
    ],
  },
  {
    heading: `5. Assinatura, cobrança e cancelamento`,
    blocks: [
      { type: 'p', text: `A assinatura paga é vendida exclusivamente no site (versão web), com cobrança processada pela plataforma Hotmart, pelo preço em dólares americanos (USD) exibido no momento da contratação. No aplicativo Android nada é vendido.` },
      { type: 'li', text: `Renovação automática: a assinatura renova automaticamente ao fim de cada período até que você cancele.` },
      { type: 'li', text: `Cancelamento: o cancelamento da cobrança é feito diretamente na Hotmart, em consumer.hotmart.com. Após cancelar, seu acesso continua até o fim do período já pago.` },
      { type: 'li', text: `Reembolso: não oferecemos reembolso proporcional por tempo não utilizado, exceto quando exigido por lei aplicável (incluindo o direito de arrependimento previsto no Código de Defesa do Consumidor, quando cabível).` },
      { type: 'li', text: `Lojas de aplicativos: se, no futuro, a assinatura for oferecida dentro de uma loja de aplicativos, a cobrança será processada pelo sistema de pagamento da própria loja, sujeita também aos termos da loja.` },
      { type: 'li', text: `Importante: excluir sua conta no app não cancela a cobrança recorrente da Hotmart — o cancelamento deve ser feito em consumer.hotmart.com (veja a Seção 16).` },
    ],
  },
  {
    heading: `6. Licença limitada de uso`,
    blocks: [
      { type: 'p', text: `Concedemos a você uma licença limitada, pessoal, não exclusiva, intransferível e revogável para instalar e usar o NatureLens em dispositivos que você possua ou controle, exclusivamente para fins pessoais e não comerciais, conforme estes Termos. Todos os direitos não expressamente concedidos permanecem reservados a nós e aos nossos licenciantes.` },
    ],
  },
  {
    heading: `7. Restrições de uso`,
    blocks: [
      { type: 'p', text: `Você concorda em não:` },
      { type: 'li', text: `Copiar, modificar, distribuir, vender, alugar, sublicenciar ou revender o Serviço ou qualquer parte dele;` },
      { type: 'li', text: `Fazer engenharia reversa, descompilar, desmontar ou tentar extrair o código-fonte do Serviço, salvo na medida em que a lei aplicável proíba essa restrição;` },
      { type: 'li', text: `Usar scraping, robôs, scripts ou qualquer meio automatizado para acessar o Serviço ou extrair dados dele;` },
      { type: 'li', text: `Contornar, desativar ou interferir em recursos de segurança ou limites técnicos do Serviço;` },
      { type: 'li', text: `Usar o Serviço para fim ilegal, ou de forma que sobrecarregue ou prejudique a infraestrutura do Serviço ou de terceiros;` },
      { type: 'li', text: `Usar o Serviço para criar produto ou serviço concorrente, ou revender resultados de identificação como se fossem serviço próprio.` },
    ],
  },
  {
    heading: `8. Conteúdo do usuário`,
    blocks: [
      { type: 'p', text: `As fotos que você tira ou envia permanecem suas e ficam armazenadas no seu aparelho. Elas são transmitidas aos serviços de identificação descritos na Seção 2 apenas para gerar o resultado, em processamento efêmero, e não são armazenadas em servidor nosso.` },
      { type: 'p', text: `Se você for assinante logado, os dados de texto da sua coleção (nomes, notas, datas — nunca as fotos) são sincronizados com o servidor para que a coleção acompanhe você entre aparelhos.` },
      { type: 'p', text: `Você nos concede apenas a licença mínima necessária para operar o Serviço: transmitir suas fotos e áudios aos provedores de identificação para gerar o resultado que você pediu, e armazenar e sincronizar os dados de texto da coleção de assinante. Nada além disso. Não reivindicamos propriedade sobre o seu conteúdo, não adquirimos licença perpétua ou irrevogável sobre ele, e não o usamos para publicidade nem o vendemos a terceiros. A licença termina quando você exclui o conteúdo ou a conta, ressalvadas cópias de backup transitórias eliminadas em ciclo normal.` },
      { type: 'p', text: `Você declara ter os direitos necessários sobre o conteúdo que enviar e que ele não viola direitos de terceiros nem lei aplicável.` },
    ],
  },
  {
    heading: `9. Conteúdo de terceiros`,
    blocks: [
      { type: 'p', text: `O Serviço exibe conteúdo informativo de fontes de terceiros, incluindo textos e imagens da Wikipedia e do Wikimedia Commons, com o devido crédito e sob as licenças aplicáveis dessas fontes. Esse conteúdo pertence aos seus respectivos autores e licenciantes. Não nos responsabilizamos pela exatidão de conteúdo de terceiros e não endossamos as fontes citadas.` },
    ],
  },
  {
    heading: `10. Aviso crítico de segurança`,
    blocks: [
      { type: 'p', text: `A IDENTIFICAÇÃO GERADA POR INTELIGÊNCIA ARTIFICIAL PODE ERRAR — INCLUSIVE SOBRE SE UMA ESPÉCIE É COMESTÍVEL, VENENOSA OU SEGURA AO TOQUE.` },
      { type: 'p', text: `NUNCA USE O RESULTADO DESTE APP COMO BASE PARA COMER, COLHER, TOCAR OU USAR QUALQUER PLANTA, COGUMELO OU FUNGO. ESPÉCIES TÓXICAS E LETAIS PODEM SER VISUALMENTE QUASE IDÊNTICAS A ESPÉCIES SEGURAS.` },
      { type: 'p', text: `O NATURELENS NÃO FORNECE CONSELHO MÉDICO, VETERINÁRIO, NUTRICIONAL OU DE SEGURANÇA. SEMPRE CONFIRME COM UM ESPECIALISTA QUALIFICADO (MICOLOGISTA, BOTÂNICO, MÉDICO, VETERINÁRIO OU CENTRO DE CONTROLE DE INTOXICAÇÕES) ANTES DE CONSUMIR, MANUSEAR OU USAR QUALQUER COISA ENCONTRADA NA NATUREZA.` },
      { type: 'p', text: `EM CASO DE SUSPEITA DE INTOXICAÇÃO, PROCURE ATENDIMENTO MÉDICO DE EMERGÊNCIA IMEDIATAMENTE.` },
      { type: 'p', text: `Ao usar o Serviço, você reconhece esse risco e concorda que qualquer decisão tomada com base em um resultado de identificação é de sua exclusiva responsabilidade.` },
    ],
  },
  {
    heading: `11. Conteúdo educacional sobre ervas`,
    blocks: [
      { type: 'p', text: `O Serviço inclui conteúdo educacional sobre ervas e usos tradicionais de plantas. Esse conteúdo tem finalidade exclusivamente informativa e cultural. Ele não é conselho médico, não substitui consulta com profissional de saúde e não deve ser usado para diagnosticar, tratar, curar ou prevenir qualquer doença. Consulte sempre um médico antes de usar qualquer planta com finalidade terapêutica. Aplica-se integralmente o aviso da Seção 10.` },
    ],
  },
  {
    heading: `12. Isenção de garantias`,
    blocks: [
      { type: 'p', text: `O SERVIÇO É FORNECIDO "NO ESTADO EM QUE SE ENCONTRA" E "CONFORME DISPONÍVEL", SEM GARANTIAS DE QUALQUER NATUREZA, EXPRESSAS OU IMPLÍCITAS, INCLUINDO, SEM LIMITAÇÃO, GARANTIAS DE COMERCIALIZAÇÃO, ADEQUAÇÃO A UM FIM ESPECÍFICO, PRECISÃO DOS RESULTADOS DE IDENTIFICAÇÃO, DISPONIBILIDADE ININTERRUPTA OU AUSÊNCIA DE ERROS. NÃO GARANTIMOS QUE QUALQUER RESULTADO DE IDENTIFICAÇÃO ESTEJA CORRETO. NADA NESTA SEÇÃO EXCLUI GARANTIAS QUE NÃO POSSAM SER EXCLUÍDAS PELA LEI APLICÁVEL, INCLUINDO AS GARANTIAS LEGAIS DO CÓDIGO DE DEFESA DO CONSUMIDOR QUANDO APLICÁVEIS.` },
    ],
  },
  {
    heading: `13. Limitação de responsabilidade`,
    blocks: [
      { type: 'p', text: `NA MÁXIMA EXTENSÃO PERMITIDA PELA LEI APLICÁVEL, NÓS NÃO SEREMOS RESPONSÁVEIS POR DANOS INDIRETOS, INCIDENTAIS, ESPECIAIS, CONSEQUENCIAIS OU PUNITIVOS, NEM POR PERDA DE LUCROS, DADOS OU OPORTUNIDADES, DECORRENTES DO USO OU DA IMPOSSIBILIDADE DE USO DO SERVIÇO — INCLUINDO, SEM LIMITAÇÃO, DANOS À SAÚDE OU À PROPRIEDADE RESULTANTES DE CONFIANÇA EM QUALQUER RESULTADO DE IDENTIFICAÇÃO OU CONTEÚDO DO SERVIÇO. NA MÁXIMA EXTENSÃO PERMITIDA POR LEI, NOSSA RESPONSABILIDADE TOTAL AGREGADA FICA LIMITADA AO VALOR QUE VOCÊ PAGOU PELO SERVIÇO NOS 12 (DOZE) MESES ANTERIORES AO EVENTO QUE DEU ORIGEM À RECLAMAÇÃO, OU, SE NADA FOI PAGO, A ZERO. ESTA LIMITAÇÃO NÃO SE APLICA A RESPONSABILIDADES QUE A LEI APLICÁVEL NÃO PERMITA LIMITAR, INCLUINDO DIREITOS IRRENUNCIÁVEIS DO CONSUMIDOR SOB A LEI BRASILEIRA.` },
    ],
  },
  {
    heading: `14. Indenização`,
    blocks: [
      { type: 'p', text: `Você concorda em nos indenizar e isentar de responsabilidade por quaisquer reclamações, perdas, danos e despesas razoáveis (incluindo honorários advocatícios) decorrentes de: (a) seu uso do Serviço em violação destes Termos; (b) conteúdo que você enviar em violação de direitos de terceiros; ou (c) violação de lei aplicável por você no uso do Serviço.` },
    ],
  },
  {
    heading: `15. Alterações do Serviço e dos Termos`,
    blocks: [
      { type: 'p', text: `Podemos modificar, suspender ou descontinuar o Serviço, no todo ou em parte, a qualquer momento, inclusive recursos gratuitos ou pagos, mediante aviso quando exigido por lei. Podemos também atualizar estes Termos periodicamente; a versão vigente estará sempre disponível nesta página, com a data de vigência indicada. Mudanças materiais serão sinalizadas por meios razoáveis. O uso continuado do Serviço após a vigência de uma alteração constitui aceitação dos Termos atualizados.` },
    ],
  },
  {
    heading: `16. Rescisão`,
    blocks: [
      { type: 'p', text: `Você pode encerrar esta relação a qualquer momento excluindo sua conta no app (Perfil > Configurações > Conta > Excluir conta) ou pela página naturelensapp.cloud/account-deletion.html, e desinstalando o aplicativo. A exclusão da conta apaga a conta, a assinatura vinculada no nosso sistema, a coleção sincronizada, o token de push e os contadores. A exclusão da conta não cancela a cobrança recorrente da Hotmart — para interromper a cobrança, cancele em consumer.hotmart.com.` },
      { type: 'p', text: `Podemos suspender ou encerrar seu acesso ao Serviço, com efeito imediato, se você violar estes Termos, se formos obrigados por lei, ou se o Serviço for descontinuado. As seções que por sua natureza devam sobreviver (incluindo 8 a 14 e 17) permanecem em vigor após a rescisão.` },
    ],
  },
  {
    heading: `17. Lei aplicável e foro`,
    blocks: [
      { type: 'p', text: `Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor no Brasil para dirimir controvérsias decorrentes destes Termos, quando a relação for de consumo; nos demais casos, o foro da comarca do responsável pelo Serviço, com renúncia a qualquer outro. Se qualquer disposição destes Termos for considerada inválida, as demais permanecem em pleno vigor.` },
    ],
  },
  {
    heading: `18. Contato`,
    blocks: [
      { type: 'p', text: `O responsável pelo Serviço é o desenvolvedor independente do NatureLens (naturelensapp.cloud). Os canais disponíveis são o próprio aplicativo e a página naturelensapp.cloud/account-deletion.html (para exclusão de conta e dados). Não mantemos canal de suporte por e-mail.` },
      { type: 'p', text: `Última atualização: 19 de agosto de 2026.` },
    ],
  },
];

export const termsEn = [
  {
    heading: `Terms of Use`,
    blocks: [
      { type: 'p', text: `NatureLens (naturelensapp.cloud) — effective August 19, 2026.` },
      { type: 'p', text: `These Terms of Use ("Terms") govern your use of the NatureLens app and website (the "Service"), operated by the independent developer of NatureLens ("we", "us"). Please read carefully — especially Section 10, which contains a critical safety notice.` },
    ],
  },
  {
    heading: `1. Acceptance of Terms`,
    blocks: [
      { type: 'p', text: `By installing, accessing, or using NatureLens, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree with any part of these Terms, do not use the Service. Continued use after any update to the Terms constitutes acceptance of the updated version.` },
    ],
  },
  {
    heading: `2. The Service`,
    blocks: [
      { type: 'p', text: `NatureLens identifies elements of nature from photos and, on the web version, from sounds. Features include:` },
      { type: 'li', text: `Photo identification: plants, trees, insects, mushrooms, and crops (processed by the Kindwise service), fish (Fishial), and birds (Nyckel). Your photo is sent to the corresponding identification service only to generate the result, in ephemeral processing — it is not stored on any server of ours.` },
      { type: 'li', text: `Sound identification (web version only): audio is processed on our own server using the Perch model.` },
      { type: 'li', text: `Guide and educational content: species entries and educational content, including information about herbs (see Sections 10 and 11).` },
      { type: 'li', text: `AI expert chat and Translate button: your messages and texts sent for translation are processed via Anthropic, ephemerally, solely to generate the response.` },
      { type: 'li', text: `Collection: your identifications are saved on your device. Logged-in subscribers may sync the text data of their collection (never photos) with the server.` },
      { type: 'p', text: `Identification results are generated automatically by artificial intelligence and are not reviewed by a human expert. The Service shows no ads and does not sell your data.` },
    ],
  },
  {
    heading: `3. Eligibility`,
    blocks: [
      { type: 'p', text: `The Service is not directed at children under 13. By using NatureLens, you confirm that you are at least 13 years old (or the equivalent minimum age required in your jurisdiction) or that you use the Service under the supervision of a legal guardian who accepts these Terms on your behalf.` },
    ],
  },
  {
    heading: `4. Account and subscriber access`,
    blocks: [
      { type: 'p', text: `No account is required to use the free features. Subscribers may optionally sign in (via Supabase) to link their subscription and sync the text data of their collection across devices. In that case, we collect only the subscriber's email for that purpose. You are responsible for keeping your credentials secure and for all activity under your account. Notify us through the channels in Section 18 if you suspect unauthorized use.` },
    ],
  },
  {
    heading: `5. Subscription, billing, and cancellation`,
    blocks: [
      { type: 'p', text: `The paid subscription is sold exclusively on the website (web version), with billing processed by the Hotmart platform, at the price in US dollars (USD) shown at the time of purchase. Nothing is sold inside the Android app.` },
      { type: 'li', text: `Automatic renewal: the subscription renews automatically at the end of each period until you cancel.` },
      { type: 'li', text: `Cancellation: billing is cancelled directly at Hotmart, at consumer.hotmart.com. After cancelling, your access continues until the end of the period you already paid for.` },
      { type: 'li', text: `Refunds: we do not offer prorated refunds for unused time, except where required by applicable law.` },
      { type: 'li', text: `App stores: if the subscription is ever offered inside an app store, billing will be processed through that store's own billing system and will also be subject to the store's terms.` },
      { type: 'li', text: `Important: deleting your account in the app does not cancel the recurring Hotmart charge — cancellation must be done at consumer.hotmart.com (see Section 16).` },
    ],
  },
  {
    heading: `6. Limited license`,
    blocks: [
      { type: 'p', text: `We grant you a limited, personal, non-exclusive, non-transferable, revocable license to install and use NatureLens on devices you own or control, solely for personal, non-commercial purposes, in accordance with these Terms. All rights not expressly granted are reserved to us and our licensors.` },
    ],
  },
  {
    heading: `7. Use restrictions`,
    blocks: [
      { type: 'p', text: `You agree not to:` },
      { type: 'li', text: `Copy, modify, distribute, sell, rent, sublicense, or resell the Service or any part of it;` },
      { type: 'li', text: `Reverse engineer, decompile, disassemble, or attempt to extract the source code of the Service, except to the extent applicable law prohibits this restriction;` },
      { type: 'li', text: `Use scraping, bots, scripts, or any automated means to access the Service or extract data from it;` },
      { type: 'li', text: `Circumvent, disable, or interfere with security features or technical limits of the Service;` },
      { type: 'li', text: `Use the Service for any unlawful purpose, or in a way that overloads or harms the Service's infrastructure or third parties;` },
      { type: 'li', text: `Use the Service to build a competing product or service, or resell identification results as your own service.` },
    ],
  },
  {
    heading: `8. User content`,
    blocks: [
      { type: 'p', text: `Photos you take or upload remain yours and are stored on your device. They are transmitted to the identification services described in Section 2 only to generate the result, in ephemeral processing, and are not stored on any server of ours.` },
      { type: 'p', text: `If you are a logged-in subscriber, the text data of your collection (names, notes, dates — never photos) is synced with the server so your collection follows you across devices.` },
      { type: 'p', text: `You grant us only the minimum license necessary to operate the Service: to transmit your photos and audio to the identification providers to generate the result you requested, and to store and sync the text data of a subscriber's collection. Nothing more. We claim no ownership of your content, we acquire no perpetual or irrevocable license to it, and we do not use it for advertising or sell it to third parties. This license ends when you delete the content or your account, except for transient backup copies removed in the normal cycle.` },
      { type: 'p', text: `You represent that you hold the necessary rights to the content you submit and that it does not infringe third-party rights or applicable law.` },
    ],
  },
  {
    heading: `9. Third-party content`,
    blocks: [
      { type: 'p', text: `The Service displays informational content from third-party sources, including text and images from Wikipedia and Wikimedia Commons, with due credit and under those sources' applicable licenses. That content belongs to its respective authors and licensors. We are not responsible for the accuracy of third-party content and do not endorse the cited sources.` },
    ],
  },
  {
    heading: `10. Critical safety notice`,
    blocks: [
      { type: 'p', text: `AI-GENERATED IDENTIFICATION CAN BE WRONG — INCLUDING ABOUT WHETHER A SPECIES IS EDIBLE, POISONOUS, OR SAFE TO TOUCH.` },
      { type: 'p', text: `NEVER USE THIS APP'S RESULT AS A BASIS TO EAT, FORAGE, TOUCH, OR USE ANY PLANT, MUSHROOM, OR FUNGUS. TOXIC AND LETHAL SPECIES CAN BE VISUALLY NEARLY IDENTICAL TO SAFE ONES.` },
      { type: 'p', text: `NATURELENS DOES NOT PROVIDE MEDICAL, VETERINARY, NUTRITIONAL, OR SAFETY ADVICE. ALWAYS CONFIRM WITH A QUALIFIED EXPERT (MYCOLOGIST, BOTANIST, PHYSICIAN, VETERINARIAN, OR POISON CONTROL CENTER) BEFORE CONSUMING, HANDLING, OR USING ANYTHING FOUND IN THE WILD.` },
      { type: 'p', text: `IF POISONING IS SUSPECTED, SEEK EMERGENCY MEDICAL CARE IMMEDIATELY.` },
      { type: 'p', text: `By using the Service, you acknowledge this risk and agree that any decision made based on an identification result is solely your responsibility.` },
    ],
  },
  {
    heading: `11. Herbal educational content`,
    blocks: [
      { type: 'p', text: `The Service includes educational content about herbs and traditional plant uses. This content is for informational and cultural purposes only. It is not medical advice, does not replace consultation with a healthcare professional, and must not be used to diagnose, treat, cure, or prevent any disease. Always consult a physician before using any plant for therapeutic purposes. The notice in Section 10 applies in full.` },
    ],
  },
  {
    heading: `12. Disclaimer of warranties`,
    blocks: [
      { type: 'p', text: `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY OF IDENTIFICATION RESULTS, UNINTERRUPTED AVAILABILITY, OR FREEDOM FROM ERRORS. WE DO NOT WARRANT THAT ANY IDENTIFICATION RESULT IS CORRECT. NOTHING IN THIS SECTION EXCLUDES WARRANTIES THAT CANNOT BE EXCLUDED UNDER APPLICABLE LAW.` },
    ],
  },
  {
    heading: `13. Limitation of liability`,
    blocks: [
      { type: 'p', text: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS, DATA, OR OPPORTUNITIES, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE — INCLUDING WITHOUT LIMITATION HARM TO HEALTH OR PROPERTY RESULTING FROM RELIANCE ON ANY IDENTIFICATION RESULT OR CONTENT OF THE SERVICE. TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL AGGREGATE LIABILITY IS LIMITED TO THE AMOUNT YOU PAID FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR, IF NOTHING WAS PAID, TO ZERO. THIS LIMITATION DOES NOT APPLY TO LIABILITY THAT APPLICABLE LAW DOES NOT ALLOW TO BE LIMITED, INCLUDING NON-WAIVABLE CONSUMER RIGHTS UNDER BRAZILIAN LAW.` },
    ],
  },
  {
    heading: `14. Indemnification`,
    blocks: [
      { type: 'p', text: `You agree to indemnify and hold us harmless from any claims, losses, damages, and reasonable expenses (including attorneys' fees) arising from: (a) your use of the Service in violation of these Terms; (b) content you submit in violation of third-party rights; or (c) your violation of applicable law in using the Service.` },
    ],
  },
  {
    heading: `15. Changes to the Service and to these Terms`,
    blocks: [
      { type: 'p', text: `We may modify, suspend, or discontinue the Service, in whole or in part, at any time, including free or paid features, with notice where required by law. We may also update these Terms from time to time; the current version will always be available on this page, with its effective date indicated. Material changes will be signaled by reasonable means. Continued use of the Service after a change takes effect constitutes acceptance of the updated Terms.` },
    ],
  },
  {
    heading: `16. Termination`,
    blocks: [
      { type: 'p', text: `You may end this relationship at any time by deleting your account in the app (Profile > Settings > Account > Delete account) or through naturelensapp.cloud/account-deletion.html, and uninstalling the app. Account deletion erases the account, the subscription link in our system, the synced collection, the push token, and the usage counters. Account deletion does not cancel the recurring Hotmart charge — to stop billing, cancel at consumer.hotmart.com.` },
      { type: 'p', text: `We may suspend or terminate your access to the Service, with immediate effect, if you violate these Terms, if required by law, or if the Service is discontinued. Sections that by their nature should survive (including 8 through 14 and 17) remain in effect after termination.` },
    ],
  },
  {
    heading: `17. Governing law and venue`,
    blocks: [
      { type: 'p', text: `These Terms are governed by the laws of the Federative Republic of Brazil. For consumer relationships, the courts of the consumer's domicile in Brazil shall have jurisdiction over disputes arising from these Terms; in other cases, the courts of the district of the party responsible for the Service, with waiver of any other venue. If any provision of these Terms is held invalid, the remaining provisions remain in full force.` },
    ],
  },
  {
    heading: `18. Contact`,
    blocks: [
      { type: 'p', text: `The party responsible for the Service is the independent developer of NatureLens (naturelensapp.cloud). The available channels are the app itself and the page naturelensapp.cloud/account-deletion.html (for account and data deletion). We do not maintain an email support channel.` },
      { type: 'p', text: `Last updated: August 19, 2026.` },
    ],
  },
];
