-- Anonymous device-based tracking (no login/accounts required).
-- Re-run this in the Supabase SQL Editor if the schema ever needs to be recreated.

drop table if exists public.category_usage;
drop table if exists public.subscriptions;

-- Tracks how many times each anonymous device has used each identification category.
create table public.category_usage (
  device_id text not null,
  category text not null check (category in ('plant', 'insect', 'mushroom', 'crop')),
  used_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (device_id, category)
);

-- Tracks each device's Stripe subscription status, synced by the webhook handler.
-- A single Stripe subscription can have multiple rows here (one per device_id) once
-- a customer restores access on a second device via email OTP (components/restore.js).
create table public.subscriptions (
  device_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  email text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.category_usage enable row level security;
alter table public.subscriptions enable row level security;

-- No SELECT/INSERT/UPDATE policies for the anon/authenticated roles: there is no
-- Supabase Auth session to scope a policy to, so every read and write goes through
-- serverless functions using the service_role key (which bypasses RLS entirely).
