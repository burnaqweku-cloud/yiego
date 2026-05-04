UPDATE site_settings
  SET value = jsonb_build_object(
    'enabled', true,
    'updated_at', now()::text,
    'updated_by', 'phase2_activation'
  )::text
  WHERE key = 'bulk_dispatch_queue_enabled';

UPDATE site_settings
  SET value = jsonb_build_object(
    'mode', 'manual_bulk',
    'updated_at', now()::text,
    'updated_by', 'phase2_activation'
  )::text
  WHERE key = 'dispatch_mode';

INSERT INTO public.bulk_dispatch_audit (actor_email, action, entity_type, entity_id, previous_value, new_value, metadata)
VALUES
  ('phase2_activation', 'mode_changed', 'site_setting', 'bulk_dispatch_queue_enabled',
    '{"enabled":false}'::jsonb, '{"enabled":true}'::jsonb,
    '{"reason":"Phase 2 activation — master feature flag ON"}'::jsonb),
  ('phase2_activation', 'mode_changed', 'site_setting', 'dispatch_mode',
    '{"mode":"auto"}'::jsonb, '{"mode":"manual_bulk"}'::jsonb,
    '{"reason":"Phase 2 activation — dispatch_mode = manual_bulk"}'::jsonb);