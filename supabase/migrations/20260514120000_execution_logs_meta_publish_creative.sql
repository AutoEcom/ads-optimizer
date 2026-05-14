-- Публикуване на нов креатив в Meta по AI препоръка (лог в История)
alter table public.execution_logs
  drop constraint if exists execution_logs_action_taken_check;

alter table public.execution_logs
  add constraint execution_logs_action_taken_check
  check (
    action_taken in (
      'PAUSE',
      'ACTIVATE',
      'MCP_ADJUST_BUDGET',
      'MCP_PAUSE',
      'MCP_RENAME',
      'META_PUBLISH_CREATIVE'
    )
  );
