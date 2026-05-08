alter table public.ad_platform_tokens
  add column if not exists refresh_token text,
  add column if not exists token_expires_at timestamptz;
