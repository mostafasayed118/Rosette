import { getAdminClient, type AdminClient } from './client';
import { mapReviewerNames } from './profiles';

export type AdminReviewRow = {
  id: string;
  rating: number;
  body: string;
  photos: string[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  product: { id: string; nameEn: string } | null;
};

const REVIEW_SELECT = 'id,rating,body,photos,status,created_at,reviewed_at,reviewed_by,customer_id,products(name_en)';

export type AdminReviewQueues = { pending: AdminReviewRow[]; approved: AdminReviewRow[] };

export async function listAdminReviewQueues(client: AdminClient = getAdminClient()): Promise<AdminReviewQueues> {
  const [{ data: pendingRows }, { data: approvedRows }] = await Promise.all([
    client.from('product_reviews').select(REVIEW_SELECT).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    client.from('product_reviews').select(REVIEW_SELECT).eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const pending = (pendingRows ?? []) as Array<Record<string, any>>;
  const approved = (approvedRows ?? []) as Array<Record<string, any>>;
  const nameIds = [...pending, ...approved].flatMap((row) => [row?.customer_id, row?.reviewed_by]);
  const names = await mapReviewerNames(nameIds, client);

  const mapRow = (row: Record<string, any>): AdminReviewRow => ({
    id: String(row.id),
    rating: Number(row.rating),
    body: String(row.body),
    photos: Array.isArray(row.photos) ? row.photos.filter((entry: unknown): entry is string => typeof entry === 'string') : [],
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedByName: row.reviewed_by ? names.get(String(row.reviewed_by)) ?? null : null,
    product: row.products ? { id: String(row.products.id), nameEn: String(row.products.name_en ?? '') } : null,
  });

  return { pending: pending.map(mapRow), approved: approved.map(mapRow) };
}
