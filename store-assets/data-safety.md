# Segurança dos dados — respostas para o Google Play

Estas respostas descrevem o **AAB Android** auditado em 25/08/2026. Elas incluem reconhecimento de som, câmera própria, localização aproximada sob demanda, comunidade e lembretes locais agendados pelo próprio Android. Push remoto e checkout continuam fora do AAB.

## Respostas gerais

- O app coleta ou compartilha dados obrigatórios: **Sim**.
- Os dados são criptografados em trânsito: **Sim** (HTTPS/TLS).
- O usuário pode solicitar exclusão dos dados: **Sim**.
- O app permite criar conta: **Sim, opcionalmente**.
- Exclusão dentro do app: **Sim**, em Perfil > Configurações > Conta > Excluir conta.
- Recurso web para exclusão: `https://naturelensapp.cloud/account-deletion.html`.
- Anúncios: **Não**.
- Público-alvo recomendado: **13 anos ou mais**; o produto não é dirigido a crianças.
- Auditoria de segurança independente qualificada pelo Google: **Não declarar**, salvo se ela for contratada e concluída.

## Tipos de dados

| Tipo no formulário | Coletado | Compartilhado | Opcional | Efêmero | Finalidade |
| --- | --- | --- | --- | --- | --- |
| Fotos e vídeos > Fotos | Sim | **Sim** | Sim; só ao identificar por foto | **Não** | Funcionalidade do app e analytics/melhoria do identificador |
| Localização > Localização aproximada | **Sim** | **Sim** | **Sim**; apenas ao identificar com contexto ou pedir clima local | **Não** | Funcionalidade e personalização |
| Arquivos de áudio > Gravações de voz ou som | **Sim** | Não | **Sim**; só quando o usuário toca em gravar e permite o microfone | **Sim** | Funcionalidade do app |
| Informações pessoais > Endereço de e-mail | Sim | Não* | Sim; conta e restauração são opcionais | Não | Gerenciamento da conta, funcionalidade e prevenção a fraude |
| Informações pessoais > Outras informações | Sim | **Sim** | Não ao usar identificação online; inclui idioma da interface | Não | Funcionalidade e personalização |
| Mensagens > Outras mensagens no app | Sim | Não* | Sim; apenas ao perguntar ao assistente | Não | Funcionalidade do app |
| Atividade no app > Interações no app | Sim | **Sim** | Não durante os recursos online que dependem delas | Não | Funcionalidade e prevenção a fraude |
| Atividade no app > Outro conteúdo gerado pelo usuário | Sim | **Sim** | Sim; perfil, publicações e comentários da comunidade são opcionais | Não | Funcionalidade, recursos sociais, segurança e conformidade |
| Atividade no app > Outras ações | Sim | Não* | Sim; apenas ao denunciar uma resposta de IA | Não | Funcionalidade, prevenção a fraude, segurança e conformidade |
| Identificadores do dispositivo ou outros identificadores | Sim | **Sim** | Não durante recursos online | Não | Funcionalidade, gerenciamento da conta e prevenção a fraude |

\* “Não compartilhado” usa a exceção de **prestador de serviço** do formulário: Supabase, Vercel e Anthropic processam os dados para operar o NatureLens, sem venda pelo app. Se um contrato, configuração ou finalidade desses fornecedores mudar, reavalie a resposta antes da próxima versão.

“Identificadores do dispositivo ou outros identificadores” fica como compartilhado porque consultas diretas à Wikipédia e ao GBIF expõem a esses serviços os metadados normais da conexão, inclusive o IP. O NatureLens não envia a eles o `device_id`, a foto escolhida nem coordenadas.

“Arquivos de áudio” precisa constar na resposta do formulário porque a evidência sai do aparelho. Marcar **Efêmero = Sim** porque o áudio bruto fica somente na memória durante a solicitação em tempo real e não é retido depois da resposta. A orientação do Google Play exige informar esse fluxo no formulário mesmo quando o processamento é efêmero; se ele cumprir esse padrão, o tipo pode não ser exibido na seção pública da loja.

### Por que Fotos = compartilhadas e não efêmeras

As imagens são enviadas a identificadores externos conforme a categoria. Os termos da Kindwise permitem retenção por até seis meses e concedem uma licença que inclui treinamento e outros usos; por isso não é correto marcar fotos como efêmeras nem depender da exceção de prestador para todas as categorias. O app deve exibir o aviso e obter uma confirmação afirmativa antes de cada envio.

Para aves há dois caminhos possíveis, ambos cobertos pelo aviso específico antes do envio. Quando o classificador mundial calibrado estiver ativado, a imagem passa primeiro pelo host BioCLIP gerenciado pelo NatureLens e existe ali somente em memória durante a solicitação, sem log do corpo nem retenção. Se o host estiver desativado, falhar ou não produzir uma identidade exata confirmada no GBIF, a mesma imagem pode seguir para a Nyckel com captura de amostra desativada. Como não existe garantia contratual suficiente de retenção efêmera na Nyckel, a resposta global de **Fotos** continua “Compartilhado = Sim” e “Efêmero = Não”. Antes de ativar o BioCLIP, registrar neste dossiê e na política o provedor de infraestrutura que hospedará o servidor, seu país, contrato e subprocessadores.

### Som nativo do Android

