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
create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_window_start timestamptz
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
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
-- Janela mais longa em uso hoje é de 1 hora (restore/request-code), então
-- qualquer coisa com mais de 24 horas é seguramente lixo.
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
select public.prune_rate_limits();
