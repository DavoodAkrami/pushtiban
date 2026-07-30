-- =============================================================================
-- Pushtiban — RAG knowledge base (pgvector)
-- Paste and run this whole file in Supabase Dashboard → SQL Editor.
-- Idempotent — safe to run multiple times.
--
-- Requirements: the "vector" extension must be enabled (Dashboard → Database →
-- Extensions → enable "vector"). Then run this file. It creates:
--   1. public.knowledge_sources — uploaded documents (title, raw text, status)
--   2. public.knowledge_chunks — chunked text with a vector(1536) embedding
--   3. HNSW index on the embedding column for fast cosine similarity search
--   4. public.match_knowledge_chunks — a Postgres function that returns the
--      top-N most similar chunks for a given query embedding
--   5. Row Level Security policies — users see only their own knowledge data
-- =============================================================================

-- 1) Enable the vector extension if it is not already enabled -----------------
-- Install into the `public` schema so the `vector` type and the `<=>` operator
-- resolve cleanly. Supabase sometimes installs extensions under an `extensions`
-- namespace; `with schema public` forces them into public where our tables live.
-- If the extension is already installed in another schema this is a no-op.
create extension if not exists vector with schema public;

-- 2) knowledge_sources table ------------------------------------------------
create table if not exists public.knowledge_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  source_type text not null default 'text'
              check (source_type in ('text', 'file', 'url')),
  status      text not null default 'ready'
              check (status in ('processing', 'ready', 'error')),
  raw_text    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.knowledge_sources is
  'User-uploaded knowledge documents for RAG retrieval.';

-- 3) knowledge_chunks table --------------------------------------------------
-- text-embedding-3-small produces 1536-dimensional vectors.
create table if not exists public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.knowledge_sources (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  chunk_index  integer not null,
  content      text not null,
  embedding    vector(1536),
  created_at   timestamptz not null default now()
);

comment on table public.knowledge_chunks is
  'Chunked knowledge text with embeddings for vector similarity search.';

-- Index for fast chunk lookups per source
create index if not exists knowledge_chunks_source_id_idx
  on public.knowledge_chunks (source_id);

-- HNSW index for cosine similarity (pgvector) — works with vector_cosine_ops.
-- 1536 dims, m=16, ef_construction=64 is the pgvector default recommendation.
create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 4) updated_at trigger -----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_sources_set_updated_at
  on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

-- 5) match_knowledge_chunks RPC ---------------------------------------------
-- Returns the top-N chunks most similar to the query embedding, scoped to a
-- user_id (RLS also enforces this, but we pass user_id explicitly so the
-- server can call it with the service role and still scope per user).
-- similarity is cosine distance (0 = identical, 2 = opposite).
--
-- NOTE on search_path: Supabase installs the `vector` extension under the
-- `extensions` schema (not `public`), so the `vector` type and the `<=>`
-- operator live there. We set search_path = public, extensions so both the
-- application tables and the vector operator resolve correctly.
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id  uuid,
  match_count    integer default 4,
  filter_source_id uuid default null,
  -- Kept in step with match_knowledge_chunks_filtered in knowledge.sql.
  min_similarity real default 0.35
)
returns table (
  id          uuid,
  source_id   uuid,
  chunk_index integer,
  content     text,
  similarity  real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    kc.id,
    kc.source_id,
    kc.chunk_index,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where
    kc.user_id = match_user_id
    and (filter_source_id is null or kc.source_id = filter_source_id)
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- Service role ONLY. This function is `security definer`, so RLS on
-- knowledge_chunks does not apply to the rows it reads — the caller picks the
-- business via match_user_id, which means any grantee can read any business's
-- knowledge base. Revoke from PUBLIC too: Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and anon/authenticated inherit it.
-- See supabase/rag-security.sql.
revoke execute on function public.match_knowledge_chunks(vector, uuid, integer, uuid, real)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(vector, uuid, integer, uuid, real)
  to service_role;

-- 6) Row Level Security -----------------------------------------------------
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;

-- knowledge_sources: CRUD own
drop policy if exists "knowledge_sources: select own" on public.knowledge_sources;
create policy "knowledge_sources: select own"
  on public.knowledge_sources for select
  using (auth.uid() = user_id);

drop policy if exists "knowledge_sources: insert own" on public.knowledge_sources;
create policy "knowledge_sources: insert own"
  on public.knowledge_sources for insert
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_sources: update own" on public.knowledge_sources;
create policy "knowledge_sources: update own"
  on public.knowledge_sources for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_sources: delete own" on public.knowledge_sources;
create policy "knowledge_sources: delete own"
  on public.knowledge_sources for delete
  using (auth.uid() = user_id);

-- knowledge_chunks: CRUD own (cascades via source_id, but explicit policies
-- are needed for direct inserts from the ingest route).
drop policy if exists "knowledge_chunks: select own" on public.knowledge_chunks;
create policy "knowledge_chunks: select own"
  on public.knowledge_chunks for select
  using (auth.uid() = user_id);

drop policy if exists "knowledge_chunks: insert own" on public.knowledge_chunks;
create policy "knowledge_chunks: insert own"
  on public.knowledge_chunks for insert
  with check (auth.uid() = user_id);

drop policy if exists "knowledge_chunks: delete own" on public.knowledge_chunks;
create policy "knowledge_chunks: delete own"
  on public.knowledge_chunks for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete
  on table public.knowledge_sources to authenticated;
grant select, insert, delete
  on table public.knowledge_chunks to authenticated;
