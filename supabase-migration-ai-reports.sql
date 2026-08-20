-- Reports of offensive AI chat answers (Google Play AI-Generated Content
-- policy requires an in-app flagging mechanism; api/ask.js writes here).
-- Run in the Supabase SQL editor, like the previous migrations.
create table if not exists ai_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device_id text not null,
  message text not null
);

-- Service-role key only: RLS on with no policies locks out the anon key
-- entirely, which is correct - reports are written by the server and read
-- by a human in the dashboard.
alter table ai_reports enable row level security;
