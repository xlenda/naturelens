-- Base privada de conhecimento revisado usada pela especialista do NatureLens.
-- Execute no SQL Editor do Supabase e depois rode `npm run knowledge:ingest`.
-- Nenhuma tabela possui policy anon: somente as funcoes server-side com a
-- service role podem ingerir ou consultar os trechos.

create table if not exists knowledge_documents (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  title text not null check (char_length(title) between 3 and 240),
  language text not null default 'pt' check (language in ('pt')),
  category_scopes text[] not null,
  topic text not null check (char_length(topic) between 2 and 120),
  source_path text not null unique check (source_path like 'docs/agronomia/%'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references knowledge_documents(id) on delete cascade,
  ordinal integer not null check (ordinal between 0 and 999),
  heading text not null check (char_length(heading) between 1 and 240),
  content text not null check (char_length(content) between 80 and 4000),
  scientific_names text[] not null default '{}',
  source_urls text[] not null check (cardinality(source_urls) between 1 and 12),
  search_vector tsvector generated always as (
    to_tsvector('portuguese', coalesce(heading, '') || ' ' || coalesce(content, ''))
  ) stored,
  unique (document_id, ordinal)
);

create index if not exists knowledge_chunks_search_idx
  on knowledge_chunks using gin (search_vector);
create index if not exists knowledge_chunks_scientific_idx
  on knowledge_chunks using gin (scientific_names);
create index if not exists knowledge_documents_categories_idx
  on knowledge_documents using gin (category_scopes);

alter table knowledge_documents enable row level security;
alter table knowledge_chunks enable row level security;

create or replace function search_knowledge_chunks(
  p_query text,
  p_categories text[] default '{}',
  p_scientific text default null,
  p_limit integer default 5
)
returns table (
  chunk_id bigint,
  document_slug text,
  document_title text,
  heading text,
  content text,
  source_urls text[],
  scientific_exact boolean,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select
      websearch_to_tsquery('portuguese', left(coalesce(p_query, ''), 500)) as query,
      nullif(trim(coalesce(p_scientific, '')), '') as scientific,
      greatest(1, least(coalesce(p_limit, 5), 6)) as result_limit
  ), candidates as (
    select
      c.id as chunk_id,
      d.slug as document_slug,
      d.title as document_title,
      c.heading,
      c.content,
      c.source_urls,
      exists (
        select 1 from unnest(c.scientific_names) as name
        where lower(name) = lower(input.scientific)
      ) as scientific_exact,
      ts_rank_cd(c.search_vector, input.query) as lexical_rank,
      input.result_limit
    from knowledge_chunks c
    join knowledge_documents d on d.id = c.document_id
    cross join input
    where d.status = 'published'
      and (
        coalesce(cardinality(p_categories), 0) = 0
        or d.category_scopes && p_categories
      )
      and (
        c.search_vector @@ input.query
        or (
          input.scientific is not null
          and exists (
            select 1 from unnest(c.scientific_names) as name
            where lower(name) = lower(input.scientific)
          )
        )
      )
  )
  select
    chunk_id,
    document_slug,
    document_title,
    heading,
    content,
    source_urls,
    scientific_exact,
    (lexical_rank + case when scientific_exact then 2.0 else 0.0 end)::real as rank
  from candidates
  order by scientific_exact desc, lexical_rank desc, chunk_id asc
  limit (select result_limit from input);
$$;

revoke all on knowledge_documents from anon, authenticated;
revoke all on knowledge_chunks from anon, authenticated;
revoke all on function search_knowledge_chunks(text, text[], text, integer) from public, anon, authenticated;
grant execute on function search_knowledge_chunks(text, text[], text, integer) to service_role;
