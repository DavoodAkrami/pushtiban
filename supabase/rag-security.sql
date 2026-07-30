-- ---------------------------------------------------------------------------
-- Lock the vector-search functions to the service role.
--
-- The three match_* functions are `security definer`, so they run with the
-- owner's rights and RLS on knowledge_chunks / ai_knowledge_qa does NOT apply
-- to the rows they read. They were also granted to `anon` and `authenticated`.
--
-- `anon` is the key shipped to every browser in NEXT_PUBLIC_SUPABASE_ANON_KEY,
-- so anyone holding it could call the RPC with another business's user id and
-- read that business's entire knowledge base — the per-business `user_id`
-- filter inside the function is honoured, but the caller chooses which
-- business to filter for. Verified against production before writing this.
--
-- Nothing in the app is affected: every caller of these functions goes through
-- createAdminClient() (service role) in src/lib/ai/rag.ts. No browser or
-- server-component code calls them.
--
-- REVOKING FROM `anon, authenticated` IS NOT ENOUGH. PostgreSQL grants EXECUTE
-- on every newly created function to the PUBLIC pseudo-role by default, and
-- anon/authenticated inherit it. The revoke must name PUBLIC or the functions
-- stay wide open — verified empirically: after revoking only anon and
-- authenticated, the anon key still returned another business's Q&A rows.
--
-- Idempotent: revoke is a no-op when the grant is already gone, and the
-- revoke/grant pair is safe to re-run.
-- ---------------------------------------------------------------------------

revoke execute on function public.match_knowledge_chunks(vector, uuid, integer, uuid, real)
  from public, anon, authenticated;
grant  execute on function public.match_knowledge_chunks(vector, uuid, integer, uuid, real)
  to service_role;

revoke execute on function public.match_knowledge_chunks_filtered(vector, uuid, integer, text, uuid, real)
  from public, anon, authenticated;
grant  execute on function public.match_knowledge_chunks_filtered(vector, uuid, integer, text, uuid, real)
  to service_role;

revoke execute on function public.match_knowledge_qa(vector, uuid, text, integer, real)
  from public, anon, authenticated;
grant  execute on function public.match_knowledge_qa(vector, uuid, text, integer, real)
  to service_role;
