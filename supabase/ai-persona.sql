-- =============================================================================
-- Pushtiban — AI assistant persona (business intro, owner instructions, style)
-- Paste and run this whole file in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Extends public.ai_assistant_settings (created by supabase/ai-assistant.sql)
-- with the per-business personalization the assistant injects into its system
-- prompt. Business name and category are NOT duplicated here — they already
-- live on public.profiles and are read from there.
-- =============================================================================

alter table public.ai_assistant_settings
  add column if not exists business_intro         text not null default '',
  add column if not exists assistant_instructions text not null default '',
  add column if not exists tone_warmth            text not null default 'default',
  add column if not exists tone_enthusiasm        text not null default 'default',
  add column if not exists format_structure       text not null default 'default',
  add column if not exists format_emoji           text not null default 'default';

comment on column public.ai_assistant_settings.business_intro is
  'Free-text description of the business the assistant always knows (used mainly for introductions). Empty = omitted from the prompt.';

comment on column public.ai_assistant_settings.assistant_instructions is
  'Free-text owner instructions on how the assistant should behave. Empty = omitted from the prompt.';

comment on column public.ai_assistant_settings.tone_warmth is
  'Style level: less | default | more. Only non-default levels reach the system prompt.';

comment on column public.ai_assistant_settings.tone_enthusiasm is
  'Style level: less | default | more.';

comment on column public.ai_assistant_settings.format_structure is
  'Style level for headings and bullet lists: less | default | more.';

comment on column public.ai_assistant_settings.format_emoji is
  'Style level for emoji usage: less | default | more.';

-- Check constraints — dropped first so re-running this file is safe.
do $$
declare
  style_column text;
begin
  foreach style_column in array array[
    'tone_warmth', 'tone_enthusiasm', 'format_structure', 'format_emoji'
  ] loop
    execute format(
      'alter table public.ai_assistant_settings drop constraint if exists ai_assistant_settings_%s_check',
      style_column
    );
    execute format(
      'alter table public.ai_assistant_settings add constraint ai_assistant_settings_%1$s_check check (%1$s in (''less'', ''default'', ''more''))',
      style_column
    );
  end loop;
end;
$$;

-- Keep the free-text fields bounded so a paste-bomb cannot inflate every
-- prompt (the API route enforces the same limits before writing).
alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_business_intro_check;
alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_business_intro_check
  check (char_length(business_intro) <= 1500);

alter table public.ai_assistant_settings
  drop constraint if exists ai_assistant_settings_assistant_instructions_check;
alter table public.ai_assistant_settings
  add constraint ai_assistant_settings_assistant_instructions_check
  check (char_length(assistant_instructions) <= 1500);
