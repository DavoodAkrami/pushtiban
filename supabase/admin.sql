-- =============================================================================
-- Pushtiban — Site administration
-- Paste and run this whole file in Supabase Dashboard → SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- What it creates:
--   1. profiles.is_admin — marks a user as a site admin
--   2. is_site_admin() — RLS helper (security definer)
--   3. ai_global_settings — singleton row of platform-wide AI knobs
--      (kill switch, retrieval similarity thresholds, match counts)
--   4. ai_usage_log — one row per AI call (chat / intent) with token counts
--   5. ai_business_limits — per-business monthly token / message caps and an
--      admin-side block switch
--   6. ai_usage_totals(uuid, timestamptz) / ai_usage_summary(timestamptz)
--      — aggregation RPCs used for limit checks and the admin dashboard
--
-- AFTER RUNNING: promote yourself to site admin with (replace the email):
--   update public.profiles set is_admin = true where email = 'you@example.com';
-- =============================================================================

-- 1) Site-admin flag on profiles ----------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Site administrator — can manage businesses, global AI settings, and limits.';

-- 2) RLS helper ----------------------------------------------------------------
-- Security definer so it can read profiles.is_admin regardless of the
-- caller's own RLS visibility.

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_site_admin() to authenticated;

-- 3) Global AI settings (singleton row, id fixed to 1) -------------------------

create table if not exists public.ai_global_settings (
  id                    integer primary key default 1 check (id = 1),
  -- Platform-wide kill switch: when false, no business gets AI replies.
  ai_enabled            boolean not null default true,
  -- Retrieval knobs applied by retrieveRagContext when callers do not
  -- override them explicitly.
  qa_min_similarity     real    not null default 0.45
                        check (qa_min_similarity    >= 0 and qa_min_similarity    <= 1),
  chunk_min_similarity  real    not null default 0.2
                        check (chunk_min_similarity >= 0 and chunk_min_similarity <= 1),
  chunk_match_count     integer not null default 4
                        check (chunk_match_count between 1 and 10),
  qa_match_count        integer not null default 2
                        check (qa_match_count between 1 and 5),
  -- When false, the intent-classification LLM call is skipped (cheaper,
  -- but no category boost and no query condensing).
  intent_enabled        boolean not null default true,
  updated_at            timestamptz not null default now()
);

comment on table public.ai_global_settings is
  'Singleton row of platform-wide AI settings, managed from /dashboard/admin.';

insert into public.ai_global_settings (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists ai_global_settings_set_updated_at
  on public.ai_global_settings;
create trigger ai_global_settings_set_updated_at
  before update on public.ai_global_settings
  for each row execute function public.set_updated_at();

alter table public.ai_global_settings enable row level security;

-- Writes go through the server (service role bypasses RLS); site admins may
-- read directly from the client if ever needed.
drop policy if exists "AI global settings: admin read"
  on public.ai_global_settings;
create policy "AI global settings: admin read"
  on public.ai_global_settings for select
  using (public.is_site_admin());

-- 4) AI usage log --------------------------------------------------------------
-- One row per AI call. `chat` rows count toward the per-business message
-- limit; token sums (all kinds) count toward the token limit.

create table if not exists public.ai_usage_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  kind              text not null check (kind in ('chat', 'intent')),
  provider          text not null default '',
  model             text not null default '',
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  created_at        timestamptz not null default now()
);

comment on table public.ai_usage_log is
  'Per-call AI usage (tokens) — written server-side, read by site admins.';

create index if not exists ai_usage_log_user_created_idx
  on public.ai_usage_log (user_id, created_at desc);

alter table public.ai_usage_log enable row level security;

drop policy if exists "AI usage log: admin read" on public.ai_usage_log;
create policy "AI usage log: admin read"
  on public.ai_usage_log for select
  using (public.is_site_admin());

-- 5) Per-business limits -------------------------------------------------------
-- NULL limit = unlimited. ai_blocked lets the admin cut a business off
-- regardless of the owner's own assistant toggle.

create table if not exists public.ai_business_limits (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  monthly_token_limit   bigint  check (monthly_token_limit   is null or monthly_token_limit   >= 0),
  monthly_message_limit integer check (monthly_message_limit is null or monthly_message_limit >= 0),
  ai_blocked            boolean not null default false,
  updated_at            timestamptz not null default now()
);

comment on table public.ai_business_limits is
  'Admin-set monthly AI caps per business. NULL means unlimited.';

drop trigger if exists ai_business_limits_set_updated_at
  on public.ai_business_limits;
create trigger ai_business_limits_set_updated_at
  before update on public.ai_business_limits
  for each row execute function public.set_updated_at();

alter table public.ai_business_limits enable row level security;

drop policy if exists "AI business limits: admin read" on public.ai_business_limits;
create policy "AI business limits: admin read"
  on public.ai_business_limits for select
  using (public.is_site_admin());

-- 6) Usage aggregation RPCs ----------------------------------------------------

-- Totals for one business, optionally since a timestamp (NULL = all time).
-- Used server-side for the limit check before answering a customer.
create or replace function public.ai_usage_totals(
  for_user uuid,
  since    timestamptz default null
)
returns table (total_tokens bigint, chat_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(total_tokens), 0)::bigint,
    coalesce(count(*) filter (where kind = 'chat'), 0)::bigint
  from public.ai_usage_log
  where user_id = for_user
    and (since is null or created_at >= since);
$$;

-- Per-business totals across the platform (NULL = all time). Feeds the
-- admin dashboard table.
create or replace function public.ai_usage_summary(
  since timestamptz default null
)
returns table (user_id uuid, total_tokens bigint, chat_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    user_id,
    coalesce(sum(total_tokens), 0)::bigint,
    coalesce(count(*) filter (where kind = 'chat'), 0)::bigint
  from public.ai_usage_log
  where since is null or created_at >= since
  group by user_id;
$$;

-- Server-only: the app calls these with the service role.
revoke execute on function public.ai_usage_totals(uuid, timestamptz) from public;
revoke execute on function public.ai_usage_summary(timestamptz) from public;
grant execute on function public.ai_usage_totals(uuid, timestamptz) to service_role;
grant execute on function public.ai_usage_summary(timestamptz) to service_role;
