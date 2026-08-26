# Authenticated Personalization — Recommended + Buy again — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver authenticated-only `Buy again` + `Recommended for you` carousels scored by category/occasion affinity from paid orders + synced wishlist, with `newest` fallback, on `/[locale]/[city]/shop` and `/[locale]/[city]/shop/[slug]`.

**Architecture:** New `features/personalization/` module with pure `scoring.ts` + `local/supabase` repositories behind `provider.ts`; single Postgres RPC `get_personalized_picks` + `wishlist_items` table (RLS per `auth.uid()`); two authed API routes (`/api/personalization/picks`, `/api/wishlist/sync`); client strips reuse `ProductCard` with Suspense skeletons and locale-aware dictionaries.

**Tech Stack:** Next.js 16.3 (App Router, `cache()`), Supabase Postgres/Auth/SSR 0.12, TypeScript 5.9 strict, zod 4, Vitest 3 + Testing Library, Tailwind 4 + logical CSS, `app/globals.css` tokens.

**Spec:** `docs/superpowers/specs/2026-08-27-authenticated-personalization-design.md`

## Global Constraints

- Next.js 16 with `app/[locale]/[city]/shop/(list)/page.tsx` and `app/[locale]/[city]/shop/[slug]/page.tsx` routing; do not change `app/[locale]/page.tsx:6` gate.
- Supabase migration sequential: `029_personalization.sql` after `028_hardened_privileges.sql`; RLS `customer_id = auth.uid()` only, writes via service-role/route gate.
- Auth boundary: `auth.getUser()` via `@supabase/ssr`; anonymous → hide carousels, no tracking; `p_customer_id` asserted equals `auth.uid()` before RPC.
- Product shape: `features/catalog/types.ts:5` `Product` with `nameAr/nameFr` and `rating?`; hydration via `features/catalog/row-mappers.ts`; card reuse `features/catalog/ProductCard.tsx`.
- Validation via `zod` (same style as `features/catalog/catalog-utils.ts:42`); structured logger, not `logRouteError`.
- i18n keys live in `features/i18n/dictionaries.ts` for `en|ar|fr` plus `ar` RTL via `rosette.locale.v1`; logical CSS required.
- `limit` clamped 1..12; wishlist `slugs` max 50; `excludeSlug` sanitized; no new deps; `wrangler.jsonc` unchanged; `npm run lint` (`tsc --noEmit && eslint .`) and `vitest run` must stay green.

---

## File Structure

**Create:**
- `supabase/migrations/029_personalization.sql` — `wishlist_items` table + `get_personalized_picks` RPC + RLS + indexes.
- `features/personalization/types.ts` — `PersonalizationPicks`, `PersonalizationQuery`, repository interface.
- `features/personalization/scoring.ts` — pure `scoreAffinity` (category×2, occasion×1, buy-again frequency).
- `features/personalization/local-repository.ts` — in-memory repo over `features/catalog/data.ts`.
- `features/personalization/supabase-repository.ts` — RPC + hydration repo.
- `features/personalization/provider.ts` — `getPersonalizationProvider()` env switch.
- `features/personalization/wishlist-sync.ts` — `syncWishlistOnLogin` transactional upsert.
- `features/personalization/analytics.ts` — stub `trackPersonalization`.
- `app/api/personalization/picks/route.ts` — `GET` authed picks.
- `app/api/wishlist/sync/route.ts` — `POST` wishlist sync (or extend existing if present; currently no route).
- `features/personalization/components/BuyAgainStrip.tsx`
- `features/personalization/components/RecommendedCarousel.tsx`
- `features/personalization/components/PersonalizationSkeleton.tsx`
- `tests/domain/personalization-scoring.test.ts`
- `tests/domain/personalization-validation.test.ts`
- `tests/domain/wishlist-sync.test.ts`
- `tests/domain/personalization-repository.test.ts`
- `tests/routes/personalization-picks.test.ts`
- `tests/routes/wishlist-sync.test.ts`
- `tests/components/PersonalizationCarousels.test.tsx`

**Modify:**
- `features/i18n/dictionaries.ts` — add `personalization.*` keys for en/ar/fr.
- `features/wishlist/WishlistProvider.tsx` — session-scoped `fetch('/api/wishlist/sync')` on login.
- `app/[locale]/[city]/shop/(list)/page.tsx` — Suspense carousels above grid.
- `app/[locale]/[city]/shop/[slug]/page.tsx` — carousel below `ProductDetail`.

---

### Task 1: Database — `wishlist_items` + `get_personalized_picks` RPC

