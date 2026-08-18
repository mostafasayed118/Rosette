# Admin Delivery Rules Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins and operators view and edit per-city delivery rules (fee, minimum order, cutoff hour, active) and add brand-new cities with their rule, all inline on `/admin/delivery`.

**Architecture:** Pure validation in `delivery-validation.ts`; `saveDeliveryRule` + `createCityWithRule` services in `delivery-actions.ts`; one thin `POST /api/admin/delivery` route dispatching on an `action` field; two inline client forms (`DeliveryRuleForm`, `AddCityForm`) on the admin delivery page, whose list query becomes a `cities` LEFT JOIN `delivery_rules`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (postgrest-js), Vitest, `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-08-17-admin-delivery-editor-design.md`

## Global Constraints

- TypeScript strict; `npm run lint` runs `tsc --noEmit` and must pass.
- Vitest for tests; new tests live in `tests/domain/*.test.ts`; `@/` resolves to repo root.
- Money is in minor units (piasters); forms show EGP and convert ×100/÷100.
- Admin UI is English-only.
- Delivery-rule edits and city creation are allowed for `admin` and `operator`; any other role is forbidden.
- Every save/creation writes an `admin_audit_logs` row.
- City codes match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; cutoff hour is an integer 0–23; fee/minimum are non-negative integers.
- No new tables, no migrations, no changes to customer-facing code (checkout already reads only active rules).
- No secrets in code or tests; tests use fakes only, never live services.
- TDD: failing test → run (red) → implement → run (green) → commit.
- All 90 existing tests stay passing.

---

### Task 1: Delivery validation helpers

**Files:**
- Create: `features/admin/delivery-validation.ts`
- Test: `tests/domain/delivery-validation.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `CITY_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`
  - `type RuleFields = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number }`
  - `validateRuleFields(input: RuleFields): string | null` — keys: `invalid_fee`, `invalid_minimum`, `invalid_cutoff`
  - `type CityFields = RuleFields & { code: string; nameEn: string; nameAr: string }`
  - `validateCityFields(input: CityFields): string | null` — keys: `invalid_code`, `name_required`, plus the rule keys

- [ ] **Step 1: Write the failing test**

`tests/domain/delivery-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateRuleFields, validateCityFields } from '@/features/admin/delivery-validation';

describe('validateRuleFields', () => {
  it('accepts valid rule fields', () => {
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBeNull();
  });
  it('rejects negative fee', () => {
    expect(validateRuleFields({ feeMinor: -1, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('invalid_fee');
  });
  it('rejects fractional minimum', () => {
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 1.5, cutoffHour: 14 })).toBe('invalid_minimum');
  });
  it('rejects cutoff outside 0–23', () => {
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 24 })).toBe('invalid_cutoff');
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: -1 })).toBe('invalid_cutoff');
  });
});

