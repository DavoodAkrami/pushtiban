-- Phase 3. Apply after admin.sql, ai-actions.sql and ai-runtime.sql.
-- Service-only operational state; no prompts, reasoning or plaintext message payloads.
begin;
create table if not exists public.ai_inbound_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references public.ai_runtime_conversations(id) on delete cascade,
 channel text not null check(channel in ('telegram','instagram','preview')),
 connection_id text not null,
 external_id text not null check(length(external_id) between 1 and 256),
 event_type text not null check(event_type in ('message','callback','comment','preview')),
 ordering_key bigint,
 receipt_sequence bigint generated always as identity unique,
 received_at timestamptz not null default now(),
 state text not null default 'ready' check(state in ('ready','processing','retryable_failed','completed','permanently_failed','delivery_unknown')),
 lease_token uuid, lease_until timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 4),
 available_at timestamptz not null default now(),
 completed_at timestamptz,
 failure_category text,
 payload_ciphertext text check(octet_length(payload_ciphertext)<=180000),
 replayable boolean not null default true,
 unique(channel,connection_id,external_id),
 check((state='processing') = (lease_token is not null and lease_until is not null))
);
create index if not exists ai_inbound_ready on public.ai_inbound_events(available_at,receipt_sequence) where state in ('ready','retryable_failed','processing');
create index if not exists ai_inbound_conversation on public.ai_inbound_events(conversation_id,receipt_sequence);
create table if not exists public.ai_processing_runs (
 id uuid primary key default gen_random_uuid(),
 inbound_event_id uuid not null unique references public.ai_inbound_events(id) on delete cascade,
 conversation_id uuid not null references public.ai_runtime_conversations(id) on delete cascade,
 started_at timestamptz, ended_at timestamptz,
 stage text not null default 'received', outcome text,
 runtime jsonb, task_revision integer, action_execution_id uuid references public.business_action_executions(id) on delete set null,
 checkpoints jsonb not null default '{}' check(octet_length(checkpoints::text)<=250000),
 failure_category text
);
create table if not exists public.ai_run_events (
 id bigint generated always as identity primary key,
 run_id uuid not null references public.ai_processing_runs(id) on delete cascade,
 code text not null check(code ~ '^[a-z_]{1,64}$'),
 stage text, attempt integer, provider text, model text, capability text,
 failure_category text, duration_ms integer,
 created_at timestamptz not null default now()
);
create index if not exists ai_run_events_run on public.ai_run_events(run_id,id);
create table if not exists public.ai_outbound_deliveries (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.ai_processing_runs(id) on delete cascade,
 operation_key text not null,
 channel text not null check(channel in ('telegram','instagram','preview')),
 response_type text not null,
 request_ciphertext text,
 platform_message_id text,
 state text not null default 'pending' check(state in ('pending','sending','delivered','retryable_failed','permanently_failed','unknown')),
 retry_safe boolean not null default false,
 attempts integer not null default 0 check(attempts between 0 and 4),
 attempted_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), failure_category text,
 unique(run_id,operation_key)
);
alter table public.ai_outbound_deliveries add column if not exists cleanup_state text not null default 'pending' check(cleanup_state in ('pending','done','failed'));
alter table public.ai_outbound_deliveries add column if not exists cleanup_attempts integer not null default 0 check(cleanup_attempts between 0 and 4);
alter table public.ai_outbound_deliveries add column if not exists cleanup_token uuid;
alter table public.ai_outbound_deliveries add column if not exists cleanup_until timestamptz;
create or replace function public.ai_processing_progress_cleanup_claim(p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.ai_outbound_deliveries; value jsonb;
begin
 select x.* into d from public.ai_outbound_deliveries x join public.ai_processing_runs r on r.id=x.run_id
 join public.ai_inbound_events e on e.id=r.inbound_event_id
 where x.operation_key='progress:create' and x.channel='telegram' and x.platform_message_id is not null and x.cleanup_state='pending'
 and x.cleanup_attempts<4 and (x.cleanup_until is null or x.cleanup_until<now())
 and e.state in ('completed','permanently_failed','delivery_unknown')
 order by x.created_at for update of x skip locked limit 1;
 if not found then return null; end if;
 update public.ai_outbound_deliveries set cleanup_attempts=cleanup_attempts+1,cleanup_token=p_token,cleanup_until=now()+interval '30 seconds' where id=d.id returning * into d;
 select jsonb_build_object('delivery',to_jsonb(d),'connection_id',e.connection_id) into value from public.ai_processing_runs r join public.ai_inbound_events e on e.id=r.inbound_event_id where r.id=d.run_id;
 return value;
end $$;
create or replace function public.ai_processing_progress_cleanup_finish(p_id uuid,p_token uuid,p_success boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.ai_outbound_deliveries set cleanup_state=case when p_success then 'done' when cleanup_attempts>=4 then 'failed' else 'pending' end,cleanup_token=null
 where id=p_id and cleanup_token=p_token;
end $$;

create index if not exists ai_delivery_unresolved on public.ai_outbound_deliveries(state) where state in ('sending','unknown','retryable_failed');
create table if not exists public.ai_usage_reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid references public.ai_processing_runs(id) on delete cascade,
 call_key text not null,
 kind text not null check(kind in ('chat','intent','embedding')),
 provider text not null, model text not null,
 reserved_tokens integer not null check(reserved_tokens>=0),
 reserved_messages integer not null check(reserved_messages in (0,1)),
 prompt_tokens integer, cached_input_tokens integer, completion_tokens integer,
 state text not null default 'reserved' check(state in ('reserved','measured','unknown')),
 created_at timestamptz not null default now(),
 unique(user_id,call_key)
);
create index if not exists ai_reservations_quota on public.ai_usage_reservations(user_id,created_at);
alter table public.ai_usage_log add column if not exists reservation_id uuid references public.ai_usage_reservations(id) on delete set null;
create unique index if not exists ai_usage_reservation_once on public.ai_usage_log(reservation_id) where reservation_id is not null;

create or replace function public.ai_processing_receive(p_scope jsonb,p_external_id text,p_type text,p_order bigint,p_payload text,p_replayable boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c jsonb; eid uuid; rid uuid;
begin
 c:=public.ai_runtime_load((p_scope->>'userId')::uuid,p_scope->>'channel',p_scope->>'connectionId',p_scope->>'customerIdentityHash',p_scope->>'conversationKeyHash');
 insert into public.ai_inbound_events(user_id,conversation_id,channel,connection_id,external_id,event_type,ordering_key,payload_ciphertext,replayable)
 values((p_scope->>'userId')::uuid,(c->>'id')::uuid,p_scope->>'channel',p_scope->>'connectionId',p_external_id,p_type,p_order,p_payload,p_replayable)
 on conflict(channel,connection_id,external_id) do nothing returning id into eid;
 if eid is null then select id into strict eid from public.ai_inbound_events where channel=p_scope->>'channel' and connection_id=p_scope->>'connectionId' and external_id=p_external_id; end if;
 insert into public.ai_processing_runs(inbound_event_id,conversation_id) values(eid,(c->>'id')::uuid) on conflict do nothing returning id into rid;
 if rid is not null then insert into public.ai_run_events(run_id,code) values(rid,'inbound_received'); end if;
 return eid;
end $$;

-- Lock only the conversation. The first arrived event cannot be overtaken by
-- a retry; among queued events Telegram update_id orders known arrivals.
create or replace function public.ai_processing_claim(p_event_id uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.ai_inbound_events; r public.ai_processing_runs; cid uuid;
begin
 select conversation_id into cid from public.ai_inbound_events where id=p_event_id;
 if cid is null then return null; end if;
 perform 1 from public.ai_runtime_conversations where id=cid for update;
 select * into strict e from public.ai_inbound_events where id=p_event_id for update;
 if e.state not in ('ready','retryable_failed','processing') or e.available_at>now() or (e.state='processing' and e.lease_until>now()) then return null; end if;
 if exists(select 1 from public.ai_inbound_events x where x.conversation_id=cid and x.id<>e.id and
   ((x.state='processing' and x.lease_until>now()) or
    (x.state in ('ready','retryable_failed','processing') and
      (x.attempts>0 or (e.attempts=0 and
       (coalesce(x.ordering_key,x.receipt_sequence)<coalesce(e.ordering_key,e.receipt_sequence) or
       (coalesce(x.ordering_key,x.receipt_sequence)=coalesce(e.ordering_key,e.receipt_sequence) and x.receipt_sequence<e.receipt_sequence))))))) then return null; end if;
 if e.attempts>=4 or e.received_at<now()-interval '30 minutes' then
   update public.ai_inbound_events set state='permanently_failed',failure_category='retry_exhausted',completed_at=now(),lease_token=null,lease_until=null,payload_ciphertext=null where id=e.id;
   update public.ai_processing_runs set outcome='permanently_failed',failure_category='retry_exhausted',ended_at=now() where inbound_event_id=e.id;
   insert into public.ai_run_events(run_id,code,failure_category) select id,'run_failed','retry_exhausted' from public.ai_processing_runs where inbound_event_id=e.id;
   return null;
 end if;
 -- A late lower Telegram update must not overwrite a later processed correction.
 if e.attempts=0 and e.ordering_key is not null and exists(select 1 from public.ai_inbound_events x where x.conversation_id=cid and x.ordering_key>e.ordering_key and x.attempts>0) then
   update public.ai_inbound_events set state='permanently_failed',failure_category='late_event',completed_at=now(),payload_ciphertext=null where id=e.id;
   update public.ai_processing_runs set outcome='permanently_failed',failure_category='late_event',ended_at=now() where inbound_event_id=e.id;
   insert into public.ai_run_events(run_id,code,failure_category) select id,'run_failed','late_event' from public.ai_processing_runs where inbound_event_id=e.id;
   return null;
 end if;
 update public.ai_inbound_events set state='processing',lease_token=p_token,lease_until=now()+interval '150 seconds',attempts=attempts+1 where id=e.id returning * into e;
 update public.ai_processing_runs set started_at=coalesce(started_at,now()),stage='processing' where inbound_event_id=e.id returning * into strict r;
 -- A crash during a non-idempotent send is an unknown outcome, never a retry.
 update public.ai_outbound_deliveries set state=case when retry_safe then 'retryable_failed' else 'unknown' end,
   failure_category=case when retry_safe then 'delivery_failed' else 'delivery_unknown' end
 where run_id=r.id and state='sending';
 insert into public.ai_run_events(run_id,code,attempt) values(r.id,case when e.attempts>1 then 'lease_recovered' else 'processing_claimed' end,e.attempts);
 return jsonb_build_object('event',to_jsonb(e),'run',to_jsonb(r));
end $$;

create or replace function public.ai_processing_assert(p_event_id uuid,p_token uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ai_runtime_conversations where id=(select conversation_id from public.ai_inbound_events where id=p_event_id) for update;
 perform 1 from public.ai_inbound_events where id=p_event_id and state='processing' and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'lease_conflict' using errcode='40001'; end if;
end $$;

-- Budget, checkpoint and operational trace updates share one fenced transaction.
create or replace function public.ai_processing_update(p_event_id uuid,p_token uuid,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ai_processing_runs; oldcount jsonb; k text; v jsonb;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select * into strict r from public.ai_processing_runs where inbound_event_id=p_event_id for update;
 if p_patch ? 'runtime' then
   if r.runtime is not null then
     if r.runtime->'budget' is distinct from p_patch#>'{runtime,budget}' or r.runtime->'startedAt' is distinct from p_patch#>'{runtime,startedAt}' then raise exception 'budget_reset'; end if;
     for k,v in select * from jsonb_each(r.runtime->'counts') loop
       if (p_patch#>>array['runtime','counts',k])::bigint < v::text::bigint then raise exception 'budget_reset'; end if;
     end loop;
   end if;
   update public.ai_processing_runs set runtime=p_patch->'runtime',started_at=coalesce(started_at,now()) where id=r.id;
 end if;
 if p_patch ? 'checkpoint_key' then
   update public.ai_processing_runs set checkpoints=checkpoints||jsonb_build_object(p_patch->>'checkpoint_key',p_patch->'checkpoint_value') where id=r.id;
 end if;
 if p_patch ? 'action_execution_id' then
   if not exists(select 1 from public.business_action_executions a join public.ai_inbound_events e on e.id=p_event_id where a.id=(p_patch->>'action_execution_id')::uuid and a.user_id=e.user_id and a.connection_id::text=e.connection_id) then raise exception 'invalid action reference'; end if;
   update public.ai_processing_runs set action_execution_id=(p_patch->>'action_execution_id')::uuid where id=r.id;
 end if;
 if p_patch ? 'stage' then
   update public.ai_processing_runs set stage=p_patch->>'stage',failure_category=case when p_patch->>'stage'='runtime_failed' then p_patch->>'failure_category' else failure_category end where id=r.id;
   insert into public.ai_run_events(run_id,code,stage,attempt,provider,model,capability,failure_category)
   select r.id,p_patch->>'stage',p_patch->>'stage',attempts,p_patch->>'provider',p_patch->>'model',p_patch->>'capability',p_patch->>'failure_category' from public.ai_inbound_events where id=p_event_id;
 end if;
 select * into strict r from public.ai_processing_runs where id=r.id;
 return to_jsonb(r);
end $$;

create or replace function public.ai_processing_finish(p_event_id uuid,p_token uuid,p_state text,p_category text,p_delay integer default 0)
returns void language plpgsql security invoker set search_path='' as $$
declare s text; r uuid; terminal_category text;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 if p_state not in ('completed','retryable_failed','permanently_failed','delivery_unknown') then raise exception 'invalid transition'; end if;
 s:=p_state;
 select id into strict r from public.ai_processing_runs where inbound_event_id=p_event_id;
 if exists(select 1 from public.ai_outbound_deliveries where run_id=r and state in ('unknown','sending') and not retry_safe) then s:='delivery_unknown'; end if;
 if s='completed' and exists(select 1 from public.ai_outbound_deliveries where run_id=r and response_type<>'progress' and state='retryable_failed') then s:='retryable_failed'; end if;
 if s='completed' and exists(select 1 from public.ai_outbound_deliveries where run_id=r and response_type<>'progress' and state='permanently_failed') and not exists(select 1 from public.ai_outbound_deliveries where run_id=r and response_type<>'progress' and state='delivered') then s:='permanently_failed'; end if;
 if s='retryable_failed' and (select attempts>=4 from public.ai_inbound_events where id=p_event_id) then s:='permanently_failed'; end if;
 terminal_category:=coalesce(p_category,case when s='delivery_unknown' then 'delivery_unknown' when s in ('retryable_failed','permanently_failed') then 'delivery_failed' end);
 update public.ai_inbound_events set state=s,failure_category=terminal_category,lease_token=null,lease_until=null,
 available_at=now()+make_interval(secs=>least(300,greatest(1,p_delay))),completed_at=case when s='retryable_failed' then null else now() end,
 payload_ciphertext=case when s in ('completed','permanently_failed','delivery_unknown') then null else payload_ciphertext end where id=p_event_id;
 update public.ai_processing_runs set outcome=case when s='completed' and failure_category is not null then 'failed' else s end,failure_category=coalesce(terminal_category,failure_category),ended_at=case when s='retryable_failed' then null else now() end where id=r;
 insert into public.ai_run_events(run_id,code,failure_category) values(r,case when s='retryable_failed' then 'retry_scheduled' when s='completed' then 'run_completed' else 'run_failed' end,terminal_category);
end $$;

-- The journaled TaskDraft CAS and checkpoint commit together. Replaying the
-- same save returns the existing structured state without a second transition.
create or replace function public.ai_processing_save_draft(p_event_id uuid,p_token uuid,p_key text,p_user_id uuid,p_id uuid,p_revision integer,p_draft jsonb,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ai_processing_runs; value jsonb;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select * into strict r from public.ai_processing_runs where inbound_event_id=p_event_id for update;
 if r.conversation_id<>p_id or not exists(select 1 from public.ai_inbound_events where id=p_event_id and user_id=p_user_id) then raise exception 'invalid scope'; end if;
 if r.checkpoints ? p_key then return r.checkpoints->p_key; end if;
 value:=public.ai_runtime_save(p_user_id,p_id,p_revision,p_draft,p_mode);
 update public.ai_processing_runs set checkpoints=checkpoints||jsonb_build_object(p_key,value),task_revision=(value->>'revision')::integer where id=r.id;
 return value;
end $$;

create or replace function public.ai_delivery_begin(p_event_id uuid,p_token uuid,p_key text,p_channel text,p_type text,p_request text,p_retry_safe boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r uuid; d public.ai_outbound_deliveries;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select id into strict r from public.ai_processing_runs where inbound_event_id=p_event_id;
 insert into public.ai_outbound_deliveries(run_id,operation_key,channel,response_type,request_ciphertext,retry_safe)
 values(r,p_key,p_channel,p_type,p_request,p_retry_safe) on conflict do nothing;
 select * into strict d from public.ai_outbound_deliveries where run_id=r and operation_key=p_key for update;
 if d.state in ('pending','retryable_failed') and d.attempts<4 then
   update public.ai_outbound_deliveries set state='sending',attempts=attempts+1,attempted_at=now() where id=d.id returning * into d;
   insert into public.ai_run_events(run_id,code) values(r,'delivery_attempted');
   return to_jsonb(d)||'{"dispatch":true}'::jsonb;
 end if;
 return to_jsonb(d)||'{"dispatch":false}'::jsonb;
end $$;
create or replace function public.ai_delivery_finish(p_event_id uuid,p_token uuid,p_id uuid,p_state text,p_message_id text,p_category text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 if p_state not in ('delivered','retryable_failed','permanently_failed','unknown') then raise exception 'invalid delivery transition'; end if;
 update public.ai_outbound_deliveries d set state=p_state,platform_message_id=p_message_id,failure_category=p_category,
 completed_at=case when p_state='retryable_failed' then null else now() end
 from public.ai_processing_runs r where r.id=d.run_id and r.inbound_event_id=p_event_id and d.id=p_id and d.state='sending';
 if not found then raise exception 'invalid delivery transition'; end if;
 if p_state='delivered' and exists(select 1 from public.ai_outbound_deliveries where id=p_id and operation_key like 'progress:deleteMessage:%') then
 update public.ai_outbound_deliveries set cleanup_state='done' where run_id=(select run_id from public.ai_outbound_deliveries where id=p_id) and operation_key='progress:create';
 end if;
 insert into public.ai_run_events(run_id,code,failure_category) select id,'delivery_'||p_state,p_category from public.ai_processing_runs where inbound_event_id=p_event_id;
end $$;

-- Reservation uses the same legacy billing unit: completed chat calls count
-- as messages; intent calls consume tokens only. Unknown usage stays reserved.
create or replace function public.ai_usage_reserve(p_user_id uuid,p_run_id uuid,p_key text,p_kind text,p_provider text,p_model text,p_tokens integer,p_event_id uuid,p_token uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare l public.ai_business_limits; used_tokens bigint; used_messages bigint; reservation uuid;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 if p_tokens<0 or p_tokens>80000 then raise exception 'invalid token reservation'; end if;
 select * into l from public.ai_business_limits where user_id=p_user_id for update;
 if not found then raise exception 'quota_unavailable'; end if;
 select id into reservation from public.ai_usage_reservations where user_id=p_user_id and call_key=p_key;
 if reservation is not null then return reservation; end if;
 if p_run_id is not null and not exists(select 1 from public.ai_processing_runs r join public.ai_inbound_events e on e.id=r.inbound_event_id where r.id=p_run_id and e.user_id=p_user_id and e.id=p_event_id) then raise exception 'invalid run'; end if;

 if l.ai_blocked then raise exception 'quota_blocked'; end if;
 select coalesce(sum(total_tokens),0),count(*) filter(where kind='chat') into used_tokens,used_messages from public.ai_usage_log where user_id=p_user_id and created_at>=date_trunc('month',now());
 select used_tokens+coalesce(sum(reserved_tokens),0),used_messages+coalesce(sum(reserved_messages),0) into used_tokens,used_messages
 from public.ai_usage_reservations where user_id=p_user_id and created_at>=date_trunc('month',now()) and state in ('reserved','unknown') and kind<>'embedding';
 if l.monthly_token_limit is not null and used_tokens+p_tokens>l.monthly_token_limit then raise exception 'quota_tokens'; end if;
 if l.monthly_message_limit is not null and used_messages+(case when p_kind='chat' then 1 else 0 end)>l.monthly_message_limit then raise exception 'quota_messages'; end if;
 insert into public.ai_usage_reservations(user_id,run_id,call_key,kind,provider,model,reserved_tokens,reserved_messages)
 values(p_user_id,p_run_id,p_key,p_kind,p_provider,p_model,p_tokens,case when p_kind='chat' then 1 else 0 end) returning id into reservation;
 return reservation;
end $$;
create or replace function public.ai_usage_reconcile(p_id uuid,p_input integer,p_output integer,p_cached integer)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.ai_usage_reservations;
begin
 select * into strict r from public.ai_usage_reservations where id=p_id;
 perform 1 from public.ai_business_limits where user_id=r.user_id for update;
 select * into strict r from public.ai_usage_reservations where id=p_id for update;
 if r.state='measured' then return; end if;
 if p_input is null or p_output is null then update public.ai_usage_reservations set state='unknown' where id=p_id; return; end if;
 if p_input<0 or p_output<0 or coalesce(p_cached,0)<0 then raise exception 'invalid usage'; end if;
 update public.ai_usage_reservations set state='measured',prompt_tokens=p_input,completion_tokens=p_output,cached_input_tokens=p_cached where id=p_id;
 -- Embeddings remain separately attributable and do not change billing rules.
 if r.kind<>'embedding' then
 insert into public.ai_usage_log(user_id,kind,provider,model,prompt_tokens,completion_tokens,total_tokens,reservation_id)
 values(r.user_id,r.kind,r.provider,r.model,p_input,p_output,p_input+p_output,r.id) on conflict do nothing;
 end if;
end $$;

-- Payloads/checkpoints are short-lived recovery data. Keep metadata for support.
create or replace function public.ai_processing_cleanup()
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.ai_outbound_deliveries set cleanup_state='failed',cleanup_token=null
 where cleanup_state='pending' and cleanup_attempts>=4 and cleanup_until<now();
 update public.ai_inbound_events set payload_ciphertext=null where received_at<now()-interval '30 minutes';
 update public.ai_processing_runs r set checkpoints='{}' from public.ai_inbound_events e where e.id=r.inbound_event_id and e.received_at<now()-interval '30 minutes' and r.checkpoints<>'{}';
 update public.ai_outbound_deliveries set request_ciphertext=null where created_at<now()-interval '30 minutes' and (operation_key<>'progress:create' or cleanup_state in ('done','failed'));
end $$;

-- Link a confirmation claim and its event in the same transaction.
create or replace function public.ai_processing_action_claim(p_event_id uuid,p_token uuid,p_execution_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.ai_inbound_events;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select * into strict e from public.ai_inbound_events where id=p_event_id;
 update public.business_action_executions set status='executing',execution_started_at=now()
 where id=p_execution_id and user_id=e.user_id and connection_id::text=e.connection_id and customer_identity_hash=(select customer_identity_hash from public.ai_runtime_conversations where id=e.conversation_id) and conversation_key_hash=(select conversation_key_hash from public.ai_runtime_conversations where id=e.conversation_id) and status='pending_confirmation';
 if not found then return false; end if;
 update public.ai_processing_runs set action_execution_id=p_execution_id where inbound_event_id=p_event_id;
 insert into public.ai_run_events(run_id,code,capability) select id,'action_prepared',(select action_key from public.business_action_executions where id=p_execution_id) from public.ai_processing_runs where inbound_event_id=p_event_id;
 return true;
end $$;

-- Hold the event fence for the entire internal business transaction. The
-- registered existing RPC still owns confirmation, inventory and idempotency.
create or replace function public.ai_processing_mutate(p_event_id uuid,p_token uuid,p_operation text,p_arguments jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.ai_inbound_events; a public.business_action_executions; c public.ai_runtime_conversations; result jsonb;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select * into strict e from public.ai_inbound_events where id=p_event_id;
 select * into strict c from public.ai_runtime_conversations where id=e.conversation_id for update;
 select * into strict a from public.business_action_executions where id=(p_arguments->>'p_execution_id')::uuid and user_id=e.user_id and connection_id::text=e.connection_id and customer_identity_hash=c.customer_identity_hash and conversation_key_hash=c.conversation_key_hash for update;
 if (p_arguments->>'p_user_id')::uuid<>e.user_id or a.status<>'executing' or c.mode<>'ai_active' then raise exception 'authorization_denied'; end if;
 if not exists(select 1 from public.ai_global_settings where id=1 and ai_enabled) or not exists(select 1 from public.ai_assistant_settings where user_id=e.user_id and is_enabled and (case e.channel when 'telegram' then coalesce(telegram_enabled,true) when 'instagram' then coalesce(instagram_enabled,true) else false end)) then raise exception 'authorization_denied'; end if;
 if a.requires_confirmation and (a.confirmation_expires_at is null or a.confirmation_expires_at<=now()) then raise exception 'authorization_denied'; end if;
 if a.action_key in ('create_order','create_reservation') and c.draft is not null and (c.draft#>>'{confirmation,executionId}' is distinct from a.id::text or (c.draft->>'expiresAt')::timestamptz<=now()) then raise exception 'authorization_denied'; end if;
 if p_operation='business_data_create_order_action' and a.action_key='create_order' then
 result:=public.business_data_create_order_action(e.user_id,a.id,(p_arguments->>'p_product_record_id')::uuid,p_arguments->>'p_expected_product_reference',(p_arguments->>'p_expected_unit_price')::numeric,(p_arguments->>'p_quantity')::integer,p_arguments->'p_customer_values');
 elsif p_operation='business_data_create_reservation_action' and a.action_key='create_reservation' then
 result:=public.business_data_create_reservation_action(e.user_id,a.id,p_arguments->>'p_date',p_arguments->>'p_time',(p_arguments->>'p_party_size')::integer,p_arguments->'p_customer_values');
 elsif p_operation='business_data_cancel_action' and a.action_key in ('cancel_order','cancel_reservation') and a.action_key=p_arguments->>'p_action_key' then
 result:=public.business_data_cancel_action(e.user_id,a.id,a.action_key,(p_arguments->>'p_record_id')::uuid,e.channel,e.connection_id::uuid,a.customer_identity_hash);
 else raise exception 'authorization_denied'; end if;
 update public.ai_processing_runs set action_execution_id=a.id where inbound_event_id=e.id;
 insert into public.ai_run_events(run_id,code,capability) select id,'mutation_executed',a.action_key from public.ai_processing_runs where inbound_event_id=e.id;
 return result;
end $$;

create or replace function public.ai_processing_memory(p_event_id uuid,p_token uuid,p_key text,p_chat text,p_turns jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.ai_inbound_events; r public.ai_processing_runs;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select * into strict e from public.ai_inbound_events where id=p_event_id;
 select * into strict r from public.ai_processing_runs where inbound_event_id=p_event_id;
 if r.checkpoints ? p_key then return; end if;
 if jsonb_typeof(p_turns)<>'array' or jsonb_array_length(p_turns)>8 or octet_length(p_turns::text)>18000 then raise exception 'invalid memory'; end if;
 if not exists(select 1 from public.ai_runtime_conversations where id=e.conversation_id and conversation_key_hash=encode(sha256(convert_to(e.channel||':'||e.connection_id||':'||p_chat,'UTF8')),'hex')) then raise exception 'invalid memory scope'; end if;
 if e.channel='telegram' then
 insert into public.telegram_chat_sessions(telegram_connection_id,chat_id,turns,last_seen_at) values(e.connection_id::uuid,p_chat::bigint,p_turns,now()) on conflict(telegram_connection_id,chat_id) do update set turns=excluded.turns,last_seen_at=excluded.last_seen_at;
 elsif e.channel='instagram' then
 insert into public.instagram_chat_sessions(instagram_connection_id,sender_id,turns,last_seen_at) values(e.connection_id::uuid,p_chat,p_turns,now()) on conflict(instagram_connection_id,sender_id) do update set turns=excluded.turns,last_seen_at=excluded.last_seen_at;
 else raise exception 'invalid memory channel'; end if;
 update public.ai_processing_runs set checkpoints=checkpoints||jsonb_build_object(p_key,true) where id=r.id;
end $$;

-- Existing inbox writes use the same event journal, independently of delivery.
create or replace function public.ai_processing_inbox(p_event_id uuid,p_token uuid,p_key text,p_customer text,p_text text,p_reason text,p_username text,p_display text,p_execution uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.ai_inbound_events; r public.ai_processing_runs; cid uuid; value jsonb;
begin
 perform public.ai_processing_assert(p_event_id,p_token);
 select * into strict e from public.ai_inbound_events where id=p_event_id;
 select * into strict r from public.ai_processing_runs where inbound_event_id=p_event_id;
 if r.checkpoints ? p_key then
 select to_jsonb(c) into strict value from public.support_conversations c where id=(r.checkpoints->>p_key)::uuid;
 return value;
 end if;
 if length(p_text)>10000 then raise exception 'invalid support input'; end if;
 if p_execution is not null and not exists(select 1 from public.business_action_executions where id=p_execution and user_id=e.user_id and connection_id::text=e.connection_id) then raise exception 'invalid action reference'; end if;
 select id into cid from public.support_conversations where user_id=e.user_id and channel=e.channel and customer_external_id=p_customer and
 (case e.channel when 'telegram' then telegram_connection_id::text=e.connection_id else instagram_connection_id::text=e.connection_id end) and status in ('open','answered') order by last_customer_message_at desc limit 1 for update;
 if cid is null then
 insert into public.support_conversations(user_id,channel,telegram_connection_id,instagram_connection_id,customer_external_id,customer_telegram_id,customer_username,customer_display_name,status,queued_reason,last_customer_message_text,last_customer_message_at)
 values(e.user_id,e.channel,case when e.channel='telegram' then e.connection_id::uuid end,case when e.channel='instagram' then e.connection_id::uuid end,p_customer,case when e.channel='telegram' then p_customer::bigint end,p_username,p_display,'open',p_reason,p_text,now()) returning id into cid;
 end if;
 insert into public.support_messages(conversation_id,role,content,action_execution_id) values(cid,'customer',p_text,p_execution) on conflict do nothing;
 update public.support_conversations set last_customer_message_text=p_text,last_customer_message_at=now(),status='open' where id=cid;
 update public.ai_processing_runs set checkpoints=checkpoints||jsonb_build_object(p_key,cid) where id=r.id;
 select to_jsonb(c) into value from public.support_conversations c where id=cid;
 return value;
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['ai_inbound_events','ai_processing_runs','ai_run_events','ai_outbound_deliveries','ai_usage_reservations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 grant usage,select on sequence public.ai_inbound_events_receipt_sequence_seq,public.ai_run_events_id_seq to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'ai_processing_%' or p.proname in ('ai_delivery_begin','ai_delivery_finish','ai_usage_reserve','ai_usage_reconcile')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
