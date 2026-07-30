-- =============================================================================
-- Pushtiban — Knowledge base: business facts + Q&A pairs + category filtering
-- Paste and run this whole file in Supabase Dashboard → SQL Editor.
-- Idempotent — safe to run multiple times.
-- Requires: supabase/rag.sql already run (creates knowledge_sources/chunks).
--
-- What this adds:
--   1. public.ai_knowledge_facts — "things the AI should know about this
--      business" (always-on context injected into the system prompt).
--   2. public.ai_knowledge_qa — explicit Q&A pairs the owner curated.
--   3. category column on knowledge_chunks — so chunks can be scoped
--      ("shipping", "pricing", "products", "general", ...).
--   4. match_knowledge_chunks_filtered — vector search that soft-boosts the
--      detected category during ranking (never hard-excludes other categories).
--   5. RLS on both new tables — each user only sees their own facts/qa.
-- =============================================================================

create extension if not exists vector with schema public;

-- 1) ai_knowledge_facts ------------------------------------------------------
-- Owner-curated "things AI should always know" — standing context, not
-- retrieved via vector search. Always injected into the system prompt.
create table if not exists public.ai_knowledge_facts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  category   text not null default 'general',
  fact_text  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_knowledge_facts is
  'Standing business facts the AI always knows (always-on context, not retrieved).';

-- 2) ai_knowledge_qa ---------------------------------------------------------
-- Explicit owner-curated Q&A pairs. Each pair is retrieved by matching the
-- question vector against the user query vector (high-similarity Q&A is more
-- authoritative than chunked docs).
create table if not exists public.ai_knowledge_qa (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  category      text not null default 'general',
  question     text not null,
  answer        text not null,
  question_embedding vector(1536),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.ai_knowledge_qa is
  'Owner-curated Q&A pairs with question embeddings for direct match.';

-- HNSW index on the question embedding for cosine similarity search.
create index if not exists ai_knowledge_qa_embedding_hnsw_idx
  on public.ai_knowledge_qa
  using hnsw (question_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 3) category column on knowledge_chunks -------------------------------------
-- Lets us tag every chunked doc with a category so vector search can filter
-- "show me only shipping chunks" before ranking.
alter table public.knowledge_chunks
  add column if not exists category text not null default 'general';

-- Index to speed up category-scoped retrievals.
create index if not exists knowledge_chunks_category_idx
  on public.knowledge_chunks (user_id, category);

-- 4) Triggers ----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_knowledge_facts_set_updated_at
  on public.ai_knowledge_facts;
create trigger ai_knowledge_facts_set_updated_at
  before update on public.ai_knowledge_facts
  for each row execute function public.set_updated_at();

drop trigger if exists ai_knowledge_qa_set_updated_at
  on public.ai_knowledge_qa;
create trigger ai_knowledge_qa_set_updated_at
  before update on public.ai_knowledge_qa
  for each row execute function public.set_updated_at();

