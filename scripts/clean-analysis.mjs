// Delete EVERYTHING belonging to one or more analyses (projects): all child
// rows, their runs + events, their evidence in Storage, and the analyses rows
// themselves. Usage:
//   node scripts/clean-analysis.mjs <analysisId> [<analysisId> ...]
//   node scripts/clean-analysis.mjs --list          # show analyses first
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const raw = await readFile(new URL('../.env', import.meta.url), 'utf8').catch(() => '');
for (const line of raw.split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY must be set (in .env or the environment)');
  process.exit(2);
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--list') {
  const { data, error } = await supabase.from('analyses').select('id, app_url, analyzed_at');
  if (error) throw error;
  console.log('analyses in the database:');
  for (const a of data ?? []) console.log(`  ${a.id}  ${a.app_url ?? ''}  (analyzed ${a.analyzed_at ?? 'never'})`);
  if (args.length === 0) console.log('\nusage: node scripts/clean-analysis.mjs <analysisId> [...more]');
  process.exit(0);
}

// Children first, parents last, so FK constraints never block a delete.
const CHILD_TABLES = ['investigations', 'insights', 'issues', 'tests', 'journeys', 'screen_edges', 'screens'];

for (const analysisId of args) {
  console.log(`\ncleaning ${analysisId} ...`);

  // 1. Evidence in Storage lives under <runId>/ — find this analysis's runs first.
  const { data: runs, error: runsError } = await supabase.from('runs').select('id').eq('analysis_id', analysisId);
  if (runsError) throw runsError;
  const bucket = supabase.storage.from('evidence');
  for (const run of runs ?? []) {
    const { data: files } = await bucket.list(run.id, { limit: 1000 });
    if (files && files.length > 0) {
      const { error } = await bucket.remove(files.map((f) => `${run.id}/${f.name}`));
      if (error) console.warn(`  evidence ${run.id}: ${error.message}`);
      else console.log(`  evidence ${run.id}: ${files.length} file(s) removed`);
    }
  }

  // 2. Run events, then runs.
  const runIds = (runs ?? []).map((r) => r.id);
  if (runIds.length > 0) {
    const { error } = await supabase.from('run_events').delete().in('run_id', runIds);
    if (error) console.warn(`  run_events: ${error.message}`);
  }
  const { error: runsDelError } = await supabase.from('runs').delete().eq('analysis_id', analysisId);
  if (runsDelError) console.warn(`  runs: ${runsDelError.message}`);
  else console.log(`  runs: ${runIds.length} deleted`);

  // 3. Child tables, then the analysis row itself.
  for (const table of CHILD_TABLES) {
    const { error } = await supabase.from(table).delete().eq('analysis_id', analysisId);
    if (error) console.warn(`  ${table}: ${error.message}`);
  }
  const { error: aError } = await supabase.from('analyses').delete().eq('id', analysisId);
  if (aError) console.warn(`  analyses: ${aError.message}`);
  console.log(`  done`);
}

const { data: left } = await supabase.from('analyses').select('id, app_url');
console.log('\nremaining analyses:');
for (const a of left ?? []) console.log(`  ${a.id}  ${a.app_url ?? ''}`);
