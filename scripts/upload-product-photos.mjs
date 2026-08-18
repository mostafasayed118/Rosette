import { readFileSync } from 'node:fs';

// Reads .env.local for Supabase URL + service role key, lists all product
// slugs, downloads curated flower photos, uploads them to the public
// `product-images` bucket, and writes image_url on each product.

function env() {
  const raw = readFileSync('.env.local', 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return out;
}

const { NEXT_PUBLIC_SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: key } = env();
if (!base || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const PHOTO_IDS = [
  'photo-1490750967868-88aa4486c946',
  'photo-1455659817273-f96807779a8a',
  'photo-1470509037663-253afd7f0f51',
  'photo-1526047932273-341f2a7631f9',
  'photo-1496062031456-07b8f162a322',
  'photo-1519378058457-4c29a0a2efac',
  'photo-1508610048659-a06b669e3321',
  'photo-1471899236350-e3016bf1e69e',
  'photo-1518895949257-7621c3c786d7',
  'photo-1520763185298-1b434c919102',
  'photo-1559563362-c667ba5f5480',
  'photo-1533038590840-1cde6e668a91',
  'photo-1501492675107-47cf4d66f6f1',
  'photo-1519225421980-715cb0215aed',
  'photo-1416879595882-3373a0480b5b',
  'photo-1441974231531-c6227db76b6e',
];

async function ensureBucket() {
  const res = await fetch(`${base}/storage/v1/bucket`, { method: 'POST', headers, body: JSON.stringify({ id: 'product-images', name: 'product-images', public: true }) });
  if (res.ok) console.log('bucket created');
  else if (res.status === 400) console.log('bucket already exists (or name taken)');
  else throw new Error(`bucket create failed: ${res.status} ${await res.text()}`);
}

async function listSlugs() {
  const res = await fetch(`${base}/rest/v1/products?select=slug`, { headers });
  const rows = await res.json();
  return rows.map((row) => row.slug);
}

async function downloadPhoto(id) {
  const url = `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!type.startsWith('image/') || buf.length < 10_000) return null;
  return { buf, type };
}

async function uploadPhoto(slug, buf, type) {
  const res = await fetch(`${base}/storage/v1/object/product-images/${slug}.jpg`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': type },
    body: new Uint8Array(buf),
  });
  // 400 = the object already exists from a previous run; treat as uploaded.
  return res.ok || res.status === 400;
}

async function setImageUrl(slug, url) {
  const res = await fetch(`${base}/rest/v1/products?slug=eq.${slug}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ image_url: url }),
  });
  return res.ok;
}

await ensureBucket();
const slugs = await listSlugs();
console.log(`found ${slugs.length} products`);

let ok = 0;
let skipped = 0;
for (let i = 0; i < slugs.length; i += 1) {
  const slug = slugs[i];
  let photo = null;
  for (let attempt = 0; attempt < PHOTO_IDS.length && !photo; attempt += 1) {
    photo = await downloadPhoto(PHOTO_IDS[(i + attempt) % PHOTO_IDS.length]);
  }
  if (!photo) {
    console.log(`${slug} → skipped (no downloadable photo)`);
    skipped += 1;
    continue;
  }
  if (!(await uploadPhoto(slug, photo.buf, photo.type))) {
    console.log(`${slug} → skipped (upload failed)`);
    skipped += 1;
    continue;
  }
  const publicUrl = `${base}/storage/v1/object/public/product-images/${slug}.jpg`;
  if (!(await setImageUrl(slug, publicUrl))) {
    console.log(`${slug} → uploaded but image_url write failed`);
    skipped += 1;
    continue;
  }
  console.log(`${slug} → ok ${publicUrl}`);
  ok += 1;
}

console.log(`done: ${ok} ok, ${skipped} skipped`);
