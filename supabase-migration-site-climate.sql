-- Cache por grade publica NASA POWER. Nunca recebe nem guarda a coordenada
-- exata do aparelho: a API arredonda para a grade de 0,5 grau antes do banco.
create table if not exists public.site_climate_cache (
  grid_latitude numeric(4,1) not null,
  grid_longitude numeric(4,1) not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (grid_latitude, grid_longitude)
);

alter table public.site_climate_cache enable row level security;
revoke all on public.site_climate_cache from anon, authenticated;
grant all on public.site_climate_cache to service_role;

create index if not exists site_climate_cache_fetched_idx
  on public.site_climate_cache (fetched_at);
