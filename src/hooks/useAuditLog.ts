import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface AuditLogEntry {
  action: string;
  entity_type: string;
  entity_id?: string;
  changes?: Record<string, { before?: any; after?: any }>;
  metadata?: Record<string, any>;
}

export const useAuditLog = () => {
  const { user, profile } = useAuth();

  const log = useCallback(async (entry: AuditLogEntry) => {
    if (!user) return;

    try {
      await supabase.from('audit_logs' as any).insert({
        actor_id: user.id,
        actor_email: profile?.email || user.email || '',
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id || null,
        changes: entry.changes || null,
        metadata: entry.metadata || null,
      });
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }, [user, profile]);

  return { log };
};
