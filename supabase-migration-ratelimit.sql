-- ============================================================================
-- NatureLens - migração 2 (2026-07-31)
-- Rode este arquivo INTEIRO no Supabase SQL Editor. É idempotente.
--
-- Resolve UM problema, e ele custa dinheiro:
--
-- O rate limiting fazia SELECT do contador e depois UPSERT de contador+1, em
-- dois comandos separados. Isso é a mesma corrida que já foi corrigida no
-- contador de uso grátis (increment_category_usage, migração 1) — e que aqui
-- ficou de fora.
--
-- Consequência medida: disparando N requisições ao mesmo tempo do mesmo IP,
-- TODAS leem o contador antes de qualquer uma gravar, TODAS passam pela
-- verificação, e a linha termina valendo 1 em vez de N. Ou seja: quem chama em
-- sequência é limitado a 20 por 10 minutos; quem chama em paralelo não tem
-- limite nenhum, e o contador nunca passa de 1, então o abuso é repetível
-- indefinidamente.
--
-- Isso vale para /api/translate (chama a Anthropic, você paga), /api/ask
-- (idem) e /api/identify (gasta crédito de fornecedor). É o único controle de
-- gasto que um chamador não consegue zerar sozinho — deviceId ele gera à
-- vontade, o IP não.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Incremento atômico do rate limit
-- ----------------------------------------------------------------------------
-- INSERT ... ON CONFLICT DO UPDATE é resolvido pelo Postgres com trava de
-- linha, então dois pedidos simultâneos nunca leem o mesmo valor. Devolve o
-- contador DEPOIS de incrementar, que é o número em que a decisão tem de se
-- basear: incrementar e só então comparar elimina a janela entre ler e gravar.
create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_window_start timestamptz
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  -- Poda oportunista: ao fim de cada operacao, nenhuma janela operacional
  -- anterior ao limite maximo de 24 horas continua no banco.
  delete from public.rate_limits
  where window_start < now() - interval '24 hours';

  insert into public.rate_limits (bucket_key, window_start, count)
  values (p_bucket_key, p_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. Limpeza das janelas velhas
-- ----------------------------------------------------------------------------
-- Cada IP em cada janela vira uma linha e nada nunca apagava. Não quebra nada
-- em volume pequeno, mas cresce para sempre — e o plano gratuito do Supabase
-- tem teto de disco.
--
-- A janela mais longa em uso hoje e de 24 horas (translate-device). Apagar
-- somente o que ficou para tras desse limite preserva o bucket ativo inteiro.
create or replace function public.prune_rate_limits() returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Limpa o que já está acumulado agora.
-- Versoes antigas gravavam scope + IP/email em claro. Nao ha como converter
-- isso para HMAC sem o segredo do servidor, portanto a migracao apaga somente
-- chaves legadas. Rodar novamente nao zera buckets opacos ainda ativos.
delete from public.rate_limits
where bucket_key !~ '^h1:[0-9a-f]{64}$';

-- O banco vira a ultima barreira: mesmo um rollback acidental para codigo que
-- tente mandar valor cru nao consegue persisti-lo.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rate_limits_bucket_key_opaque'
      and conrelid = 'public.rate_limits'::regclass
  ) then
    alter table public.rate_limits
      add constraint rate_limits_bucket_key_opaque
      check (bucket_key ~ '^h1:[0-9a-f]{64}$');
  end if;
end;
$$;

select public.prune_rate_limits();


-- ----------------------------------------------------------------------------
-- 3. Coleção na nuvem (assinantes)
-- ----------------------------------------------------------------------------
-- A coleção vive só no aparelho. Existe exportar/importar manual, mas perder o
-- celular perde tudo — e é a única coisa no app que o usuário não consegue
-- recuperar de jeito nenhum.
--
-- O QUE SINCRONIZA, E O QUE NÃO
-- Só os METADADOS do achado: nome, espécie, categoria, confiança, data, texto.
-- A FOTO DO USUÁRIO NÃO SOBE. Dois motivos, e o segundo é decisivo:
--   1. cada foto tem ~300 KB (JPEG 1280px em base64); 100 achados seriam 30 MB
--      por conta, contra ~100 KB só de metadados;
--   2. a política de privacidade do app diz, com todas as letras, que não
--      armazenamos fotos em servidor nosso. Subir foto contradiria isso.
-- A foto de referência da espécie é recuperável a partir do nome científico
-- (Wikipedia), então o achado reaparece com imagem no outro aparelho mesmo sem
-- a foto original.
--
-- CHAVE POR E-MAIL, não por aparelho: o objetivo é justamente atravessar
-- aparelhos. Quem não tem conta não sincroniza — e não perde nada, porque a
-- coleção local continua funcionando exatamente como antes.
create table if not exists public.collection_entries (
  email text not null,
  -- O savedId gerado no aparelho. É Date.now() em texto, então dois aparelhos
  -- PODEM colidir no mesmo milissegundo; a chave primária composta com o e-mail
  -- torna isso inofensivo (no pior caso um achado sobrescreve outro do mesmo
  -- dono no mesmo instante, o que ninguém consegue provocar na prática).
  saved_id text not null,
  category text not null,
  payload jsonb not null,
  saved_at timestamptz,
  -- Lápide. Sem isto, apagar um achado num aparelho e sincronizar o traria de
  -- volta do outro — a sincronização viraria um botão de desfazer exclusão.
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (email, saved_id)
);

create index if not exists collection_entries_email_idx
  on public.collection_entries (email, updated_at desc);

alter table public.collection_entries enable row level security;

-- Sem policy de RLS, igual às outras tabelas: não existe sessão do Supabase
-- Auth para escopar uma policy. Todo acesso passa pelas funções serverless com
-- a service_role key, que ignora RLS. anon/authenticated ficam negados.
