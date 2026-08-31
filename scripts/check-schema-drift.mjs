#!/usr/bin/env node
// check-schema-drift.mjs
//
// CI gate: fail when a local Supabase migration has not been applied to the
// live project. This catches situations like migrations 038-040 that exist
// locally but were never pushed to production (R-02 / R-10).
//
// Credentials (any one of these two setups enables the check):
//   - SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF  (uses Supabase REST/SQL API)
//   - DATABASE_URL                                    (direct Postgres connection)
//
// If neither is present, the script prints "SKIPPED (no credentials)" and exits 0
// so ordinary PRs are not blocked until secrets are configured as repo secrets.

import { readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function listLocalMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    // Version prefix is the zero-padded numeric prefix, e.g. "047" in "047_....sql".
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

// The Supabase CLI records applied migrations in
// supabase_migrations.schema_migrations(version). Some setups also use
// supabase_migration_history. We try the canonical one and fall back.
const APPLIED_QUERY = `
  SELECT version FROM supabase_migrations.schema_migrations
  UNION
  SELECT version FROM supabase_migration_history
`;

async function querySupabaseApi(token, ref, sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase API ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Response shape: array of rows with a `version` column.
  return (Array.isArray(data) ? data : []).map((r) => String(r.version));
}

async function queryDatabaseUrl(databaseUrl, sql) {
  // Defer the postgres client import so the script does not require pg when
  // running in SKIP mode (no credentials).
  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error(
      "DATABASE_URL is set but the 'pg' package is not installed. " +
        "Add 'pg' as a devDependency to use the direct-DB drift check."
    );
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    return rows.map((r) => String(r.version));
  } finally {
    await client.end();
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  const databaseUrl = process.env.DATABASE_URL;

  const hasApiCreds = Boolean(token && ref);
  const hasDbUrl = Boolean(databaseUrl);

  if (!hasApiCreds && !hasDbUrl) {
    console.log("SKIPPED (no credentials): set SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF,");
    console.log("  or DATABASE_URL, to enable the schema-drift gate.");
    process.exit(0);
  }

  let applied;
  if (hasApiCreds) {
    console.log(`Checking applied migrations for project ${ref} via Supabase API...`);
    applied = await querySupabaseApi(token, ref, APPLIED_QUERY);
  } else {
    console.log("Checking applied migrations via DATABASE_URL...");
    applied = await queryDatabaseUrl(databaseUrl, APPLIED_QUERY);
  }

  const appliedSet = new Set(applied.map((v) => v.trim()));
  const local = listLocalMigrations();

  const missing = local.filter((v) => !appliedSet.has(v.trim()));

  if (missing.length === 0) {
    console.log(
      `OK: all ${local.length} local migrations are applied to the live project.`
    );
    process.exit(0);
  }

  console.error("SCHEMA DRIFT DETECTED: the following local migrations are NOT applied");
  console.error("to the live project (deploy/apply them before merging):");
  for (const m of missing) console.error(`  - ${m}.sql`);
  process.exit(1);
}

main().catch((err) => {
  console.error("check-schema-drift failed:", err.message);
  process.exit(1);
});
