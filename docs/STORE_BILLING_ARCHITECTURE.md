# Cobrança móvel do NatureLens

## Estado atual

- O checkout web e a integração do processador antigo foram removidos.
- O site não vende assinaturas e o app não exibe preços fictícios.
- Enquanto a cobrança nativa não estiver integrada, a interface informa que as assinaturas ainda não estão disponíveis.
- Assinantes reconhecidos pelo backend continuam vendo o estado do acesso; em Android e iOS, o gerenciamento abre somente a página oficial da respectiva loja.

## Arquitetura obrigatória para a próxima etapa

1. Criar os produtos de assinatura no Google Play Console e no App Store Connect.
2. Buscar produtos, moeda, período e preços diretamente da loja em tempo de execução.
3. Iniciar a compra apenas pelo Google Play Billing ou pelo StoreKit dentro do aplicativo.
4. Enviar o token/recibo ao backend e validá-lo no servidor com a loja correspondente.
5. Registrar somente identificadores pseudônimos, produto, provedor, estado e validade na tabela `subscriptions`.
6. Atualizar cancelamentos, renovações e reembolsos por notificações do Google Play e App Store, com processamento idempotente.
7. Implementar “Restaurar compras” consultando a loja e revalidando no servidor; nunca aceitar uma declaração de acesso enviada apenas pelo cliente.

## Regras que não podem regredir

- Não abrir checkout externo para conteúdo digital vendido no aplicativo.
- Não manter preço ou moeda fixos no código, no site ou nas traduções.
- Não liberar premium antes da validação server-side da transação.
- Não armazenar cartão, CVV ou dados bancários no NatureLens.
- Não misturar o identificador público da loja com chaves secretas ou credenciais de serviço no bundle.
- Se a loja ou o backend estiver indisponível, manter o estado como desconhecido; não retirar acesso de um assinante por falha de rede.

## Banco de dados

`supabase-migration-platform-core.sql` prepara uma estrutura neutra para Google Play e App Store. A migração não ativa vendas por si só. As credenciais e endpoints de notificação de cada loja devem existir apenas no backend.
