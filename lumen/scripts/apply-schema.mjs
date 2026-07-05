/**
 * Applies supabase/migrations/001_schema.sql to your Supabase Postgres database.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=your-db-password npm run db:migrate
 *
 * Find the password in Supabase Dashboard → Project Settings → Database.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvLocal();

const projectRef = process.env.SUPABASE_PROJECT_REF ?? "jcgkclbknftkkjbexxvh";
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password && !process.env.SUPABASE_DB_URL) {
  console.error(
    "Missing SUPABASE_DB_PASSWORD.\n" +
      "Get it from Supabase Dashboard → Project Settings → Database → Database password.\n" +
      "Then run: SUPABASE_DB_PASSWORD='...' npm run db:migrate\n" +
      "(Or pass a full SUPABASE_DB_URL connection string.)",
  );
  process.exit(1);
}

const sql = readFileSync(
  resolve(__dirname, "../supabase/migrations/001_schema.sql"),
  "utf8",
);

async function runWith(connectionString, label) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  try {
    console.log(`Applying schema migration via ${label}...`);
    await client.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

if (process.env.SUPABASE_DB_URL) {
  await runWith(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  process.exit(0);
}

// Try direct connection first, then region poolers (EU prioritized given typical usage).
const enc = encodeURIComponent(password);
const candidates = [
  {
    label: "direct db host",
    url: `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres`,
  },
];

const regions = [
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "sa-east-1",
  "ca-central-1",
];
for (const region of regions) {
  for (const prefix of ["aws-0", "aws-1"]) {
    candidates.push({
      label: `${prefix}-${region} session pooler`,
      url: `postgresql://postgres.${projectRef}:${enc}@${prefix}-${region}.pooler.supabase.com:5432/postgres`,
    });
  }
}

let applied = false;
for (const c of candidates) {
  try {
    await runWith(c.url, c.label);
    applied = true;
    break;
  } catch (err) {
    const msg = String(err?.message ?? err);
    // Auth succeeded but schema already exists -> treat as done.
    if (/already exists/i.test(msg)) {
      console.log("Schema objects already exist — nothing to do.");
      applied = true;
      break;
    }
    // Only keep trying on host/tenant/network errors; stop on a real auth failure.
    if (/password authentication failed/i.test(msg)) {
      console.error("Database password rejected:", msg);
      process.exit(1);
    }
  }
}

if (!applied) {
  console.error(
    "Could not reach the database on any known host. " +
      "Pass an explicit SUPABASE_DB_URL (copy the connection string from " +
      "Supabase Dashboard → Connect) and rerun.",
  );
  process.exit(1);
}
