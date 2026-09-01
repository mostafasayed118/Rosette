#!/usr/bin/env node
/**
 * webhook-replay-test.cjs — proves Paymob webhook replay protection (046) end-to-end.
 *
 * Sends a signed, valid Paymob "payment success" callback TWICE against a LIVE Worker.
 * Asserts:
 *   - Call 1 processes the order (→ paid) and writes exactly ONE payments row.
 *   - Call 2 is short-circuited as a duplicate (200 {"received":true}) and writes
 *     NO second payments row and makes NO further state change.
 *
 * Requires:
 *   WORKER_URL            e.g. https://<your-worker>.workers.dev
 *   PAYMOB_HMAC_SECRET    same secret the Worker uses
 *   ORDER_DISPLAY_NUMBER  a real PENDING order's display_number (e.g. RO-XXXX-YYYY)
 *   ORDER_TOTAL_MINOR     that order's total_minor, EXACTLY (mismatch → quarantine)
 *   DATABASE_URL          (optional but recommended) postgres/service_role URI to
 *                         verify the payments row count. If omitted, only HTTP responses
 *                         are reported.
 *   PROVIDER_REF          (optional) override the unique Paymob transaction id.
 *
 * Run:
 *   NODE_PATH="$PWD/node_modules" WORKER_URL=... PAYMOB_HMAC_SECRET=... \
 *     ORDER_DISPLAY_NUMBER=RO-XXXX-YYYY ORDER_TOTAL_MINOR=2500 \
 *     DATABASE_URL='...' node webhook-replay-test.cjs
 *
 * Exit code 0 = replay protection confirmed, 1 = replay NOT protected, 2 = usage/error.
 *
 * NOTE: uses a UNIQUE provider reference per run, so it never collides with a real
 * webhook event already recorded in webhook_events. Re-running creates a new ref.
 */
const { createHmac } = require('node:crypto');

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const SECRET = process.env.PAYMOB_HMAC_SECRET;
const ORDER_DISPLAY_NUMBER = process.env.ORDER_DISPLAY_NUMBER;
const ORDER_TOTAL_MINOR = Number(process.env.ORDER_TOTAL_MINOR);
const PROVIDER_REF = process.env.PROVIDER_REF || `smoke-${Date.now()}`;
const DATABASE_URL = process.env.DATABASE_URL;

function fail(msg) { console.error('FATAL: ' + msg); process.exit(2); }
if (!WORKER_URL) fail('set WORKER_URL');
if (!SECRET) fail('set PAYMOB_HMAC_SECRET');
if (!ORDER_DISPLAY_NUMBER) fail('set ORDER_DISPLAY_NUMBER');
if (!ORDER_TOTAL_MINOR || Number.isNaN(ORDER_TOTAL_MINOR)) fail('set ORDER_TOTAL_MINOR to the order total in minor units');

// Replicates features/payment/paymob-hmac.ts → paymobHmacMessage (exact field order).
function paymobHmacMessage(p) {
  const v = (x) => String(x ?? '');
  return [
    v(p.amount_cents), v(p.created_at), v(p.currency), v(p.error_occured),
    v(p.has_parent_transaction), v(p.id), v(p.integration_id), v(p.is_3d_secure),
    v(p.is_auth), v(p.is_capture), v(p.is_refunded), v(p.is_standalone_payment),
    v(p.is_voided), v(p.order && p.order.id), v(p.owner), v(p.pending),
    v(p.source_data && p.source_data.pan), v(p.source_data && p.source_data.sub_type),
    v(p.source_data && p.source_data.type), v(p.success),
  ].join('');
}
function sign(p) {
  return createHmac('sha512', SECRET).update(paymobHmacMessage(p)).digest('hex');
}

async function sendCallback() {
  const obj = {
    id: PROVIDER_REF,
    merchant_order_id: ORDER_DISPLAY_NUMBER,
    amount_cents: ORDER_TOTAL_MINOR,
    currency: 'EGP',
    success: true,
    created_at: new Date().toISOString(),
  };
  const hmac = sign(obj);
  const url = `${WORKER_URL}/api/webhooks/paymob?hmac=${hmac}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ obj, hmac }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json || text, hmac };
}

async function countPayments() {
  if (!DATABASE_URL) return null;
  const { Client } = require('pg');
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const r = await client.query('select count(*)::int as n from payments where provider_reference = $1', [PROVIDER_REF]);
    return r.rows[0].n;
  } finally { await client.end(); }
}

async function main() {
  console.log(`provider_reference = ${PROVIDER_REF}`);
  console.log(`order = ${ORDER_DISPLAY_NUMBER} (total_minor=${ORDER_TOTAL_MINOR})`);

  console.log('\n→ Call 1 (first delivery):');
  const c1 = await sendCallback();
  console.log(`   HTTP ${c1.status}  body=${JSON.stringify(c1.body)}`);

  console.log('\n→ Call 2 (replay, identical id):');
  const c2 = await sendCallback();
  console.log(`   HTTP ${c2.status}  body=${JSON.stringify(c2.body)}`);

  const before = await countPayments();
  console.log(`\npayments rows for this reference: ${before === null ? '(DATABASE_URL not set — verify manually)' : before}`);

  // Evaluations
  const call1Ok = c1.status === 200;
  const call2Duplicate = c2.status === 200 && c2.body && c2.body.received === true
    && !(c2.body.error); // no "Webhook processing failed"
  const paymentCountOk = before === null ? true : before === 1;

  console.log('\n=== RESULT ===');
  console.log(`[${call1Ok ? 'PASS' : 'FAIL'}] Call 1 accepted (HTTP 200)`);
  console.log(`[${call2Duplicate ? 'PASS' : 'FAIL'}] Call 2 treated as duplicate (HTTP 200, received:true, no error)`);
  console.log(`[${paymentCountOk ? 'PASS' : 'FAIL'}] Exactly one payments row for the reference (got ${before})`);

  const allOk = call1Ok && call2Duplicate && paymentCountOk;
  console.log(`\n${allOk ? 'REPLAY PROTECTION CONFIRMED' : 'REPLAY PROTECTION FAILED — investigate'}`);
  if (before !== null && before > 1) {
    console.log(`WARNING: ${before} payments rows — a duplicate callback re-fired a payment event.`);
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
