/**
 * Applies every supabase/migrations/*.sql file in order to the Supabase Postgres DB.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=your-db-password node scripts/apply-all-migrations.mjs
 *   (or pass a full SUPABASE_DB_URL connection string)
 *
 * Find the password in Supabase Dashboard -> Project Settings -> Database.
 */
import { readFileSync, readdirSync } from "node:fs";
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

// No hardcoded default: a wrong ref would silently migrate someone else's
// project. Require an explicit ref (or a full SUPABASE_DB_URL) so the target is
// always chosen deliberately.
const projectRef = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;

if (!process.env.SUPABASE_DB_URL && !projectRef) {
  console.error(
    "Missing SUPABASE_PROJECT_REF.\n" +
      "Find it in Supabase Dashboard -> Project Settings -> General -> Reference ID.\n" +
      "Or pass a full SUPABASE_DB_URL connection string.",
  );
  process.exit(1);
}

if (!password && !process.env.SUPABASE_DB_URL) {
  console.error(
    "Missing SUPABASE_DB_PASSWORD.\n" +
      "Get it from Supabase Dashboard -> Project Settings -> Database -> Database password.\n" +
      "Then run: SUPABASE_DB_PASSWORD='...' node scripts/apply-all-migrations.mjs",
  );
  process.exit(1);
}

const migrationsDir = resolve(__dirname, "../supabase/migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const TOLERABLE = /already exists|already a member|does not indicate/i;

async function applyAll(connectionString, label) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(resolve(migrationsDir, file), "utf8");
      process.stdout.write(`Applying ${file} via ${label}... `);
      try {
        await client.query(sql);
        console.log("done.");
      } catch (err) {
        const msg = String(err?.message ?? err);
        if (TOLERABLE.test(msg)) {
          console.log(`skipped (${msg.split("\n")[0]}).`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await client.end();
  }
}

if (process.env.SUPABASE_DB_URL) {
  await applyAll(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  console.log("All migrations applied.");
  process.exit(0);
}

const enc = encodeURIComponent(password);
const candidates = [
  { label: "direct db host", url: `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres` },
];
const regions = [
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1",
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ap-southeast-1", "ap-southeast-2", "ap-south-1", "ap-northeast-1", "ap-northeast-2",
  "sa-east-1", "ca-central-1",
];
const preferred = process.env.SUPABASE_DB_REGION;
if (preferred) regions.unshift(preferred);
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
    await applyAll(c.url, c.label);
    applied = true;
    break;
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/password authentication failed/i.test(msg)) {
      console.error("Database password rejected:", msg);
      process.exit(1);
    }
    // otherwise host/network error — try next candidate
  }
}

if (!applied) {
  console.error(
    "Could not reach the database on any known host. " +
      "Pass an explicit SUPABASE_DB_URL (Supabase Dashboard -> Connect) and rerun.",
  );
  process.exit(1);
}
console.log("All migrations applied.");