- `RECORD_AUDIO` é solicitado somente quando o usuário toca em gravar pela primeira vez. Negar a permissão mantém os demais recursos disponíveis.
- O arquivo temporário é convertido de WAV/PCM no aparelho. A evidência de áudio é enviada por HTTPS ao servidor Perch controlado pelo NatureLens apenas para gerar a identificação solicitada.
- O áudio bruto é transitório: não é retido depois da resposta, o arquivo temporário local é apagado e o áudio nunca entra na coleção.
- Não há compartilhamento do áudio com terceiros, gravação em segundo plano, acesso a chamadas ou estado do telefone, nem acesso a Bluetooth.

### Localização aproximada no Android

- A permissão é pedida somente quando o usuário toca em um recurso que usa localização; negar não bloqueia o restante do app.
- Para identificação, o aparelho arredonda para aproximadamente 1 km antes do envio e o NatureLens não persiste a coordenada.
- Para clima agronômico, o servidor reduz novamente para uma grade de 0,5 grau antes da NASA POWER; somente a grade e a resposta climática ficam em cache por até sete dias.
- Nunca é publicada na comunidade nem ligada a uma publicação.

### Comunidade

- Apelido pseudônimo, biografia, publicações e comentários são conteúdo público iniciado pelo usuário.
- Reações alimentam ranking calculado no servidor. Denúncias e bloqueios são privados.
- O usuário pode excluir as próprias publicações e a exclusão da conta remove perfil, publicações, comentários, reações, denúncias e bloqueios ligados ao aparelho.
- A comunidade não aceita upload de foto ou URL arbitrária nesta versão.

### O que não marcar para o AAB

Não marcar localização precisa, contatos, calendário, **dados de saúde do usuário**, informações financeiras, histórico de navegação, lista de apps instalados, falhas, diagnósticos ou desempenho do app. Marcar localização **aproximada** conforme o fluxo acima. A versão Android auditada não contém telemetria de analytics/tracking. Revalidar após qualquer nova biblioteca, permissão ou SDK.

### Lembretes locais do Android

- São criados somente por ação explícita do usuário para um exemplar salvo.
- Tarefa, data, horário, repetição e identificador local permanecem no aparelho; não entram na sincronização e não são enviados ao NatureLens ou a terceiros.
- O recurso não cria token, não usa FCM, Google Firebase nem Expo Push. Portanto não acrescenta um tipo de dado coletado ou compartilhado ao formulário.
- `POST_NOTIFICATIONS` é solicitado apenas na criação do primeiro lembrete. `RECEIVE_BOOT_COMPLETED` permite ao Android restaurar agendamentos após reiniciar. Alarmes exatos permanecem bloqueados.
- Remover o lembrete ou o exemplar cancela o agendamento correspondente; limpar os dados, excluir a conta no app ou desinstalar remove os lembretes locais.

## Declarações relacionadas

- Conteúdo gerado por IA: **Sim**. A identificação e o assistente podem gerar respostas por IA; há avisos, limites de segurança e mecanismo de denúncia.
- Conteúdo de saúde: **Sim — Medical Reference and Education**. A biblioteca sobre ervas e usos tradicionais é educativa. O NatureLens não é um dispositivo médico, não diagnostica, trata, cura nem previne condições médicas e orienta consultar um profissional de saúde.
- Recursos financeiros: **Não** no AAB.
- Permissão de fotos/câmera: usada somente para a ação iniciada pelo usuário de fotografar ou escolher imagens para identificação.
- Permissão de localização aproximada: usada somente na ação iniciada pelo usuário para melhorar a identificação ou consultar clima local; negar mantém o app funcional.
- Permissão de microfone: usada somente para a ação iniciada pelo usuário de gravar uma evidência sonora para identificação; não é usada em segundo plano.

## Antes de enviar a ficha

1. Publicar as versões locais atualizadas de `privacy.html` e `account-deletion.html` pelo único fluxo autorizado do projeto: `npm run deploy`.
2. Executar `supabase-migration-ratelimit.sql` no Supabase para remover buckets antigos e ativar a janela de 24 horas; o cron diário completa a limpeza normalmente em até 48 horas.
3. Testar em navegador anônimo que a página de exclusão leva ao fluxo web de login e exclusão sem exigir reinstalação.
4. Reabrir este arquivo e conferir as respostas contra o AAB final; o formulário deve representar o binário realmente enviado.
5. Em um aparelho Android 13 a 16, testar a permissão de notificação aceita/negada, app em segundo plano/fechado, reinício, toque abrindo o exemplar e cancelamento ao remover o exemplar.
6. No AAB final, testar a permissão de microfone aceita e negada, uma identificação por som completa, a exclusão do arquivo temporário e a ausência do áudio na coleção. Conferir no manifesto mesclado que existem `RECORD_AUDIO`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS` e `RECEIVE_BOOT_COMPLETED`, sem permissões de telefone, Bluetooth ou áudio em segundo plano; também sem localização precisa ou em segundo plano.

## Referências usadas na auditoria

- Google Play — Segurança dos dados: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play — Dados do usuário e divulgação em destaque: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play — exclusão de conta: https://support.google.com/googleplay/android-developer/answer/13327111
- Kindwise — termos: https://www.kindwise.com/terms-and-conditions
- Anthropic — retenção da API: https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Nyckel — controle de captura: https://www.nyckel.com/docs/concepts/invoke-capture/
- Google Play — declaração de apps de saúde: https://support.google.com/googleplay/android-developer/answer/14738291
- Google Play — conteúdo e serviços de saúde: https://support.google.com/googleplay/android-developer/answer/16679511