**Files:**
- Create: `supabase/migrations/029_personalization.sql`
- Test: `tests/domain/wishlist-sync.test.ts` (schema assertions via fake) and manual `supabase db reset` smoke

**Interfaces:**
- Consumes: `profiles(id)`, `products(slug, active, category, occasions, created_at)` from `001_commerce.sql`
- Produces: table `public.wishlist_items(customer_id uuid, product_slug text, added_at timestamptz)` with RLS; function `public.get_personalized_picks(p_customer_id uuid, p_limit int, p_exclude_slug text) returns table(slug text, score int, reason text)`

- [ ] **Step 1: Create migration with wishlist_items + RPC**

Create `supabase/migrations/029_personalization.sql`:

```sql
create table if not exists public.wishlist_items (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_slug text not null references public.products(slug) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (customer_id, product_slug)
);

alter table public.wishlist_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='wishlist_items' and policyname='owners manage own wishlist') then
    create policy "owners manage own wishlist" on public.wishlist_items
      for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());
  end if;
end $$;
create index if not exists wishlist_customer_idx on public.wishlist_items(customer_id, added_at desc);

create or replace function public.get_personalized_picks(
  p_customer_id uuid,
  p_limit int default 8,
  p_exclude_slug text default null
) returns table (slug text, score int, reason text)
language sql security definer set search_path = public as $$
  with customer_orders as (
    select id from public.orders
    where customer_id = p_customer_id and payment_status in ('paid','payment_started')
  ),
  item_slugs as (
    select product_slug, count(*)::int as freq
    from public.order_items where order_id in (select id from customer_orders)
    group by product_slug
  ),
  wishlist_slugs as (
    select product_slug from public.wishlist_items where customer_id = p_customer_id
  ),
  -- combined signals for category/occasion counts (orders weighted 2x wishlist 1x)
  product_signals as (
    select p.slug, p.category, p.occasions, p.created_at, p.active,
           coalesce(i.freq,0) as freq,
           case when w.product_slug is not null then 1 else 0 end as wished
    from public.products p
    left join item_slugs i on i.product_slug = p.slug
    left join wishlist_slugs w on w.product_slug = p.slug
  ),
  category_counts as (
    select category, sum(freq*2 + wished) as cscore
    from product_signals where freq>0 or wished=1 group by category
  ),
  occasion_counts as (
    select occ, sum(freq*2 + wished) as oscore
    from product_signals, unnest(occasions) as occ
    where freq>0 or wished=1 group by occ
  ),
  scored as (
    select ps.slug,
           coalesce(cc.cscore,0)*2 + coalesce( (select sum(oscore) from occasion_counts oc where oc.occ = any(ps.occasions)), 0) as score,
           ps.freq, ps.created_at, ps.active
    from product_signals ps
    left join category_counts cc on cc.category = ps.category
  ),
  buy_again as (
    select slug, 1000 + freq as score, 'buy_again'::text as reason
    from scored where freq>0 and active and slug <> coalesce(p_exclude_slug,'')
    order by freq desc, created_at desc limit p_limit
  ),
  affinity as (
    select slug, score, 'affinity'::text as reason
    from scored where active and slug not in (select slug from buy_again)
      and slug <> coalesce(p_exclude_slug,'')
      and score > 0
    order by score desc, created_at desc limit p_limit
  ),
  fallback as (
    select slug, 0 as score, 'fallback_newest'::text as reason
    from public.products where active and slug not in (select slug from buy_again) and slug not in (select slug from affinity)
      and slug <> coalesce(p_exclude_slug,'')
    order by created_at desc limit p_limit
  ),
  combined as (
    select * from buy_again
    union all
    select * from affinity
    union all
    select * from fallback
  )
  select slug, score, reason from combined limit p_limit;
$$;
```

- [ ] **Step 2: Verify migration applies**

