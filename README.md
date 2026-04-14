# AdGuard AI

V1 MVP за мониторинг и оптимизация на Meta/Google Ads.

## Стартиране

1. Инсталирай зависимости: `npm install`
2. Копирай `.env.example` в `.env.local` и попълни стойностите.
3. Пусни приложението: `npm run dev`

## Supabase схема

Изпълни SQL от `supabase/schema.sql` в Supabase SQL Editor.

- `user_profiles` пази целеви CPA/ROAS за всеки потребител.
- `ad_platform_tokens` пази ръчно въведени токени за MVP интеграциите.
- `daily_snapshots` пази дневна снимка за трендове в Daily Digest.

## Snapshot автоматизация

- Edge Function: `supabase/functions/daily-snapshot/index.ts`
- Cron: `.github/workflows/daily-snapshot-cron.yml`

Нужни secrets:

- `SUPABASE_FUNCTION_URL` (пример: `https://<project-ref>.functions.supabase.co`)
- `CRON_SECRET` (стойност, която съвпада с env `CRON_SECRET` в Edge Function)
- `PROJECT_URL` (пример: `https://<project-ref>.supabase.co`)
- `SERVICE_ROLE_KEY` (service role ключът на проекта)

## AI слой

- `POST /api/ai/audit` прави сравнителен одит спрямо таргетите.
- `POST /api/ai/generate` връща 3 рекламни вариации.
- При липса на `ANTHROPIC_API_KEY` се използва вграден fallback.
