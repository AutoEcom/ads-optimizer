-- Кеш на AI приоритети (Executive View / Health Audit)
create table if not exists public.ai_strategy_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  health_score numeric(8, 2) not null default 0,
  priority_actions jsonb not null default '{"prioritizedActions":[],"killList":[]}'::jsonb,
  last_generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_strategy_cache enable row level security;

drop policy if exists "AI strategy cache е видим само за собственика" on public.ai_strategy_cache;
create policy "AI strategy cache е видим само за собственика"
  on public.ai_strategy_cache for select
  using (auth.uid() = user_id);

drop policy if exists "AI strategy cache insert собственик" on public.ai_strategy_cache;
create policy "AI strategy cache insert собственик"
  on public.ai_strategy_cache for insert
  with check (auth.uid() = user_id);

drop policy if exists "AI strategy cache update собственик" on public.ai_strategy_cache;
create policy "AI strategy cache update собственик"
  on public.ai_strategy_cache for update
  using (auth.uid() = user_id);

drop trigger if exists ai_strategy_cache_updated_at on public.ai_strategy_cache;
create trigger ai_strategy_cache_updated_at
before update on public.ai_strategy_cache
for each row execute function public.handle_updated_at();

-- Realtime: добавяне на ad_platform_tokens към publication (идемпотентно)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ad_platform_tokens'
    ) then
      alter publication supabase_realtime add table public.ad_platform_tokens;
    end if;
  end if;
end $$;
