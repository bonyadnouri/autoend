import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVIDENCE_BUCKET } from './supabase-client.js';

const CONTENT_TYPES: Record<string, string> = {
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Best-effort bucket provisioning. The bucket is normally created by
 * lumen/supabase/migrations/002_evidence_bucket.sql; this only covers the case
 * of a project that skipped it. With the least-privileged `anon` key, both
 * getBucket and createBucket may be denied even though the bucket exists — so
 * this NEVER aborts the upload path. A truly-missing bucket surfaces later as
 * per-file upload errors, which are logged and skipped individually.
 */
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.storage.getBucket(EVIDENCE_BUCKET);
    if (data) return;
  } catch {
    // anon typically can't read storage.buckets — fall through and try create.
  }
  const { error } = await supabase.storage.createBucket(EVIDENCE_BUCKET, { public: true });
  // "already exists" (migration/another run) and RLS denials (the anon key
  // can't write storage.buckets — the normal case, since the bucket is created
  // by lumen/supabase/migrations/002_evidence_bucket.sql) both mean "proceed":
  // the bucket is presumed present and uploads will prove it. Only warn on a
  // genuinely unexpected error so the common path stays quiet.
  if (error && !/already exists|row-level security|violates row-level/i.test(error.message)) {
    console.warn(`could not ensure evidence bucket (continuing; assuming it exists): ${error.message}`);
  }
}

/**
 * Delete evidence from THIS project's earlier runs so the bucket doesn't grow
 * unbounded (each full Run re-uploads full video), while never touching another
 * project's or the current run's objects. Evidence is laid out under
 * `<runId>/<file>` — run ids aren't project-scoped in the path, so we ask the
 * `runs` table which run ids belong to this analysis and prune only those
 * (except `keepRunId`). Deleting every non-current folder wholesale used to
 * wipe other projects' videos AND, on a single-test re-run, the full run's
 * videos for every other test — leaving those `videoUrl`s pointing at deleted
 * objects (a blank/white player). Best-effort: pruning must never fail publish.
 */
async function pruneOldRuns(
  supabase: SupabaseClient,
  keepRunId: string,
  analysisId: string,
): Promise<void> {
  const bucket = supabase.storage.from(EVIDENCE_BUCKET);
  try {
    const { data: runs, error } = await supabase
      .from('runs')
      .select('id')
      .eq('analysis_id', analysisId)
      .neq('id', keepRunId);
    if (error || !runs) return;
    for (const run of runs) {
      const runId = run.id as string;
      const { data: files } = await bucket.list(runId, { limit: 1000 });
      if (!files || files.length === 0) continue;
      await bucket.remove(files.map((f) => `${runId}/${f.name}`));
    }
  } catch (err) {
    console.warn(`could not prune old evidence: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Upload every evidence file for a Run to Supabase Storage under
 * `<runId>/<file>` and return a map of {filename -> public URL} so the mapper
 * can point `replay.videoUrl` at the hosted WebM. Missing/unreadable files are
 * skipped; a total absence of evidence returns an empty map.
 *
 * `prune` controls cleanup of THIS project's earlier runs: a full run prunes
 * them (the bucket tracks the project's latest run); a single-test re-run does
 * NOT prune, so it can't delete the full run's videos for the other tests it
 * didn't touch. Never touches other projects' evidence either way.
 */
export async function uploadEvidence(
  supabase: SupabaseClient,
  runId: string,
  evidenceDir: string,
  analysisId: string,
  prune: boolean,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  let files: string[];
  try {
    files = await readdir(evidenceDir);
  } catch {
    return urls;
  }
  if (files.length === 0) return urls;

  await ensureBucket(supabase);

  for (const file of files) {
    let body: Buffer;
    try {
      body = await readFile(join(evidenceDir, file));
    } catch {
      continue;
    }
    const objectPath = `${runId}/${file}`;
    const contentType = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const { error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(objectPath, body, { contentType, upsert: true });
    if (error) {
      console.warn(`evidence upload failed for ${file}: ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(objectPath);
    urls.set(file, data.publicUrl);
  }

  // Only prune once this Run's evidence is safely uploaded, so a failed upload
  // never leaves the bucket empty of the run the report points at. Skipped for
  // single-test re-runs (prune=false) so other tests' videos survive.
  if (prune) await pruneOldRuns(supabase, runId, analysisId);

  return urls;
}
