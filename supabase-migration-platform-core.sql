-- Infraestrutura neutra do NatureLens.
-- Nao cria checkout nem concede assinatura: compras futuras devem ser
-- verificadas no servidor contra Google Play ou App Store antes de atualizar
-- public.subscriptions.

alter table public.category_usage
  drop constraint if exists category_usage_category_check;

alter table public.category_usage
  add constraint category_usage_category_check
  check (category in ('plant', 'insect', 'mushroom', 'crop', 'tree', 'fish', 'bird', 'sound'));

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

-- Nunca persiste IP, e-mail ou device id em claro. A API converte cada alvo
-- em HMAC antes de chamar este RPC; a constraint impede que um rollback do
-- servidor volte a gravar identificadores legíveis.
delete from public.rate_limits
where bucket_key !~ '^h1:[0-9a-f]{64}$';

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

create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_window_start timestamptz
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
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

alter table public.subscriptions add column if not exists provider text;
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists provider_transaction_id text;
alter table public.subscriptions add column if not exists product_id text;
alter table public.subscriptions add column if not exists plan text;
alter table public.subscriptions add column if not exists amount_micros bigint;
alter table public.subscriptions add column if not exists currency text;

create index if not exists subscriptions_email_idx
  on public.subscriptions (lower(email));

create index if not exists subscriptions_provider_sub_idx
  on public.subscriptions (provider_subscription_id);

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

create or replace function public.reserve_category_usage(
  p_device_id text,
  p_category text
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.category_usage (device_id, category, used_count, updated_at)
  values (p_device_id, p_category, 1, now())
  on conflict (device_id, category)
  do update set
    used_count = 1,
    updated_at = now()
  where public.category_usage.used_count < 1
  returning used_count into v_count;

  return v_count = 1;
end;
$$;

create or replace function public.release_category_usage(
  p_device_id text,
  p_category text
) returns boolean
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.category_usage
  where device_id = p_device_id and category = p_category and used_count = 1;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  device_id text not null,
  p256dh text not null,
  auth text not null,
  language text,
  timezone_offset integer,
  failure_count integer not null default 0,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_device_idx
  on public.push_subscriptions (device_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.rate_limits from public, anon, authenticated;
revoke all on public.push_subscriptions from public, anon, authenticated;
revoke all on function public.increment_rate_limit(text, timestamptz) from public, anon, authenticated;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
revoke all on function public.increment_category_usage(text, text) from public, anon, authenticated;
revoke all on function public.reserve_category_usage(text, text) from public, anon, authenticated;
revoke all on function public.release_category_usage(text, text) from public, anon, authenticated;
grant execute on function public.increment_category_usage(text, text) to service_role;
grant execute on function public.reserve_category_usage(text, text) to service_role;
grant execute on function public.release_category_usage(text, text) to service_role;
grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;
grant execute on function public.prune_rate_limits() to service_role;