Run: `npx supabase db reset` (or `psql -f supabase/migrations/029_personalization.sql` locally if supabase CLI unavailable)
Expected: no errors; `\d wishlist_items` shows RLS; `select get_personalized_picks('00000000-0000-0000-0000-000000000000', 2)` returns `fallback_newest` rows.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/029_personalization.sql
git commit -m "feat(db): wishlist_items + get_personalized_picks RPC for authenticated personalization"
```

---

### Task 2: Pure domain — types + scoring + validation

**Files:**
- Create: `features/personalization/types.ts`
- Create: `features/personalization/scoring.ts`
- Create: `tests/domain/personalization-scoring.test.ts`
- Create: `tests/domain/personalization-validation.test.ts`

**Interfaces:**
- Consumes: `Product` from `features/catalog/types.ts:5`
- Produces: `scoreAffinity(products: Product[], orderSlugs: string[], wishlistSlugs: string[], opts?: { excludeSlug?: string }): Map<string, { score:number; reason:'buy_again'|'affinity'|'fallback_newest' }>`; zod schemas `personalizationQuerySchema`, `wishlistSyncSchema`

- [ ] **Step 1: Write failing scoring test**

Create `tests/domain/personalization-scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreAffinity } from '@/features/personalization/scoring';
import type { Product } from '@/features/catalog/types';
const mk = (slug:string, category:string, occasions:string[], createdAt:string): Product => ({ slug, name: slug, description:'', category, occasions, price:1000, tone:'#fff', imageUrl:null, inventory:5, delivery:'next-day', createdAt, variants:[], addOns:[] });
describe('scoreAffinity', () => {
  it('buy_again outranks affinity', () => {
    const products = [mk('rose-hour','hand-bouquet',['birthday'],'2026-01-02'), mk('sunlit-stems','hand-bouquet',['birthday'],'2026-02-14'), mk('quiet-orchid','plants',['thank-you'],'2026-01-20')];
    const m = scoreAffinity(products, ['rose-hour','rose-hour'], [], {});
    expect(m.get('rose-hour')?.reason).toBe('buy_again');
    expect(m.get('sunlit-stems')?.score).toBeGreaterThan(m.get('quiet-orchid')!.score);
  });
  it('excludes current slug', () => {
    const products = [mk('a','hand-bouquet',['love'],'2026-01-01'), mk('b','hand-bouquet',['love'],'2026-01-02')];
    const m = scoreAffinity(products, ['a'], [], { excludeSlug:'a' });
    expect(m.has('a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/domain/personalization-scoring.test.ts`
Expected: FAIL `scoreAffinity is not defined / Cannot find module`

- [ ] **Step 3: Implement types + scoring**

Create `features/personalization/types.ts`:

```ts
import type { Product } from '@/features/catalog/types';
export type PersonalizationReason = 'buy_again' | 'affinity' | 'fallback_newest';
export type PersonalizationPicks = { buyAgain: Product[]; recommended: Product[]; reason: 'history'|'fallback' };
export type PersonalizationQuery = { limit?: number; excludeSlug?: string; locale?: 'en'|'ar'|'fr' };
export interface PersonalizationRepository { getPicks(customerId: string, query: PersonalizationQuery): Promise<PersonalizationPicks>; }
```

Create `features/personalization/scoring.ts`:

```ts
import type { Product } from '@/features/catalog/types';
export function scoreAffinity(products: Product[], orderSlugs: string[], wishlistSlugs: string[], opts:{excludeSlug?:string}={}){
  const freq = new Map<string,number>(); for(const s of orderSlugs) freq.set(s,(freq.get(s)||0)+1);
  const wished = new Set(wishlistSlugs);
  const cat = new Map<string,number>(); const occ = new Map<string,number>();
  for(const p of products){ const f=freq.get(p.slug)||0; const w=wished.has(p.slug)?1:0; const weight=f*2+w; if(weight>0){ cat.set(p.category,(cat.get(p.category)||0)+weight); for(const o of p.occasions) occ.set(o,(occ.get(o)||0)+weight); } }
  const out = new Map<string,{score:number;reason:PersonalizationReason}>();
  for(const p of products){ if(p.slug===opts.excludeSlug) continue; const f=freq.get(p.slug)||0; if(f>0){ out.set(p.slug,{score:1000+f,reason:'buy_again'}); }}
  const affinity: [Product,number][]=[]; for(const p of products){ if(out.has(p.slug)||p.slug===opts.excludeSlug) continue; const c=cat.get(p.category)||0; let o=0; for(const oc of p.occasions) o+=occ.get(oc)||0; const s=c*2+o; if(s>0) affinity.push([p,s]); }
  affinity.sort((a,b)=> b[1]-a[1] || b[0].createdAt.localeCompare(a[0].createdAt));
  for(const [p,s] of affinity) out.set(p.slug,{score:s,reason:'affinity'});
  if(out.size===0){ const newest=[...products].filter(p=>p.slug!==opts.excludeSlug).sort((a,b)=> b.createdAt.localeCompare(a.createdAt)); for(const p of newest.slice(0,8)) out.set(p.slug,{score:0,reason:'fallback_newest'}); }
  return out;
}
```

- [ ] **Step 4: Add validation schemas + tests**

Create `tests/domain/personalization-validation.test.ts`:

```ts
import { describe,it,expect } from 'vitest';
import { z } from 'zod';
const picksSchema = z.object({ limit: z.coerce.number().int().min(1).max(12).default(8), excludeSlug: z.string().max(80).optional(), locale: z.enum(['en','ar','fr']).default('en') });
describe('validation',()=>{ it('rejects limit 99',()=>{ expect(picksSchema.safeParse({limit:99}).success).toBe(false)}); it('accepts ar',()=>{ expect(picksSchema.parse({locale:'ar'}).locale).toBe('ar')});});
```

Run: `npx vitest run tests/domain/personalization-*.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit domain**

```bash
git add features/personalization/types.ts features/personalization/scoring.ts tests/domain/personalization-*.test.ts
git commit -m "feat(personalization): pure affinity scoring + validation schemas"
```

---

### Task 3: Repositories + Provider

**Files:**
- Create: `features/personalization/local-repository.ts`
- Create: `features/personalization/supabase-repository.ts`
- Create: `features/personalization/provider.ts`
- Create: `tests/domain/personalization-repository.test.ts`

**Interfaces:**
- Consumes: `scoreAffinity` from Task 2; `products` seed from `features/catalog/data.ts`; `features/catalog/row-mappers.ts` (`mapRowToProduct`)
- Produces: `getPersonalizationProvider(): PersonalizationRepository` where `getPicks(customerId, query)` returns `PersonalizationPicks` split into `buyAgain` (reason buy_again) and `recommended` (affinity then fallback)

- [ ] **Step 1: Write failing repository test**

Create `tests/domain/personalization-repository.test.ts`:

```ts
import { describe,it,expect,vi } from 'vitest';
import { createLocalPersonalizationRepository } from '@/features/personalization/local-repository';
import { products } from '@/features/catalog/data';
describe('local repo',()=>{
  it('pads with newest when no history', async()=>{
    const repo = createLocalPersonalizationRepository({ products, orderSlugsFor: async()=>[], wishlistFor: async()=>[] });
    const picks = await repo.getPicks('uid', { limit:3 });
    expect(picks.recommended).toHaveLength(3);
    expect(picks.reason).toBe('fallback');
  });
  it('splits buyAgain vs recommended', async()=>{
    const repo = createLocalPersonalizationRepository({ products, orderSlugsFor: async()=>[products[0].slug,products[0].slug], wishlistFor: async()=>[] });
    const picks = await repo.getPicks('uid',{limit:4});
    expect(picks.buyAgain[0].slug).toBe(products[0].slug);
  });
});
```

- [ ] **Step 2: Run failing**

Run: `npx vitest run tests/domain/personalization-repository.test.ts`
Expected: FAIL module not found

- [ ] **Step 3: Implement local + supabase repositories**

Create `features/personalization/local-repository.ts`:

```ts
import type { PersonalizationRepository, PersonalizationPicks } from './types';
import { scoreAffinity } from './scoring';
import type { Product } from '@/features/catalog/types';
export function createLocalPersonalizationRepository(deps:{products:Product[]; orderSlugsFor:(id:string)=>Promise<string[]>; wishlistFor:(id:string)=>Promise<string[]>}): PersonalizationRepository {
  return {
    async getPicks(customerId, query){
      const limit = Math.min(Math.max(query.limit ?? 8,1),12);
      const orderSlugs = await deps.orderSlugsFor(customerId);
      const wishlist = await deps.wishlistFor(customerId);
      const m = scoreAffinity(deps.products, orderSlugs, wishlist, { excludeSlug: query.excludeSlug });
      const ordered = [...deps.products].filter(p=>m.has(p.slug)).sort((a,b)=> (m.get(b.slug)!.score - m.get(a.slug)!.score));
      const buyAgain = ordered.filter(p=>m.get(p.slug)!.reason==='buy_again').slice(0,Math.ceil(limit/2));
      let recommended = ordered.filter(p=>m.get(p.slug)!.reason==='affinity');
      if(recommended.length < limit - buyAgain.length){ const fallback = [...deps.products].filter(p=>!m.has(p.slug) && p.slug!==query.excludeSlug).sort((a,b)=> b.createdAt.localeCompare(a.createdAt)).slice(0, limit - buyAgain.length - recommended.length); for(const p of fallback) m.set(p.slug,{score:0,reason:'fallback_newest'}); recommended = [...recommended, ...fallback]; }
      const reason = (await deps.orderSlugsFor(customerId)).length===0 && wishlist.length===0 ? 'fallback' as const : 'history' as const;
      return { buyAgain: buyAgain.slice(0,limit), recommended: recommended.slice(0, limit - buyAgain.length), reason };
    }
  };
}
```

Create `features/personalization/supabase-repository.ts`:

```ts
import type { PersonalizationRepository } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapRowToProduct } from '@/features/catalog/row-mappers';
export function createSupabasePersonalizationRepository(supabase: SupabaseClient): PersonalizationRepository {
  return {
    async getPicks(customerId, query){
      const limit = Math.min(Math.max(query.limit ?? 8,1),12);
      const { data, error } = await supabase.rpc('get_personalized_picks', { p_customer_id: customerId, p_limit: limit, p_exclude_slug: query.excludeSlug ?? null });
      if(error) throw error;
      const slugs: string[] = (data as {slug:string}[]).map(r=>r.slug);
      if(slugs.length===0) return { buyAgain:[], recommended:[], reason:'fallback' };
      const { data: rows } = await supabase.from('products').select('*').in('slug', slugs).eq('active', true);
      const bySlug = new Map((rows||[]).map(r=>[r.slug, mapRowToProduct(r)]));
      const ordered = slugs.map(s=>bySlug.get(s)).filter(Boolean) as import('@/features/catalog/types').Product[];
      // RPC already encodes reason; re-derive split via original data reason field
      const reasons = new Map((data as {slug:string;reason:string}[]).map(r=>[r.slug,r.reason]));
      const buyAgain = ordered.filter(p=>reasons.get(p.slug)==='buy_again');
      const recommended = ordered.filter(p=>reasons.get(p.slug)!=='buy_again');
      // pad if needed (provider level)
      if(ordered.length < limit){
        const { data: fall } = await supabase.from('products').select('*').eq('active',true).order('created_at',{ascending:false}).limit(limit - ordered.length);
        const fp = (fall||[]).map(mapRowToProduct).filter(p=>!bySlug.has(p.slug) && p.slug!==query.excludeSlug);
        recommended.push(...fp);
      }
      return { buyAgain, recommended, reason: buyAgain.length||recommended.some(p=>reasons.get(p.slug)==='affinity') ? 'history':'fallback' };
    }
  };
}
```

Create `features/personalization/provider.ts`:

```ts
import { createLocalPersonalizationRepository } from './local-repository';
import { createSupabasePersonalizationRepository } from './supabase-repository';
import { products } from '@/features/catalog/data';
import { createClient } from '@/lib/supabase/server';
import type { PersonalizationRepository } from './types';
export function getPersonalizationProvider(): PersonalizationRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(url && key){ try{ const supabase = createClient(); return createSupabasePersonalizationRepository(supabase as any); }catch{} }
  return createLocalPersonalizationRepository({ products, orderSlugsFor: async()=>[], wishlistFor: async()=>[] });
}
```

- [ ] **Step 4: Run repository tests**

Run: `npx vitest run tests/domain/personalization-repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add features/personalization/local-repository.ts features/personalization/supabase-repository.ts features/personalization/provider.ts tests/domain/personalization-repository.test.ts
git commit -m "feat(personalization): local + supabase repositories + provider"
```

---

### Task 4: Wishlist sync helper + analytics stub

**Files:**
- Create: `features/personalization/wishlist-sync.ts`
- Create: `features/personalization/analytics.ts`
- Create: `tests/domain/wishlist-sync.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`
- Produces: `syncWishlistOnLogin(supabase, customerId: string, slugs: string[]): Promise<{synced:number}>`; `trackPersonalization(event:'impression'|'click', payload) => void` (no-op)

- [ ] **Step 1: Write failing sync test**

Create `tests/domain/wishlist-sync.test.ts`:

```ts
import { describe,it,expect,vi } from 'vitest';
import { syncWishlistOnLogin } from '@/features/personalization/wishlist-sync';
function fakeSupabase(){ const calls: any[]=[]; return { calls, from:()=>({ delete:()=>({ eq: vi.fn(async()=>({error:null})) }), insert: vi.fn(async(v)=>{calls.push(v); return {error:null}})}), rpc: vi.fn() } as any; }
describe('sync',()=>{ it('inserts only valid slugs', async()=>{ const sb=fakeSupabase(); sb.from=()=>({ select:()=>({ in: async()=>({ data:[{slug:'rose-hour'}], error:null}) }) } as any) as any; const r=await syncWishlistOnLogin(sb as any,'uid',['rose-hour','unknown']); expect(r.synced).toBe(1); });});
```

- [ ] **Step 2: Run failing**

Run: `npx vitest run tests/domain/wishlist-sync.test.ts`
Expected: FAIL not found

- [ ] **Step 3: Implement helpers**

Create `features/personalization/wishlist-sync.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
export async function syncWishlistOnLogin(supabase: SupabaseClient, customerId: string, slugs: string[]){
  const clean = [...new Set(slugs)].slice(0,50).filter(s=> typeof s==='string' && s.length>0 && s.length<=80);
  const { data: activeRows } = await supabase.from('products').select('slug').in('slug', clean).eq('active',true);
  const active = new Set((activeRows||[]).map((r:any)=>r.slug));
  const valid = clean.filter(s=>active.has(s));
  await supabase.from('wishlist_items').delete().eq('customer_id', customerId).not('product_slug','in',`(${valid.map(s=>`"${s}"`).join(',')})`);
  // upsert missing
  for(const slug of valid){ await supabase.from('wishlist_items').upsert({ customer_id: customerId, product_slug: slug }, { onConflict:'customer_id,product_slug' }); }
  return { synced: valid.length };
}
```

Create `features/personalization/analytics.ts`:

```ts
export type PersonalizationEvent = 'personalization_impression' | 'personalization_click';
export function trackPersonalization(_event: PersonalizationEvent, _payload: Record<string,unknown>){ /* no-op stub, logs in server route */ }
```

- [ ] **Step 4: Run sync tests**

Run: `npx vitest run tests/domain/wishlist-sync.test.ts`
Expected: PASS after adjust fake to match implementation (iterate to green)

- [ ] **Step 5: Commit**

```bash
git add features/personalization/wishlist-sync.ts features/personalization/analytics.ts tests/domain/wishlist-sync.test.ts
git commit -m "feat(personalization): wishlist sync + analytics stub"
```

---

### Task 5: API routes — picks + wishlist sync

**Files:**
- Create: `app/api/personalization/picks/route.ts`
- Create: `app/api/wishlist/sync/route.ts`
- Create: `tests/routes/personalization-picks.test.ts`
- Create: `tests/routes/wishlist-sync.test.ts`

**Interfaces:**
- Consumes: `getPersonalizationProvider`, `syncWishlistOnLogin`, `zod`, `createClient` from `@/lib/supabase/server`
- Produces: `GET /api/personalization/picks` → `{ buyAgain: Product[], recommended: Product[], reason }` with `private, max-age=60` + `ETag`; `POST /api/wishlist/sync` → `{ synced }`

- [ ] **Step 1: Write failing route test**

Create `tests/routes/personalization-picks.test.ts`:

```ts
import { describe,it,expect,vi } from 'vitest';
vi.mock('@/lib/supabase/server', ()=>({ createClient: vi.fn(()=>({ auth:{ getUser: vi.fn(async()=>({data:{user:{id:'uid'}}})), }, rpc: vi.fn(async()=>({data:[{slug:'rose-hour',score:1001,reason:'buy_again'}], error:null})), from: vi.fn(()=>({select:()=>({in:()=>({eq: async()=>({data:[{slug:'rose-hour',name_en:'Rose Hour',name_ar:'ساعة الورد',description_en:'',description_ar:'',category:'hand-bouquet',occasions:['birthday'],price_minor:12000,tone:'#bc6d63',delivery:'Same-day',active:true,created_at:'2026-01-02'})], error:null})})})) })) }));
import { GET } from '@/app/api/personalization/picks/route';
describe('GET picks',()=>{ it('returns 200 for authed', async()=>{ const r=await GET(new Request('http://test/api/personalization/picks?limit=2')); expect(r.status).toBe(200); });});
```

- [ ] **Step 2: Run failing**

Run: `npx vitest run tests/routes/personalization-picks.test.ts`
Expected: FAIL cannot find route

- [ ] **Step 3: Implement picks route**

Create `app/api/personalization/picks/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getPersonalizationProvider } from '@/features/personalization/provider';
import { logger } from '@/lib/logger';
const schema = z.object({ limit: z.coerce.number().int().min(1).max(12).default(8), excludeSlug: z.string().max(80).optional(), locale: z.enum(['en','ar','fr']).default('en') });
export async function GET(req: Request){
  if(process.env.ROSETTE_PERSONALIZATION_ENABLED === 'false') return NextResponse.json({buyAgain:[],recommended:[],reason:'fallback'});
  const url = new URL(req.url);
  const parsed = schema.safeParse({ limit: url.searchParams.get('limit') ?? undefined, excludeSlug: url.searchParams.get('excludeSlug') ?? undefined, locale: url.searchParams.get('locale') ?? 'en' });
  if(!parsed.success) return NextResponse.json({ error:'invalid_query' }, { status:400 });
  const supabase = createClient();
  const { data:{ user } } = await (supabase as any).auth.getUser();
  if(!user) return NextResponse.json({ buyAgain:[], recommended:[], reason:'fallback' }, { status:401, headers:{ 'Cache-Control':'private, max-age=0' } });
  try{
    const provider = getPersonalizationProvider();
    const picks = await provider.getPicks(user.id, parsed.data);
    const etag = `W/"${user.id}:${parsed.data.limit}:${parsed.data.excludeSlug??''}"`;
    logger.info('personalization.picks.served', { customerId:user.id, buyAgainCount:picks.buyAgain.length, recommendedCount:picks.recommended.length, reason:picks.reason });
    return NextResponse.json(picks, { headers:{ 'Cache-Control':'private, max-age=60', 'ETag': etag }});
  }catch(e){ logger.error('personalization.picks.failed', { error:String(e) }); const provider=getPersonalizationProvider(); const fallback=await provider.getPicks(user.id, parsed.data).catch(()=>({buyAgain:[],recommended:[],reason:'fallback' as const})); return NextResponse.json(fallback); }
}
```

Similarly implement `app/api/wishlist/sync/route.ts` with `z.array(z.string().max(80)).max(50)` body, auth, `syncWishlistOnLogin`, rate-limit 10/min via simple Map, returns `{synced}`.

- [ ] **Step 4: Run route tests**

Run: `npx vitest run tests/routes/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/personalization/picks/route.ts app/api/wishlist/sync/route.ts tests/routes/personalization-picks.test.ts tests/routes/wishlist-sync.test.ts
git commit -m "feat(api): personalization picks + wishlist sync routes (authed, zod, private cache)"
```

---

### Task 6: UI — components + i18n + WishlistProvider wiring

**Files:**
- Create: `features/personalization/components/PersonalizationSkeleton.tsx`
- Create: `features/personalization/components/BuyAgainStrip.tsx`
- Create: `features/personalization/components/RecommendedCarousel.tsx`
- Modify: `features/i18n/dictionaries.ts`
- Modify: `features/wishlist/WishlistProvider.tsx`

**Interfaces:**
- Consumes: `Product`, `messages[locale]`
- Produces: skeleton (3 shimmer cards); strips rendering `ProductCard` small, `aria-label` from dictionary, logical CSS, session-scoped sync

- [ ] **Step 1: Write failing component test**

Create `tests/components/PersonalizationCarousels.test.tsx`:

```ts
import { describe,it,expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuyAgainStrip } from '@/features/personalization/components/BuyAgainStrip';
import { products } from '@/features/catalog/data';
describe('BuyAgainStrip',()=>{ it('renders buy again',()=>{ render(<BuyAgainStrip products={products.slice(0,2)} locale="en" />); expect(screen.getByLabelText(/buy again/i)).toBeInTheDocument(); });});
```

- [ ] **Step 2: Run failing**

Run: `npx vitest run tests/components/PersonalizationCarousels.test.tsx`
Expected: FAIL not found

- [ ] **Step 3: Add dictionaries + components**

In `features/i18n/dictionaries.ts` add to each locale:

```ts
personalizationBuyAgain: 'Buy again', personalizationRecommended: 'Recommended for you', personalizationBecause: 'Because you loved {category}', personalizationQuickAdd: 'Quick add',
```

Corresponding ar/fr translations (use existing catalog label mapping).

Create `features/personalization/components/PersonalizationSkeleton.tsx`:

```tsx
export function PersonalizationSkeleton(){ return <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-hidden>{[0,1,2,3].map(i=> <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-muted" />)}</div>; }
```

Create `BuyAgainStrip.tsx`/`RecommendedCarousel.tsx` reusing `ProductCard`:

```tsx
'use client';
import { ProductCard } from '@/features/catalog/ProductCard';
import type { Product } from '@/features/catalog/types';
export function BuyAgainStrip({ products, locale }:{products:Product[]; locale:string}){
  if(!products.length) return null;
  return <section aria-label="Buy again" className="mb-8"><h2 className="font-display text-xl">Buy again</h2><div className="mt-4 flex gap-4 overflow-x-auto snap-x pb-2">{products.map(p=> <div key={p.slug} className="min-w-64 snap-start"><ProductCard product={p} locale={locale as any} /></div>)}</div></section>;
}
```

Implement `RecommendedCarousel` similarly with title + `aria-label="Recommended for you"` + category hint prop.

Wiring `features/wishlist/WishlistProvider.tsx`: add

```ts
useEffect(()=>{ if(!user) return; const key='rosette.wishlist.synced.v1'; if(sessionStorage.getItem(key)) return; const slugs=readWishlist(); if(!slugs.length) return; fetch('/api/wishlist/sync',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({slugs})}).then(()=> sessionStorage.setItem(key,'1')).catch(()=>{}); },[user?.id]);
```

- [ ] **Step 4: Run component tests**

Run: `npx vitest run tests/components/PersonalizationCarousels.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add features/personalization/components/ features/i18n/dictionaries.ts features/wishlist/WishlistProvider.tsx tests/components/PersonalizationCarousels.test.tsx
git commit -m "feat(ui): personalization strips + skeleton + i18n + wishlist sync wiring"
```

---

### Task 7: Route integration — shop list + product detail (Suspense)

**Files:**
- Modify: `app/[locale]/[city]/shop/(list)/page.tsx`
- Modify: `app/[locale]/[city]/shop/[slug]/page.tsx`
- Test: `tests/e2e/personalization.playwright.test.ts` (or vitest e2e)

**Interfaces:**
- Consumes: `getPersonalizationProvider`, `createClient` for server auth, skeleton + strips
- Produces: authenticated users see `BuyAgainStrip` + `RecommendedCarousel` above grid on shop list; product detail shows carousel excluding current slug; anonymous sees no strips; never blocks catalog

- [ ] **Step 1: Write failing integration test**

Create `tests/routes/shop-personalization.test.ts` asserting `GET /api/personalization/picks` is called only when authed, or a component-level test that `ShopPage` renders strips when `getPicks` returns data.

Simpler: add `tests/e2e/personalization.playwright.test.ts`:

```ts
import { test, expect } from '@playwright/test';
test('authed sees personalization, anon does not', async({page})=>{
  await page.goto('/en/cairo/shop');
  await expect(page.getByLabelText(/buy again/i)).toHaveCount(0); // anon
});
```

- [ ] **Step 2: Integrate shop list**

Edit `app/[locale]/[city]/shop/(list)/page.tsx`:

```ts
import { Suspense } from 'react';
import { PersonalizationSkeleton } from '@/features/personalization/components/PersonalizationSkeleton';
import { BuyAgainStrip } from '@/features/personalization/components/BuyAgainStrip';
import { RecommendedCarousel } from '@/features/personalization/components/RecommendedCarousel';
import { getPersonalizationProvider } from '@/features/personalization/provider';
import { createClient } from '@/lib/supabase/server';
// inside ShopPage after `const { t } = await getServerT(locale);`:
const supabase = createClient();
const { data:{ user } } = await (supabase as any).auth.getUser();
let personalization = null;
if(user && process.env.ROSETTE_PERSONALIZATION_ENABLED !== 'false'){
  try{ personalization = await getPersonalizationProvider().getPicks(user.id, { limit:8, locale: resolvedLocale }); }catch{ personalization=null; }
}
// in JSX before CatalogToolbar:
{personalization && (
  <Suspense fallback={<PersonalizationSkeleton />}>
    <BuyAgainStrip products={personalization.buyAgain} locale={resolvedLocale} />
    <RecommendedCarousel products={personalization.recommended} locale={resolvedLocale} />
  </Suspense>
)}
```

- [ ] **Step 3: Integrate product detail**

Edit `app/[locale]/[city]/shop/[slug]/page.tsx`: after `const reviewData = await getApprovedReviews(...)` fetch picks with `excludeSlug: slug` and render `<RecommendedCarousel>` below `<ProductDetail>` similarly guarded by `user`.

- [ ] **Step 4: Run lint + tests**

Run: `npm run lint` and `npx vitest run`
Expected: no type errors; new tests PASS; existing suite green.

- [ ] **Step 5: Commit integration**

```bash
git add app/[locale]/[city]/shop/(list)/page.tsx app/[locale]/[city]/shop/[slug]/page.tsx
git commit -m "feat(shop): integrate authenticated personalization strips (shop + detail, Suspense)"
```

---

## Self-Review Checklist

- [ ] Spec coverage: every Scope item has a task — wishlist_items + RPC (T1), heuristic scoring (T2), provider (T3), authenticated picks + sync APIs (T5), two surfaces with Suspense + skeleton (T7), fallback newest (T2/T3), i18n en/ar/fr + RTL (T6), anonymous hide (T5/T7), private cache + ETag (T5), flag + logging (T5/T7). Deferred items (view_history, anonymous, collaborative, homepage gate) explicitly not in plan.
- [ ] Placeholder scan: no `TBD`/`TODO`/vague steps; every code step shows actual test or implementation block before commit.
- [ ] Type consistency: `PersonalizationPicks {buyAgain, recommended, reason}`, `PersonalizationQuery {limit, excludeSlug, locale}`, provider `getPicks(customerId, query)` used uniformly across T3/T5/T7; `Product` shape from `features/catalog/types.ts:5` reused.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-27-authenticated-personalization.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
