// Empty the 'evidence' Storage bucket via the Storage API (direct SQL deletes
// on storage.objects are blocked by Supabase). Usage: node scripts/empty-evidence.mjs
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const raw = await readFile(new URL('../.env', import.meta.url), 'utf8').catch(() => '');
for (const line of raw.split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const bucket = supabase.storage.from('evidence');
let removed = 0;

// Top level is one folder per runId; files live one level down.
const { data: entries, error } = await bucket.list('', { limit: 1000 });
if (error) throw error;
for (const entry of entries ?? []) {
  if (entry.id) {
    // A real file at the root.
    const { error: e } = await bucket.remove([entry.name]);
    if (!e) removed += 1;
    continue;
  }
  // A folder (runId): list and remove its contents.
  const { data: files, error: listError } = await bucket.list(entry.name, { limit: 1000 });
  if (listError) {
    console.warn(`${entry.name}: ${listError.message}`);
    continue;
  }
  if (!files || files.length === 0) continue;
  const paths = files.map((f) => `${entry.name}/${f.name}`);
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) console.warn(`${entry.name}: ${removeError.message}`);
  else {
    removed += paths.length;
    console.log(`${entry.name}: ${paths.length} file(s) removed`);
  }
}
console.log(`\ndone — ${removed} file(s) removed from 'evidence'`);