describe('validateCityFields', () => {
  it('accepts valid city fields', () => {
    expect(validateCityFields({ code: 'greater-cairo', nameEn: 'Greater Cairo', nameAr: 'القاهرة الكبرى', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBeNull();
  });
  it('rejects bad city codes', () => {
    expect(validateCityFields({ code: 'Greater Cairo', nameEn: 'G', nameAr: 'ق', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('invalid_code');
    expect(validateCityFields({ code: 'cairo_', nameEn: 'G', nameAr: 'ق', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('invalid_code');
  });
  it('rejects empty names', () => {
    expect(validateCityFields({ code: 'new-city', nameEn: '  ', nameAr: 'قاهرة', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('name_required');
  });
  it('propagates rule validation', () => {
    expect(validateCityFields({ code: 'new-city', nameEn: 'X', nameAr: 'ص', feeMinor: 0, minimumOrderMinor: 0, cutoffHour: 99 })).toBe('invalid_cutoff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/delivery-validation.test.ts`
Expected: FAIL — module `@/features/admin/delivery-validation` not found.

- [ ] **Step 3: Implement**

`features/admin/delivery-validation.ts`:

```ts
export const CITY_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RuleFields = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number };

export function validateRuleFields(input: RuleFields): string | null {
  if (!Number.isInteger(input.feeMinor) || input.feeMinor < 0) return 'invalid_fee';
  if (!Number.isInteger(input.minimumOrderMinor) || input.minimumOrderMinor < 0) return 'invalid_minimum';
  if (!Number.isInteger(input.cutoffHour) || input.cutoffHour < 0 || input.cutoffHour > 23) return 'invalid_cutoff';
  return null;
}

export type CityFields = RuleFields & { code: string; nameEn: string; nameAr: string };

export function validateCityFields(input: CityFields): string | null {
  if (!CITY_CODE_PATTERN.test(input.code)) return 'invalid_code';
  if (!input.nameEn.trim() || !input.nameAr.trim()) return 'name_required';
  return validateRuleFields(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/delivery-validation.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/delivery-validation.ts tests/domain/delivery-validation.test.ts
git commit -m "feat: add delivery rule and city validation helpers"
```

---

### Task 2: Delivery action services

**Files:**
- Create: `features/admin/delivery-actions.ts`
- Test: `tests/domain/delivery-actions.test.ts`

**Interfaces:**
- Consumes: `AdminIdentity` from `@/features/admin/authorization`; `validateRuleFields`, `validateCityFields`, `RuleFields`, `CityFields` from `./delivery-validation` (Task 1).
- Produces:
  - `type SaveDeliveryRuleResult = 'saved' | 'forbidden' | 'validation' | 'failure'`
  - `saveDeliveryRule(client, identity, input: RuleFields & { cityCode: string; active: boolean }): Promise<SaveDeliveryRuleResult>` — admin/operator allowed; validation first; upsert `delivery_rules` keyed by `city_code` (update when a row exists, insert when not); audit `update_delivery_rule`; DB error/throw → `'failure'`.
  - `type CreateCityResult = 'created' | 'forbidden' | 'validation' | 'city_taken' | 'failure'`
  - `createCityWithRule(client, identity, input: CityFields & { sameDay: boolean }): Promise<CreateCityResult>` — admin/operator allowed; validation first; duplicate `cities.code` → `'city_taken'` (before any write); insert `cities` row then `delivery_rules` row (active = true); audit `create_city`; DB error/throw → `'failure'`.

- [ ] **Step 1: Write the failing test**

`tests/domain/delivery-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { saveDeliveryRule, createCityWithRule } from '@/features/admin/delivery-actions';
import type { AdminRole } from '@/features/admin/authorization';

type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(seed: { rule?: { city_code: string } | null; city?: { code: string } | null }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: (column: string, value: string) => ({ maybeSingle: async () => {
      if (table === 'delivery_rules') return { data: seed.rule ?? null, error: null };
      if (table === 'cities') return { data: seed.city ?? null, error: null };
      return { data: null, error: null };
    } }) }),
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      return { error: null };
    },
    update: (payload: unknown) => ({ eq: (value: string) => { calls.push({ table, op: 'update', payload, id: value }); return { error: null }; } }),
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const operator = { userId: 'op-1', role: 'operator' as const };
const customer = { userId: 'c1', role: 'customer' as AdminRole };

const ruleInput = { cityCode: 'cairo', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14, active: true };

describe('saveDeliveryRule', () => {
  it('updates an existing rule and audits', async () => {
    const { client, calls } = fakeClient({ rule: { city_code: 'cairo' } });
    const result = await saveDeliveryRule(client, admin, ruleInput);
    expect(result).toBe('saved');
    const update = calls.find((c) => c.table === 'delivery_rules' && c.op === 'update');
    expect(update!.payload).toMatchObject({ fee_minor: 7500, cutoff_hour: 14, active: true });
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('lets an operator save', async () => {
    const { client, calls } = fakeClient({ rule: { city_code: 'cairo' } });
    expect(await saveDeliveryRule(client, operator, ruleInput)).toBe('saved');
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('inserts a rule when none exists', async () => {
    const { client, calls } = fakeClient({ rule: null });
    expect(await saveDeliveryRule(client, admin, ruleInput)).toBe('saved');
    expect(calls.find((c) => c.table === 'delivery_rules' && c.op === 'insert')).toBeDefined();
    expect(calls.find((c) => c.table === 'delivery_rules' && c.op === 'update')).toBeUndefined();
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await saveDeliveryRule(client, customer, ruleInput)).toBe('forbidden');
    expect(calls).toEqual([]);
  });

  it('rejects invalid fields without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await saveDeliveryRule(client, admin, { ...ruleInput, cutoffHour: 24 })).toBe('validation');
    expect(calls).toEqual([]);
  });
});

describe('createCityWithRule', () => {
  const cityInput = { code: 'luxor', nameEn: 'Luxor', nameAr: 'الأقصر', sameDay: false, feeMinor: 12000, minimumOrderMinor: 0, cutoffHour: 12 };

  it('creates a city with its rule and audits', async () => {
    const { client, calls } = fakeClient({ city: null });
    const result = await createCityWithRule(client, admin, cityInput);
    expect(result).toBe('created');
    expect(calls.find((c) => c.table === 'cities' && c.op === 'insert')).toBeDefined();
    const ruleInsert = calls.find((c) => c.table === 'delivery_rules' && c.op === 'insert');
    expect(ruleInsert!.payload).toMatchObject({ city_code: 'luxor', fee_minor: 12000, active: true });
    expect(calls.find((c) => c.table === 'admin_audit_logs' && (c.payload as { action: string }).action === 'create_city')).toBeDefined();
  });

  it('returns city_taken with no writes on duplicate code', async () => {
    const { client, calls } = fakeClient({ city: { code: 'luxor' } });
    expect(await createCityWithRule(client, operator, cityInput)).toBe('city_taken');
    expect(calls).toEqual([]);
  });

  it('rejects empty names without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await createCityWithRule(client, admin, { ...cityInput, nameEn: '  ' })).toBe('validation');
    expect(calls).toEqual([]);
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await createCityWithRule(client, customer, cityInput)).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/delivery-actions.test.ts`
Expected: FAIL — module `@/features/admin/delivery-actions` not found.

- [ ] **Step 3: Implement**

`features/admin/delivery-actions.ts`:

```ts
import type { AdminIdentity } from './authorization';
import { validateRuleFields, validateCityFields, type CityFields, type RuleFields } from './delivery-validation';

export type SaveDeliveryRuleResult = 'saved' | 'forbidden' | 'validation' | 'failure';
export type CreateCityResult = 'created' | 'forbidden' | 'validation' | 'city_taken' | 'failure';

type DeliveryClient = { from: (table: string) => any };

function canEdit(identity: AdminIdentity): boolean {
  return identity.role === 'admin' || identity.role === 'operator';
}

export async function saveDeliveryRule(
  client: DeliveryClient,
  identity: AdminIdentity,
  input: RuleFields & { cityCode: string; active: boolean },
): Promise<SaveDeliveryRuleResult> {
  if (!canEdit(identity)) return 'forbidden';
  if (validateRuleFields(input)) return 'validation';
  try {
    const { data: existing } = await client.from('delivery_rules').select('city_code').eq('city_code', input.cityCode).maybeSingle();
    if (existing) {
      const { error } = await client.from('delivery_rules')
        .update({ fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: input.active })
        .eq('city_code', input.cityCode);
      if (error) return 'failure';
    } else {
      const { error } = await client.from('delivery_rules')
        .insert({ city_code: input.cityCode, fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: input.active });
      if (error) return 'failure';
    }
    await client.from('admin_audit_logs').insert({
      actor_id: identity.userId, action: 'update_delivery_rule', target_type: 'delivery_rule', target_id: input.cityCode,
      metadata: { fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: input.active },
    });
    return 'saved';
  } catch {
    return 'failure';
  }
}

export async function createCityWithRule(
  client: DeliveryClient,
  identity: AdminIdentity,
  input: CityFields & { sameDay: boolean },
): Promise<CreateCityResult> {
  if (!canEdit(identity)) return 'forbidden';
  if (validateCityFields(input)) return 'validation';
  try {
    const { data: existing } = await client.from('cities').select('code').eq('code', input.code).maybeSingle();
    if (existing) return 'city_taken';
    const { error: cityError } = await client.from('cities').insert({ code: input.code, name_en: input.nameEn, name_ar: input.nameAr, same_day: input.sameDay });
    if (cityError) return 'failure';
    const { error: ruleError } = await client.from('delivery_rules')
      .insert({ city_code: input.code, fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: true });
    if (ruleError) return 'failure';
    await client.from('admin_audit_logs').insert({
      actor_id: identity.userId, action: 'create_city', target_type: 'city', target_id: input.code,
      metadata: { code: input.code, same_day: input.sameDay },
    });
    return 'created';
  } catch {
    return 'failure';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/delivery-actions.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite, then commit**

Run: `npm test`
Expected: 90 existing + 17 new = **107 passed**.

```bash
git add features/admin/delivery-actions.ts tests/domain/delivery-actions.test.ts
git commit -m "feat: add delivery rule and city creation services"
```

---

### Task 3: Thin delivery route

**Files:**
- Create: `app/api/admin/delivery/route.ts`

**Interfaces:**
- Consumes: `saveDeliveryRule`, `createCityWithRule` (Task 2); `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase` from `@/lib/supabase/admin`.
- Produces:
  - `POST /api/admin/delivery` — body `{ action: 'update-rule', cityCode, feeMinor, minimumOrderMinor, cutoffHour, active }` → 200 on success; `{ action: 'create-city', code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour }` → 201 on success. 403 no admin, 400 invalid body/validation/unknown action, 409 city_taken, 500 failure.

- [ ] **Step 1: Create the route**

`app/api/admin/delivery/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { saveDeliveryRule, createCityWithRule } from '@/features/admin/delivery-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const identity = await getCurrentAdmin();
  if (!identity) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;

  if (body.action === 'update-rule') {
    const { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active } = body;
    if (typeof cityCode !== 'string' || typeof feeMinor !== 'number' || typeof minimumOrderMinor !== 'number' || typeof cutoffHour !== 'number' || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const result = await saveDeliveryRule(getAdminSupabase(), identity, { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active });
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid rule data' }, { status: 400 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not save rule' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'create-city') {
    const { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour } = body;
    if (typeof code !== 'string' || typeof nameEn !== 'string' || typeof nameAr !== 'string' || typeof sameDay !== 'boolean' || typeof feeMinor !== 'number' || typeof minimumOrderMinor !== 'number' || typeof cutoffHour !== 'number') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const result = await createCityWithRule(getAdminSupabase(), identity, { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour });
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid city data' }, { status: 400 });
    if (result === 'city_taken') return NextResponse.json({ error: 'City code already exists' }, { status: 409 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not create city' }, { status: 500 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass; `/api/admin/delivery` appears in the build output.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/delivery/route.ts
git commit -m "feat: add admin delivery rules API route"
```

---

### Task 4: Inline forms and delivery page

**Files:**
- Create: `components/admin/DeliveryRuleForm.tsx`
- Create: `components/admin/AddCityForm.tsx`
- Modify: `app/admin/delivery/page.tsx` (full rewrite — left-join query + form rendering)

**Interfaces:**
- Consumes: `saveDeliveryRule`/`createCityWithRule` endpoints (Task 3 route); `getCurrentAdmin`; `getAdminSupabase`.
- Produces:
  - `type DeliveryRuleInitial = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number; active: boolean }`
  - `DeliveryRuleForm({ cityCode, initial }: { cityCode: string; initial: DeliveryRuleInitial })` client component — fee (EGP), minimum (EGP), cutoff hour select, active toggle, Save; POSTs `{ action: 'update-rule', ... }`; `router.refresh()` on success; inline error otherwise.
  - `AddCityForm()` client component — code, name EN/AR, same-day checkbox, fee, minimum, cutoff; POSTs `{ action: 'create-city', ... }`; `router.refresh()` on success, clears the form; 409 shows a specific duplicate-code message.

- [ ] **Step 1: Implement `DeliveryRuleForm`**

`components/admin/DeliveryRuleForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export type DeliveryRuleInitial = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number; active: boolean };

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function DeliveryRuleForm({ cityCode, initial }: { cityCode: string; initial: DeliveryRuleInitial }) {
  const router = useRouter();
  const [fee, setFee] = useState(minorToEgp(initial.feeMinor));
  const [minimum, setMinimum] = useState(minorToEgp(initial.minimumOrderMinor));
  const [cutoff, setCutoff] = useState(String(initial.cutoffHour));
  const [active, setActive] = useState(initial.active);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = await fetch('/api/admin/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-rule', cityCode, feeMinor: toMinor(fee), minimumOrderMinor: toMinor(minimum), cutoffHour: Number.parseInt(cutoff, 10), active }),
    });
    if (!response.ok) {
      setError('Could not save the rule.');
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return <form className="quantity-control" onSubmit={submit}>
    <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Fee (EGP)" />
    <input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label="Minimum order (EGP)" />
    <select value={cutoff} onChange={(e) => setCutoff(e.target.value)} aria-label="Cutoff hour">{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
    <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active</span></label>
    <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    {error ? <small className="field-error">{error}</small> : null}
  </form>;
}
```

- [ ] **Step 2: Implement `AddCityForm`**

`components/admin/AddCityForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const empty = { code: '', nameEn: '', nameAr: '', sameDay: false, fee: '', minimum: '', cutoff: '14' };

export function AddCityForm() {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<typeof empty>) { setForm((current) => ({ ...current, ...p })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = await fetch('/api/admin/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-city', code: form.code.trim(), nameEn: form.nameEn, nameAr: form.nameAr, sameDay: form.sameDay, feeMinor: toMinor(form.fee), minimumOrderMinor: toMinor(form.minimum), cutoffHour: Number.parseInt(form.cutoff, 10) }),
    });
    if (!response.ok) {
      setError(response.status === 409 ? 'That city code already exists.' : 'Could not create the city.');
      setSaving(false);
      return;
    }
    router.refresh();
    setForm(empty);
  }

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {error ? <div className="status-message" role="alert"><strong>{error}</strong></div> : null}
    <section className="form-section"><p className="eyebrow">Add city</p><div className="form-grid">
      <label className="field"><span>Code</span><input type="text" value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="greater-cairo" required /></label>
      <label className="field"><span>Name (EN)</span><input type="text" value={form.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required /></label>
      <label className="field"><span>Name (AR)</span><input type="text" value={form.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required /></label>
      <label className="field"><span>Fee (EGP)</span><input type="number" min="0" step="0.01" value={form.fee} onChange={(e) => patch({ fee: e.target.value })} required /></label>
      <label className="field"><span>Minimum order (EGP)</span><input type="number" min="0" step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} /></label>
      <label className="field"><span>Cutoff hour</span><select value={form.cutoff} onChange={(e) => patch({ cutoff: e.target.value })}>{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
      <label className="choice span-two"><input type="checkbox" checked={form.sameDay} onChange={(e) => patch({ sameDay: e.target.checked })} /><span>Same-day delivery available</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add city'}</Button>
  </form>;
}
```

- [ ] **Step 3: Rewrite the delivery page**

Replace the entire contents of `app/admin/delivery/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { AddCityForm } from '@/components/admin/AddCityForm';
import { DeliveryRuleForm, type DeliveryRuleInitial } from '@/components/admin/DeliveryRuleForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

const DEFAULT_FEE_MINOR = 1500;

type CityRow = { code: string; name_en: string; name_ar: string; same_day: boolean; delivery_rules?: Array<{ fee_minor: number; minimum_order_minor: number; cutoff_hour: number; active: boolean }> };

export default async function AdminDeliveryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { data } = await getAdminSupabase().from('cities').select('code,name_en,name_ar,same_day,delivery_rules(*)').order('code');
  const rows = (data ?? []) as CityRow[];
  return <main className="content-frame">
    <p className="eyebrow">Delivery operations</p>
    <h1>Delivery rules</h1>
    <AddCityForm />
    <div className="admin-table">
      {rows.map((city) => {
        const rule = city.delivery_rules?.[0];
        const initial: DeliveryRuleInitial = { feeMinor: rule?.fee_minor ?? DEFAULT_FEE_MINOR, minimumOrderMinor: rule?.minimum_order_minor ?? 0, cutoffHour: rule?.cutoff_hour ?? 14, active: rule?.active ?? false };
        return <article className="status-message" key={city.code}>
          <strong>{city.name_en}</strong>
          <span>{city.name_ar} · {city.code} · {city.same_day ? 'Same-day' : 'Next-day'} · {rule?.active ? 'Active' : 'Inactive'}</span>
          <DeliveryRuleForm cityCode={city.code} initial={initial} />
        </article>;
      })}
    </div>
  </main>;
}
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass; `/admin/delivery` compiles with the two new client components.

- [ ] **Step 5: Commit**

```bash
git add components/admin/DeliveryRuleForm.tsx components/admin/AddCityForm.tsx app/admin/delivery/page.tsx
git commit -m "feat: add inline delivery rules editor and add-city form"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm test && npm run lint && npm run build && git diff --check`
Expected: all tests pass (90 existing + 17 new = **107**), tsc clean, build succeeds, no whitespace errors.

- [ ] **Step 2: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS — the repository secret scan covers all `ts/tsx/js/mjs/json/md/env/sql/css` files.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A
git commit -m "chore: final admin delivery editor verification" || echo "nothing to commit"
```
