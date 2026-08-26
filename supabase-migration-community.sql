-- NatureLens community v1. Run once in the Supabase SQL editor.
-- There are no client RLS policies: every operation passes through /api/community.
create extension if not exists pgcrypto;

create table if not exists public.community_profiles (
  device_id text primary key,
  public_id uuid not null default gen_random_uuid() unique,
  nickname text not null check (char_length(nickname) between 3 and 30),
  bio text check (bio is null or char_length(bio) <= 180),
  locale text,
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_device_id text not null references public.community_profiles(device_id) on delete cascade,
  category text not null check (category in ('plant','tree','crop','mushroom','insect','fish','bird','sound')),
  kind text not null check (kind in ('care','observation','recovery','question')),
  common_name text check (common_name is null or char_length(common_name) <= 120),
  scientific_name text check (scientific_name is null or char_length(scientific_name) <= 140),
  body text not null check (char_length(body) between 20 and 1200),
  moderation_state text not null default 'visible' check (moderation_state in ('visible','review','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_device_id text not null references public.community_profiles(device_id) on delete cascade,
  body text not null check (char_length(body) between 2 and 500),
  moderation_state text not null default 'visible' check (moderation_state in ('visible','review','removed')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  device_id text not null references public.community_profiles(device_id) on delete cascade,
  reaction text not null default 'helpful' check (reaction = 'helpful'),
  created_at timestamptz not null default now(),
  primary key (post_id, device_id)
);

create table if not exists public.community_reports (
  id bigint generated always as identity primary key,
  reporter_device_id text not null references public.community_profiles(device_id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','profile')),
  target_id text not null,
  reason text not null check (reason in ('unsafe','spam','harassment','false_information','other')),
  created_at timestamptz not null default now(),
  unique (reporter_device_id, target_type, target_id)
);

create table if not exists public.community_blocks (
  blocker_device_id text not null references public.community_profiles(device_id) on delete cascade,
  blocked_device_id text not null references public.community_profiles(device_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_device_id, blocked_device_id),
  check (blocker_device_id <> blocked_device_id)
);

create index if not exists community_posts_feed_idx on public.community_posts (created_at desc)
  where deleted_at is null and moderation_state = 'visible';
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at)
  where deleted_at is null and moderation_state = 'visible';
create index if not exists community_reactions_post_idx on public.community_reactions (post_id);
create index if not exists community_reports_target_idx on public.community_reports (target_type, target_id);

alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security;

-- A client never submits a score. Only real server rows can affect rank.
create or replace function public.community_leaderboard(p_limit integer default 25)
returns table (public_id uuid, nickname text, posts bigint, comments bigint, helpful_received bigint, score bigint)
language sql security definer set search_path = public as $$
  with post_stats as (
    select p.author_device_id,
      count(distinct p.id) filter (where p.created_at >= now() - interval '7 days') as posts,
      count(r.device_id) filter (where p.created_at >= now() - interval '7 days') as helpful_received
    from community_posts p left join community_reactions r on r.post_id = p.id
    where p.deleted_at is null and p.moderation_state = 'visible'
    group by p.author_device_id
  ), comment_stats as (
    select author_device_id, count(*) filter (where created_at >= now() - interval '7 days') as comments
    from community_comments where deleted_at is null and moderation_state = 'visible'
    group by author_device_id
  )
  select profile.public_id, profile.nickname,
    coalesce(ps.posts, 0), coalesce(cs.comments, 0), coalesce(ps.helpful_received, 0),
    coalesce(ps.posts, 0) * 40 + coalesce(cs.comments, 0) * 5 + coalesce(ps.helpful_received, 0) * 8
  from community_profiles profile
  left join post_stats ps on ps.author_device_id = profile.device_id
  left join comment_stats cs on cs.author_device_id = profile.device_id
  where profile.status = 'active' and (coalesce(ps.posts, 0) + coalesce(cs.comments, 0)) > 0
  order by 6 desc, profile.created_at asc
  limit greatest(1, least(coalesce(p_limit, 25), 50));
$$;
