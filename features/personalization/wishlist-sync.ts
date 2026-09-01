import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Minimal typed view of the Supabase query builder covering only the methods
 * actually used here. We don't have a generated `Database` type, so this keeps
 * full type safety on the awaited results without pulling in the full
 * `@supabase/supabase-js` generic surface. `from` is generic so each query can
 * declare its row type once at the call site, eliminating per-call `as any`.
 */
type PResult<T> = { data: T | null; error: { code?: string } | null };

interface PQuery<R = unknown> extends PromiseLike<PResult<R>> {
  select(columns?: string): PQuery<R>;
  insert(values: Record<string, unknown> | unknown[]): PQuery<R>;
  update(values: Record<string, unknown>): PQuery<R>;
  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): PQuery<R>;
  delete(): PQuery<R>;
  eq(column: string, value: unknown): PQuery<R>;
  in(column: string, values: unknown[]): PQuery<R>;
  order(column: string, opts?: { ascending?: boolean }): PQuery<R>;
  limit(count: number): PQuery<R>;
  single(): PQuery<R>;
  maybeSingle(): PQuery<R>;
}

interface PClient {
  from<R = unknown>(table: string): PQuery<R>;
}

type ProductRow = { id: string; slug: string };
type WishlistRow = { product_slug: string | null; product_id: string | null };

export async function syncWishlistOnLogin(
  supabase: SupabaseClient,
  customerId: string,
  slugs: string[],
): Promise<{ synced: number }> {
  // Single boundary cast: we can't satisfy the full SupabaseClient surface with a
  // generated Database type, so we narrow to the typed view above once, here.
  const db: PClient = supabase as unknown as PClient;

  // Global Constraints: max 50, limit 80 chars, dedupe, filter invalid strings, validate active
  const clean = [...new Set(slugs)].slice(0, 50).filter((s) => typeof s === 'string' && s.length > 0 && s.length <= 80);

  if (clean.length === 0) {
    await db.from('wishlist_items').delete().eq('customer_id', customerId);
    return { synced: 0 };
  }

  // Validate against active products, fetch id as well to allow upsert with product_id for legacy compat
  const { data: activeRows, error } = await db
    .from<ProductRow[]>('products')
    .select('id, slug')
    .in('slug', clean)
    .eq('active', true);
  if (error) throw error;
  const activeBySlug = new Map<string, string>((activeRows || []).map((r) => [r.slug, r.id]));
  const active = new Set(activeBySlug.keys());
  const valid = clean.filter((s) => active.has(s));

  if (valid.length === 0) {
    await db.from('wishlist_items').delete().eq('customer_id', customerId);
    return { synced: 0 };
  }

  const validSet = new Set(valid);

  // Fetch existing wishlist rows to compute stale deletions.
  // This avoids PostgREST `not(...in...)` quoting pitfalls and correctly handles NULL semantics:
  // `product_slug NOT IN (...)` would not delete rows where product_slug IS NULL (legacy product_id-only rows).
  const { data: existing, error: existErr } = await db
    .from<WishlistRow[]>('wishlist_items')
    .select('product_slug, product_id')
    .eq('customer_id', customerId);
  if (existErr) throw existErr;

  const existingSlugs: string[] = (existing || [])
    .map((r) => r.product_slug)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  const legacyRows: Array<{ product_id: string }> = (existing || []).filter(
    (r): r is WishlistRow & { product_id: string } =>
      !r.product_slug && typeof r.product_id === 'string' && r.product_id.length > 0,
  );

  // Delete stale slug rows via `in` (postgREST `in` is well-behaved; `not in` with quoted list is error-prone)
  const toDeleteSlugs = [...new Set(existingSlugs.filter((s) => !validSet.has(s)))];
  if (toDeleteSlugs.length > 0) {
    const { error: delErr } = await db
      .from('wishlist_items')
      .delete()
      .eq('customer_id', customerId)
      .in('product_slug', toDeleteSlugs);
    if (delErr) throw delErr;
  }

  // Delete all legacy product_id-only rows. Valid legacy rows will be re-inserted as product_slug rows below,
  // migrating them from id-only to slug-based storage. This is idempotent and avoids duplicate rows for the
  // same product (one via product_id, one via product_slug) which would otherwise be allowed by the separate
  // unique constraints.
  if (legacyRows.length > 0) {
    const legacyIds = [...new Set(legacyRows.map((r) => r.product_id))];
    const { error: delLegacyErr } = await db
      .from('wishlist_items')
      .delete()
      .eq('customer_id', customerId)
      .in('product_id', legacyIds);
    if (delLegacyErr) throw delLegacyErr;
  }

  // Upsert missing valid slugs idempotently. Fetch-existing already removed stale, so we only need to insert
  // valid slugs not already present as slug rows.
  const existingSlugSet = new Set(existingSlugs);
  const toUpsert = valid.filter((s) => !existingSlugSet.has(s));

  // Also need to re-insert valid legacy rows that were just deleted (they were valid but stored as id-only).
  // Those slugs are in valid but not in existingSlugSet, so they are already in toUpsert. Good.

  for (const slug of toUpsert) {
    const productId = activeBySlug.get(slug);
    // Insert with product_slug (required) and product_id if known for legacy compat; product_id nullable per 029:21
    // Use plain insert with duplicate-ignore (23505) instead of upsert with onConflict. The slug unique is a
    // partial index `where product_slug is not null`, so PostgREST `onConflict: 'customer_id,product_slug'`
    // fails with 42P10 on legacy DBs that lack a plain unique. Plain insert works and is idempotent when
    // we filter existingSlugs; duplicate is ignored for race safety. This also handles the separate
    // (customer_id, product_id) unique for legacy rows.
    const row: Record<string, unknown> = { customer_id: customerId, product_slug: slug };
    if (productId) row.product_id = productId;
    // Prefer upsert when plain index exists (e.g. fresh DB), fallback to insert+ignore for partial-index DBs
    let upsertSucceeded = false;
    try {
      const { error: upErr } = await db
        .from('wishlist_items')
        .upsert(row, { onConflict: 'customer_id,product_slug' });
      if (!upErr) {
        upsertSucceeded = true;
      } else if (upErr.code === '42P10') {
        // No plain unique — fallback to insert
      } else if (upErr.code === '23505') {
        // duplicate (race), ignore
        upsertSucceeded = true;
      } else {
        throw upErr;
      }
    } catch (e) {
      const err = e as { code?: string };
      if (err?.code && err.code !== '42P10') throw err;
      // fall through to insert
    }
    if (!upsertSucceeded) {
      const { error: insErr } = await db.from('wishlist_items').insert(row);
      if (insErr && insErr.code !== '23505') throw insErr;
    }
  }

  // For valid slugs that already existed as slug rows, no upsert needed (idempotent).
  // For completeness, if a valid slug existed only as legacy id-row, we deleted it and re-inserted above.

  return { synced: valid.length };
}
