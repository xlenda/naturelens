-- ============================================================================
-- NatureLens - migração única (2026-07-28)
-- Rode este arquivo INTEIRO no Supabase SQL Editor. É idempotente: rodar duas
-- vezes não quebra nada e não duplica nada.
--
-- Resolve três coisas:
--   1. BUG DE RECEITA: categorias novas (tree/fish/bird) não passavam na
--      restrição de category_usage, o erro era engolido, o contador nunca subia
--      e o uso grátis dessas categorias ficou ILIMITADO. Confirmado ao vivo em
--      28/07/2026: 3 identificações de peixe seguidas, do mesmo aparelho, todas
--      liberadas.
--   2. RATE LIMITING: a tabela nunca foi criada, então a proteção escrita em
--      19/07 está desligada (o código falha aberto de propósito até ela existir).
--   3. HOTMART: tabela de eventos crus + colunas de assinatura por provedor.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. category_usage: aceitar todas as categorias que o app realmente tem
-- ----------------------------------------------------------------------------
-- A restrição antiga listava só ('plant','insect','mushroom','crop'). Qualquer
-- upsert de 'tree', 'fish', 'bird' ou 'sound' violava a restrição; recordUsage()
-- captura o erro e só loga, então falhava em silêncio e o limite grátis nunca
-- aplicava.
--
-- Reconfirmado ao vivo em 30/07/2026, inserindo direto na tabela de produção:
--   plant  -> 201 ACEITA
--   fish   -> 400 recusada (23514 check_violation)
--   bird   -> 400 recusada
--   sound  -> 400 recusada
--   tree   -> 400 recusada
-- Ou seja: HOJE peixe, pássaro e som são gratuitos ILIMITADOS em produção.
--
-- 'sound' entrou na lista em 30/07/2026 junto com a identificação por canto.
-- Se uma categoria nova for adicionada em components/categories.js, ela TEM de
-- entrar aqui também - scripts/verify-live.js agora falha o deploy quando as
-- duas listas divergem, exatamente para este erro não voltar a passar em branco.
alter table public.category_usage
  drop constraint if exists category_usage_category_check;

alter table public.category_usage
  add constraint category_usage_category_check
  check (category in ('plant', 'insect', 'mushroom', 'crop', 'tree', 'fish', 'bird', 'sound'));


-- ----------------------------------------------------------------------------
-- 2. rate_limits: liga a proteção dos endpoints que gastam crédito de verdade
-- ----------------------------------------------------------------------------
-- Sem esta tabela, api/_lib/rateLimit.js falha aberto (deliberado, pra não
-- derrubar o app), o que significa que hoje qualquer um pode gerar deviceIds
-- novos em loop e drenar os créditos de API pagos.
create table if not exists public.rate_limits (
  id bigserial primary key,
  bucket_key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  unique (bucket_key, window_start)
);

create index if not exists rate_limits_bucket_idx
  on public.rate_limits (bucket_key, window_start);

alter table public.rate_limits enable row level security;


-- ----------------------------------------------------------------------------
-- 3. subscriptions: colunas do provedor de pagamento (Hotmart)
-- ----------------------------------------------------------------------------
-- A tabela nasceu com colunas cravadas com o nome do Stripe. Em vez de renomear
-- (o que quebraria o código antigo no meio do deploy), adiciona-se colunas
-- neutras de provedor. As colunas stripe_* ficam para trás sem uso e podem ser
-- removidas depois que o Hotmart estiver rodando e verificado.
alter table public.subscriptions add column if not exists provider text;
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists provider_transaction_id text;
alter table public.subscriptions add column if not exists plan text;
alter table public.subscriptions add column if not exists amount_cents integer;
alter table public.subscriptions add column if not exists currency text;

-- Correlação por e-mail é o caminho principal no Hotmart (o checkout embutido
-- NÃO devolve código próprio no webhook - lição de incidente real). Estes
-- índices são o que faz a cascata de correlação achar a linha certa rápido.
create index if not exists subscriptions_email_idx
  on public.subscriptions (lower(email));

create index if not exists subscriptions_provider_sub_idx
  on public.subscriptions (provider_subscription_id);


-- ----------------------------------------------------------------------------
-- 4. subscription_events: TODO payload cru, inclusive os rejeitados
-- ----------------------------------------------------------------------------
-- A lição mais cara do incidente do Cosmic Guide: sem isto, uma compra que o
-- webhook rejeitou é IRRECUPERÁVEL - o provedor recebeu HTTP 200, considera
-- entregue e nunca reenvia. Com isto, dá pra reprocessar pelo caminho de
-- produção depois de corrigir, e provar a correção com dado verdadeiro.
create table if not exists public.subscription_events (
  id bigserial primary key,
  provider text not null default 'hotmart',
  -- UUID da notificação do provedor. Único para dedupe de reentrega: a Hotmart
  -- reenvia o mesmo evento quando não recebe 200 a tempo, e sem isto uma
  -- reentrega criaria uma segunda assinatura.
  event_id text,
  event_type text,
  buyer_email text,
  provider_subscription_id text,
  transaction_id text,
  -- 'processed' | 'ignored' | 'error'. Nunca 'rejected': por regra o webhook
  -- não rejeita pagamento aprovado - se nada correlaciona, ele CRIA a linha.
  outcome text,
  outcome_detail text,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists subscription_events_event_id_idx
  on public.subscription_events (event_id)
  where event_id is not null;

create index if not exists subscription_events_email_idx
  on public.subscription_events (lower(buyer_email));

alter table public.subscription_events enable row level security;


-- ----------------------------------------------------------------------------
-- 5. Incremento atômico do uso grátis
-- ----------------------------------------------------------------------------
-- Substitui o read-then-upsert de recordUsage(), que tinha uma corrida real:
-- duas requisições simultâneas do mesmo aparelho liam used_count 0 e ambas
-- gravavam 1, dando duas identificações grátis em vez de uma.
create or replace function public.increment_category_usage(
  p_device_id text,
  p_category text
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.category_usage (device_id, category, used_count, updated_at)
  values (p_device_id, p_category, 1, now())
  on conflict (device_id, category)
  do update set
    used_count = public.category_usage.used_count + 1,
    updated_at = now()
  returning used_count into v_count;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. push_subscriptions: notificações do PWA (Android + iPhone iOS 16.4+)
-- ----------------------------------------------------------------------------
-- Guarda a inscrição de Web Push de cada navegador. A chave primária é o
-- ENDPOINT (a URL que o serviço de push do navegador devolve): o mesmo
-- navegador reinscrevendo gera o mesmo endpoint, então o upsert mantém uma
-- linha só em vez de acumular duplicatas que entregariam a mesma notificação
-- várias vezes.
--
-- p256dh e auth são as chaves de criptografia da mensagem (RFC 8291) - sem
-- elas a notificação não pode ser cifrada para aquele navegador.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  device_id text not null,
  p256dh text not null,
  auth text not null,
  language text,
  timezone_offset integer,
  -- Quantas entregas seguidas falharam. O enviador deve apagar a linha depois
  -- de algumas falhas: endpoint morto (app desinstalado) fica tentando pra
  -- sempre e queima cota do serviço de push.
  failure_count integer not null default 0,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_device_idx
  on public.push_subscriptions (device_id);

alter table public.push_subscriptions enable row level security;


-- Nenhuma policy de RLS em nenhuma tabela acima, de propósito: não existe
-- sessão do Supabase Auth para escopar uma policy. Todo acesso passa pelas
-- funções serverless com a service_role key, que ignora RLS. anon/authenticated
-- ficam com negação por padrão.
