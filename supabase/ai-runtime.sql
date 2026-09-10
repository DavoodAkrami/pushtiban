-- Phase 2 durable state. Run the entire file in the Supabase SQL Editor.
-- Idempotent; requires ai-actions.sql. No model history or verification secrets.
create table if not exists public.ai_runtime_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('telegram','instagram','preview')),
  connection_id text not null,
  customer_identity_hash text not null check (customer_identity_hash ~ '^[a-f0-9]{64}$'),
  conversation_key_hash text not null check (conversation_key_hash ~ '^[a-f0-9]{64}$'),
  mode text not null default 'ai_active' check (mode in ('ai_active','handoff_pending','human_active','resolved')),
  revision integer not null default 0 check (revision >= 0),
  draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,channel,connection_id,customer_identity_hash,conversation_key_hash),
  check (draft is null or (jsonb_typeof(draft)='object' and octet_length(draft::text)<=8000
    and draft->>'type' in ('create_order','create_reservation')
    and draft->>'phase' in ('collecting','verification_required','confirmation_required','completed','cancelled','expired')))
);
alter table public.ai_runtime_conversations enable row level security;
revoke all on public.ai_runtime_conversations from public, anon, authenticated;
grant select,insert,update,delete on public.ai_runtime_conversations to service_role;

create or replace function public.ai_runtime_load(p_user_id uuid,p_channel text,p_connection_id text,p_customer_hash text,p_conversation_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ai_runtime_conversations;
begin
  if p_channel='telegram' and not exists(select 1 from public.telegram_connections where id::text=p_connection_id and user_id=p_user_id) then raise exception 'invalid connection'; end if;
  if p_channel='instagram' and not exists(select 1 from public.instagram_connections where id::text=p_connection_id and user_id=p_user_id) then raise exception 'invalid connection'; end if;
  if p_channel='preview' and p_connection_id<>p_user_id::text then raise exception 'invalid preview'; end if;
  insert into public.ai_runtime_conversations(user_id,channel,connection_id,customer_identity_hash,conversation_key_hash)
    values(p_user_id,p_channel,p_connection_id,p_customer_hash,p_conversation_hash) on conflict do nothing;
  select * into strict r from public.ai_runtime_conversations where user_id=p_user_id and channel=p_channel and connection_id=p_connection_id and customer_identity_hash=p_customer_hash and conversation_key_hash=p_conversation_hash;
  return jsonb_build_object('id',r.id,'revision',r.revision,'mode',r.mode,'draft',r.draft);
end $$;

create or replace function public.ai_runtime_save(p_user_id uuid,p_id uuid,p_revision integer,p_draft jsonb,p_mode text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ai_runtime_conversations;
begin
  select * into strict r from public.ai_runtime_conversations where id=p_id and user_id=p_user_id for update;
  if r.revision<>p_revision then raise exception 'runtime revision conflict' using errcode='40001'; end if;
  -- A state correction and invalidation share one transaction. An already
  -- executing mutation wins; state must not report that it was cancelled.
  if exists(select 1 from public.business_action_executions where id::text=r.draft#>>'{confirmation,executionId}' and status='executing') then
    raise exception 'action executing';
  end if;
  if (r.draft->>'id' is distinct from p_draft->>'id') or
     (r.draft->'fields' is distinct from p_draft->'fields') or
     (r.draft#>>'{confirmation,executionId}' is not null and p_draft#>>'{confirmation,executionId}' is null) or
     (p_draft->>'phase' in ('cancelled','expired')) or p_mode in ('human_active','handoff_pending') then
    update public.business_action_executions set status='failed', failure_code='draft_superseded',completed_at=now()
    where user_id=p_user_id and channel=r.channel and connection_id::text=r.connection_id
      and customer_identity_hash=r.customer_identity_hash and conversation_key_hash=r.conversation_key_hash
      and status='pending_confirmation';
  end if;
  update public.ai_runtime_conversations set draft=p_draft,mode=p_mode,revision=revision+1,updated_at=now() where id=p_id returning * into r;
  return jsonb_build_object('id',r.id,'revision',r.revision,'mode',r.mode,'draft',r.draft);
end $$;

-- The claim and the current draft are checked inside the database. A stale
-- inline button cannot bypass a correction, cancellation, expiry or human mode.
create or replace function public.ai_runtime_guard_confirmation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare r public.ai_runtime_conversations;
begin
  if old.status='pending_confirmation' and new.status='executing' then
    select * into r from public.ai_runtime_conversations where user_id=new.user_id and channel=new.channel
      and connection_id=new.connection_id::text and customer_identity_hash=new.customer_identity_hash
      and conversation_key_hash=new.conversation_key_hash for update;
    if found and (r.mode<>'ai_active' or (r.draft is not null and new.action_key in ('create_order','create_reservation') and (
      r.draft->>'phase'<>'confirmation_required' or
      (r.draft#>>'{confirmation,executionId}') is distinct from new.id::text or
      (r.draft->>'expiresAt')::timestamptz<=now()))) then
      raise exception 'inactive task confirmation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ai_runtime_confirmation_guard on public.business_action_executions;
create trigger ai_runtime_confirmation_guard before update of status on public.business_action_executions
for each row execute function public.ai_runtime_guard_confirmation();
revoke all on function public.ai_runtime_load(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.ai_runtime_save(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
revoke all on function public.ai_runtime_guard_confirmation() from public,anon,authenticated;
grant execute on function public.ai_runtime_load(uuid,text,text,text,text) to service_role;
grant execute on function public.ai_runtime_save(uuid,uuid,integer,jsonb,text) to service_role;
grant execute on function public.ai_runtime_guard_confirmation() to service_role;
