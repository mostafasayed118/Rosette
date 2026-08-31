import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read path for `admin_audit_logs`.
 *
 * The table is written from ~15 call sites across admin and order actions but
 * had no reader at all, so the audit trail was invisible. It is RLS deny-all
 * for anon/authenticated (migration 028), so this must run through the
 * service-role client.
 */

export type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogQuery = {
  action?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
};

const PAGE_SIZE_FALLBACK = 25;

/** Actions emitted anywhere in the codebase; drives the filter dropdown. */
export const AUDIT_ACTIONS = [
  'create_product',
  'update_product',
  'delete_product',
  'update_inventory',
  'create_promo',
  'update_promo',
  'update_order_status',
  'approve_cancellation',
  'approve_group_cancellation',
  'reject_cancellation',
  'approve_change_request',
  'reject_change_request',
  'issue_gift_card',
  'void_gift_card',
  'resend_gift_card',
  'update_delivery_rule',
  'upsert_delivery_rule',
] as const;

export const AUDIT_TARGET_TYPES = [
  'product',
  'inventory',
  'promo',
  'order',
  'gift_card',
  'delivery_rule',
] as const;

type AuditRow = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles: { email: string | null } | { email: string | null }[] | null;
};

function normalizeActor(value: AuditRow['profiles']): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.email ?? null;
}

export async function listAuditLog(
  client: SupabaseClient,
  query: AuditLogQuery = {},
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const pageSize = Math.max(1, query.pageSize ?? PAGE_SIZE_FALLBACK);
  const page = Math.max(1, query.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let builder = client
    .from('admin_audit_logs')
    .select('id,action,target_type,target_id,metadata,created_at,profiles(email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.action) builder = builder.eq('action', query.action);
  if (query.targetType) builder = builder.eq('target_type', query.targetType);

  const { data, count, error } = await builder;
  if (error || !data) return { rows: [], total: 0 };

  return {
    rows: (data as unknown as AuditRow[]).map((row) => ({
      id: row.id,
      actorEmail: normalizeActor(row.profiles),
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    })),
    total: count ?? 0,
  };
}
