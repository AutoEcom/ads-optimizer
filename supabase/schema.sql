-- Профил и таргети за rule engine
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  target_cpa numeric(10, 2) not null default 20,
  target_roas numeric(10, 2) not null default 2.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_platform_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('Meta', 'Google')),
  access_token text not null,
  ad_account_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

alter table public.ad_platform_tokens
  add column if not exists ad_account_id text;

alter table public.user_profiles enable row level security;
alter table public.ad_platform_tokens enable row level security;

-- ✅ FIXED POLICIES

drop policy if exists "Профилът е видим само за собственика" on public.user_profiles;
create policy "Профилът е видим само за собственика"
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Профилът се редактира само от собственика" on public.user_profiles;
create policy "Профилът се редактира само от собственика"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Профилът се обновява само от собственика" on public.user_profiles;
create policy "Профилът се обновява само от собственика"
  on public.user_profiles for update
  using (auth.uid() = user_id);

drop policy if exists "Токените са видими само за собственика" on public.ad_platform_tokens;
create policy "Токените са видими само за собственика"
  on public.ad_platform_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "Токените се създават само от собственика" on public.ad_platform_tokens;
create policy "Токените се създават само от собственика"
  on public.ad_platform_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "Токените се обновяват само от собственика" on public.ad_platform_tokens;
create policy "Токените се обновяват само от собственика"
  on public.ad_platform_tokens for update
  using (auth.uid() = user_id);

-- trigger функция
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.handle_updated_at();

drop trigger if exists ad_platform_tokens_updated_at on public.ad_platform_tokens;
create trigger ad_platform_tokens_updated_at
before update on public.ad_platform_tokens
for each row execute function public.handle_updated_at();

-- Snapshot таблица за Daily Digest и трендове
create table if not exists public.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_spend numeric(12, 2) not null default 0,
  total_conversions integer not null default 0,
  avg_cpa numeric(12, 2) not null default 0,
  avg_roas numeric(10, 2) not null default 0,
  campaign_count integer not null default 0,
  campaigns_with_issues integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

alter table public.daily_snapshots enable row level security;

drop policy if exists "Snapshot е видим само за собственика" on public.daily_snapshots;
create policy "Snapshot е видим само за собственика"
  on public.daily_snapshots for select
  using (auth.uid() = user_id);

-- Функция за запис на snapshot по потребител
create or replace function public.capture_daily_snapshot_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_target_cpa numeric(10,2) := 20;
  v_campaign_count integer := 0;
begin
  select target_cpa into v_target_cpa
  from public.user_profiles
  where user_id = p_user_id;

  select count(*) into v_campaign_count
  from public.ad_platform_tokens
  where user_id = p_user_id and is_active = true;

  insert into public.daily_snapshots (
    user_id,
    snapshot_date,
    total_spend,
    total_conversions,
    avg_cpa,
    avg_roas,
    campaign_count,
    campaigns_with_issues,
    metadata
  )
  values (
    p_user_id,
    current_date,
    0,
    0,
    v_target_cpa,
    0,
    v_campaign_count,
    0,
    jsonb_build_object('source', 'scheduled', 'note', 'MVP snapshot placeholder')
  )
  on conflict (user_id, snapshot_date) do update
  set
    avg_cpa = excluded.avg_cpa,
    campaign_count = excluded.campaign_count,
    metadata = excluded.metadata;
end;
$$;

-- Лог на автоматизирани действия (execution loop)
create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('Meta', 'Google')),
  campaign_id text not null,
  campaign_name text not null,
  action_taken text not null check (action_taken in ('PAUSE', 'ACTIVATE')),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.execution_logs enable row level security;

drop policy if exists "Execution logs са видими само за собственика" on public.execution_logs;
create policy "Execution logs са видими само за собственика"
  on public.execution_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Execution logs се създават само от собственика" on public.execution_logs;
create policy "Execution logs се създават само от собственика"
  on public.execution_logs for insert
  with check (auth.uid() = user_id);

-- Профили за монетизация и usage tracking
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  subscription_tier text not null default 'beta' check (subscription_tier in ('free', 'beta', 'pro')),
  ai_requests_count integer not null default 0,
  ai_requests_period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists ai_requests_period_start date not null default date_trunc('month', now())::date;

alter table public.profiles enable row level security;

drop policy if exists "Профилите са видими само за собственика" on public.profiles;
create policy "Профилите са видими само за собственика"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Профилите се създават само от собственика" on public.profiles;
create policy "Профилите се създават само от собственика"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Профилите се обновяват само от собственика" on public.profiles;
create policy "Профилите се обновяват само от собственика"
  on public.profiles for update
  using (auth.uid() = id);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, subscription_tier, ai_requests_count, ai_requests_period_start)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'beta',
    0,
    date_trunc('month', now())::date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.reset_monthly_ai_usage_counts()
returns integer
language plpgsql
security definer
as $$
declare
  v_current_period date := date_trunc('month', now())::date;
  v_affected integer := 0;
begin
  update public.profiles
  set
    ai_requests_count = 0,
    ai_requests_period_start = v_current_period,
    updated_at = now()
  where ai_requests_period_start < v_current_period;

  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;