-- 5) match_knowledge_chunks_filtered -----------------------------------------
-- Like match_knowledge_chunks but category-aware. The AI first detects the
-- user's intent (shipping vs. pricing vs. products...), then this RPC gives
-- chunks in that category a small ranking boost — it never hard-excludes
-- other categories, so a miscategorized chunk can still be retrieved when it
-- is the closest semantic match. If filter_category is null, ranking is by
-- pure cosine similarity.
create or replace function public.match_knowledge_chunks_filtered(
  query_embedding vector(1536),
  match_user_id  uuid,
  match_count    integer default 4,
  filter_category text default null,
  filter_source_id uuid default null,
  -- Question->passage similarity is asymmetric and scores lower than the
  -- question->question matching in match_knowledge_qa, so this bar sits below
  -- that one (0.45). Calibrated for text-embedding-3-small.
  min_similarity real default 0.35
)
returns table (
  id          uuid,
  source_id   uuid,
  chunk_index integer,
  content     text,
  category    text,
  similarity  real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  -- Over-fetch by pure vector distance (uses the HNSW index), then re-rank
  -- with the category boost and cut to match_count.
  with candidates as (
    select
      kc.id,
      kc.source_id,
      kc.chunk_index,
      kc.content,
      kc.category,
      (1 - (kc.embedding <=> query_embedding))::real as similarity
    from public.knowledge_chunks kc
    where
      kc.user_id = match_user_id
      and (filter_source_id is null or kc.source_id = filter_source_id)
      and kc.embedding is not null
    order by kc.embedding <=> query_embedding
    limit greatest(match_count * 4, 16)
  )
  select c.id, c.source_id, c.chunk_index, c.content, c.category, c.similarity
  from candidates c
  where c.similarity >= min_similarity
  order by
    c.similarity
      + (case
           when filter_category is not null and c.category = filter_category
           then 0.05
           else 0
         end) desc
  limit match_count;
$$;

-- Service role ONLY — `security definer` bypasses RLS and the caller chooses
-- the business via match_user_id. PUBLIC must be named explicitly because
-- Postgres grants EXECUTE on new functions to it by default.
revoke execute on function public.match_knowledge_chunks_filtered(vector, uuid, integer, text, uuid, real)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks_filtered(vector, uuid, integer, text, uuid, real)
  to service_role;

-- 6) match_knowledge_qa ------------------------------------------------------
-- Match owner Q&A pairs by question embedding. Returns the best matches above
-- a similarity threshold (default 0.45 — high enough to reject unrelated
-- questions, low enough to catch Persian paraphrases). The detected category
-- gives a small ranking boost but never hard-excludes other categories.
create or replace function public.match_knowledge_qa(
  query_embedding vector(1536),
  match_user_id  uuid,
  filter_category text default null,
  match_count    integer default 2,
  min_similarity real default 0.45
)
returns table (
  id          uuid,
  question    text,
  answer      text,
  category    text,
  similarity  real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  -- Over-fetch by pure vector distance (uses the HNSW index), then re-rank
  -- with the category boost and cut to match_count.
  with candidates as (
    select
      qa.id,
      qa.question,
      qa.answer,
      qa.category,
      (1 - (qa.question_embedding <=> query_embedding))::real as similarity
    from public.ai_knowledge_qa qa
    where
      qa.user_id = match_user_id
      and qa.question_embedding is not null
    order by qa.question_embedding <=> query_embedding
    limit greatest(match_count * 4, 16)
  )
  select c.id, c.question, c.answer, c.category, c.similarity
  from candidates c
  where c.similarity >= min_similarity
  order by
    c.similarity
      + (case
           when filter_category is not null and c.category = filter_category
           then 0.05
           else 0
         end) desc
  limit match_count;
$$;

-- Service role ONLY — same reasoning as match_knowledge_chunks_filtered above.
revoke execute on function public.match_knowledge_qa(vector, uuid, text, integer, real)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_qa(vector, uuid, text, integer, real)
  to service_role;

-- 7) Row Level Security ------------------------------------------------------
alter table public.ai_knowledge_facts enable row level security;
alter table public.ai_knowledge_qa enable row level security;

-- facts: CRUD own
drop policy if exists "ai_knowledge_facts: select own" on public.ai_knowledge_facts;
create policy "ai_knowledge_facts: select own"
  on public.ai_knowledge_facts for select
  using (auth.uid() = user_id);

drop policy if exists "ai_knowledge_facts: insert own" on public.ai_knowledge_facts;
create policy "ai_knowledge_facts: insert own"
  on public.ai_knowledge_facts for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_knowledge_facts: update own" on public.ai_knowledge_facts;
create policy "ai_knowledge_facts: update own"
  on public.ai_knowledge_facts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_knowledge_facts: delete own" on public.ai_knowledge_facts;
create policy "ai_knowledge_facts: delete own"
  on public.ai_knowledge_facts for delete
  using (auth.uid() = user_id);

-- qa: CRUD own
drop policy if exists "ai_knowledge_qa: select own" on public.ai_knowledge_qa;
create policy "ai_knowledge_qa: select own"
  on public.ai_knowledge_qa for select
  using (auth.uid() = user_id);

drop policy if exists "ai_knowledge_qa: insert own" on public.ai_knowledge_qa;
create policy "ai_knowledge_qa: insert own"
  on public.ai_knowledge_qa for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_knowledge_qa: update own" on public.ai_knowledge_qa;
create policy "ai_knowledge_qa: update own"
  on public.ai_knowledge_qa for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_knowledge_qa: delete own" on public.ai_knowledge_qa;
create policy "ai_knowledge_qa: delete own"
  on public.ai_knowledge_qa for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete
  on table public.ai_knowledge_facts to authenticated;
grant select, insert, update, delete
  on table public.ai_knowledge_qa to authenticated;
