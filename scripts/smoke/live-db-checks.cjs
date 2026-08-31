#!/usr/bin/env node
/**
 * live-db-checks.cjs — read-only live smoke checks for migrations 038–048.
 *
 * Covers:
 *   1. Admin notification RPCs (045)
 *   2a. webhook_events schema + grants (046)
 *   3. RLS / grants from 038 & 040
 *   4. products.category_id FK (048)
 *   5. order total invariant + backfill (044)
 *
 * Requires:
 *   DATABASE_URL  postgres/service_role connection string (NOT the anon key)
 *   pg available on NODE_PATH (managed Node workspace already has it)
 *
 * Run:
 *   NODE_PATH="$PWD/node_modules" DATABASE_URL='...' node live-db-checks.cjs
 *
 * Exit code 0 = all checks passed, 1 = at least one failed, 2 = usage/connection error.
 * Every query is SELECT-only; nothing is mutated.
 */
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: set DATABASE_URL (postgres/service_role URI)');
  process.exit(2);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function q(client, text, params = []) {
  const r = await client.query(text, params);
  return r.rows;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // ── 1. Admin notification RPCs (045) ──────────────────────────────────
    {
      const rows = await q(client, `
        select p.proname, p.proacl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('admin_notification_deliveries','admin_notification_deliveries_count')`);
      const ok = rows.length === 2;
      record('045 functions exist', ok, ok ? 'both RPCs present' : `found ${rows.length}/2`);

      let execOk = false, execErr = '';
      try {
        await q(client, `select * from public.admin_notification_deliveries(10,0,null,null,null,now(),3,900000)`);
        await q(client, `select public.admin_notification_deliveries_count(null,null,null,now(),3,900000)`);
        execOk = true;
      } catch (e) { execErr = e.message; }
      record('045 RPCs execute', execOk, execOk ? 'no error' : execErr);

      let anonBlocked = false, anonDetail = '';
      try {
        await q(client, `set role anon`);
        try { await q(client, `select public.admin_notification_deliveries_count(null)`); }
        catch (e) { anonBlocked = /permission denied/.test(e.message); anonDetail = e.message; }
      } finally { await q(client, `reset role`); }
      record('045 anon cannot execute', anonBlocked, anonBlocked ? 'permission denied' : (anonDetail || 'NO ERROR (unexpected)'));
    }

    // ── 2a. webhook_events schema + grants (046) ───────────────────────────
    {
      const tbl = await q(client, `select table_name from information_schema.tables where table_name='webhook_events'`);
      record('046 webhook_events table', tbl.length === 1, tbl.length ? 'present' : 'missing');

      const pk = await q(client, `select pg_get_constraintdef(oid) as def from pg_constraint where conname='webhook_events_pkey'`);
      const pkOk = pk.length === 1 && /PRIMARY KEY \(provider, provider_reference\)/.test(pk[0].def);
      record('046 composite PK', pkOk, pkOk ? pk[0].def : 'missing');

      const grants = await q(client, `
        select grantee, privilege_type from information_schema.role_table_grants
        where table_name='webhook_events' and grantee in ('anon','authenticated','service_role')`);
      const svcOnly = grants.filter(g => g.grantee !== 'service_role').length === 0 && grants.some(g => g.grantee === 'service_role');
      record('046 grants = service_role only', svcOnly,
        svcOnly ? 'anon/authenticated excluded' : `grants: ${JSON.stringify(grants)}`);
    }

    // ── 3. RLS / grants from 038 & 040 ─────────────────────────────────────
    {
      const promo = await q(client, `
        select grantee from information_schema.role_table_grants
        where table_name='promo_codes' and grantee in ('anon','authenticated')`);
      record('038 promo_codes locked from anon/auth', promo.length === 0,
        promo.length ? `leaked to ${promo.map(p=>p.grantee).join(',')}` : 'revoked');

      const inc = await q(client, `
        select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='increment_promo_usage'`);
      record('038 increment_promo_usage exists', inc.length === 1, inc.length ? 'present' : 'missing');

      const rls = await q(client, `
        select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in
          ('subscription_plans','subscriptions','subscription_deliveries','subscription_events')`);
      const allRls = rls.length === 4 && rls.every(r => r.relrowsecurity);
      record('040 RLS enabled on 4 subscription tables', allRls,
        allRls ? 'all 4' : `found ${rls.filter(r=>r.relrowsecurity).length}/4`);

      let anonSubs = -1, anonPlans = -1;
      try {
        await q(client, `set role anon`);
        anonSubs = (await q(client, `select count(*)::int as c from public.subscriptions`)).map(r=>r.c)[0];
        anonPlans = (await q(client, `select count(*)::int as c from public.subscription_plans where active=true`)).map(r=>r.c)[0];
      } finally { await q(client, `reset role`); }
      const ok = anonSubs === 0 && anonPlans >= 0;
      record('040 anon denied subs / can read plans', ok, `subs_count=${anonSubs} (want 0), active_plans=${anonPlans}`);
    }

    // ── 4. products.category_id FK (048) ───────────────────────────────────
    {
      const col = await q(client, `
        select data_type, is_nullable from information_schema.columns
        where table_name='products' and column_name='category_id'`);
      const colOk = col.length === 1 && col[0].data_type === 'uuid' && col[0].is_nullable === 'YES';
      record('048 category_id column (uuid, nullable)', colOk, colOk ? 'ok' : JSON.stringify(col[0] || {}));

      const fk = await q(client, `select pg_get_constraintdef(oid) as def from pg_constraint where conname='fk_product_category'`);
      const fkOk = fk.length === 1 && /FOREIGN KEY \(category_id\) REFERENCES categories\(id\) ON DELETE SET NULL/.test(fk[0].def);
      record('048 FK fk_product_category', fkOk, fkOk ? fk[0].def : 'missing');

      const bf = await q(client, `select count(*)::int as total, count(category_id)::int as with_fk from products`);
      const t = bf[0];
      record('048 backfill populated', t.total > 0 && t.with_fk > 0, `with_fk=${t.with_fk}/${t.total}`);
    }

    // ── 5. order total invariant + backfill (044) ──────────────────────────
    {
      const cc = await q(client, `select pg_get_constraintdef(oid) as def from pg_constraint where conname='chk_order_totals'`);
      const ccOk = cc.length === 1 && /total_minor = subtotal_minor \+ delivery_fee_minor - discount_minor - COALESCE\(gift_card_minor, 0\)/.test(cc[0].def);
      record('044 chk_order_totals constraint', ccOk, ccOk ? 'present' : 'missing');

      const inv = await q(client, `
        select count(*)::int as n from orders o
        where o.total_minor <> (o.subtotal_minor + o.delivery_fee_minor - o.discount_minor - coalesce(o.gift_card_minor,0))`);
      record('044 invariant holds (0 violating)', inv[0].n === 0, `violating=${inv[0].n}`);

      const oi = await q(client, `select count(*)::int as total, count(product_id)::int as with_pid from order_items`);
      record('044 order_items.product_id backfilled', oi[0].with_pid > 0, `with_pid=${oi[0].with_pid}/${oi[0].total}`);
    }
  } finally {
    await client.end();
  }

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
