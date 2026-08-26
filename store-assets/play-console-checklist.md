# Checklist da ficha no Play Console

Use este arquivo junto de `data-safety.md`. Ele registra as respostas coerentes com o AAB Android auditado; não copie uma resposta se o binário final tiver mudado.

## Configuração inicial

- Nome do app: **NatureLens**
- Idioma padrão: **Português (Brasil)**
- App ou jogo: **App**
- Gratuito ou pago: **Gratuito**
- Categoria: **Educação**
- Tags sugeridas: natureza, educação, identificação de plantas (somente as opções que a Play oferecer)
- E-mail de suporte: **pendente — informar um endereço real e monitorado**
- Site: `https://naturelensapp.cloud`
- Política de privacidade: `https://naturelensapp.cloud/privacy.html`

## Conteúdo do app

- Contém anúncios: **Não**
- Acesso ao app: **Há recursos restritos para assinantes**. Fornecer uma conta de revisor ativa ou instruções de restauração que funcionem sem compra dentro do Android.
- Público-alvo: **13–15, 16–17 e 18+**. O app não é dirigido a crianças menores de 13 anos.
- App de notícias ou revista: **Não**
- App governamental: **Não**
- Recursos financeiros: **Não**
- Apps de saúde: selecionar somente **Medical Reference and Education**, por causa da biblioteca educativa de ervas e usos tradicionais. Não selecionar dispositivo médico, diagnóstico, gestão de doenças ou tratamento.
- Dados de saúde do usuário: **Não coletados**. Conteúdo de saúde e coleta de dados de saúde são declarações diferentes.
- Conteúdo gerado por IA: **Sim**. Identificações, tradução e assistente podem produzir respostas automáticas. O app apresenta avisos de incerteza e possui denúncia de resposta.
- Exclusão de conta: **Sim**, dentro do app e em `https://naturelensapp.cloud/account-deletion.html`.

## Classificação de conteúdo

Responder pelo comportamento real, sem tentar forçar uma faixa menor:

- Violência, sexo, drogas, apostas e linguagem ofensiva produzidos pelo app: **Não**.
- Compartilhamento público entre usuários: **Sim** — apelido, biografia, publicações e comentários enviados à Comunidade. Há exclusão, denúncia, bloqueio e quarentena automática para revisão.
- Compras digitais dentro do Android: **Não**.
- Localização compartilhada com outros usuários: **Não**.
- Conteúdo online: **Sim** — resultados, textos e imagens educacionais vêm de serviços online.
- Conteúdo gerado por IA/chat: **Sim**, se o questionário perguntar.
- Referências a cogumelos tóxicos, venenos e riscos naturais: declarar como **conteúdo educativo/contextual**, quando houver essa opção.

## Ficha principal

- Copiar título e descrições de `metadata/pt-BR/`.
- Adicionar a tradução de inglês dos arquivos `metadata/en-US/`.
- Ícone: `play-icon-512.png`.
- Imagem de destaque: `feature-graphic-1024x500.png`.
- Capturas: os cinco arquivos localizados de `screenshots-listing/pt-BR/` ou
  `screenshots-listing/en-US/`, na ordem numérica.
- Não marcar “Contém anúncios”.
- Não mencionar preço, checkout externo ou assinatura na arte da ficha Android.
- Manter na descrição completa o aviso explícito de que o NatureLens não é dispositivo médico, não diagnostica, trata, cura ou previne condições e recomenda consultar profissional de saúde.

## Teste e lançamento

1. Criar o app com o pacote imutável `app.naturelens` e ativar o Play App Signing.
2. Fazer o primeiro upload manual do AAB em **Teste interno**.
3. Instalar pela própria Play em um aparelho Android e conferir câmera, galeria, identificação, aviso de envio, salvamento, exclusão de conta e restauração de acesso.
4. Se a conta pessoal de desenvolvedor foi criada após 13/11/2023, manter pelo menos **12 testadores inscritos continuamente por 14 dias** no teste fechado antes de solicitar produção.
5. Só promover para produção depois de preencher todos os formulários e resolver os avisos do painel.

## Dependências externas ainda abertas

- Login na conta Expo/EAS e vínculo do projeto para gerar o AAB assinado.
- Conta Google Play Console verificada.
- E-mail público de suporte real e monitorado.
- Execução da migração `supabase-migration-ratelimit.sql`.
- Publicação das páginas legais atualizadas pelo comando autorizado `npm run deploy`.
- Conta de demonstração, caso o revisor precise acessar recursos de assinante.
