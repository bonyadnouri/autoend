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
  // "already exists" (migration/another run) or a permission error both mean
  // "proceed": the bucket is presumed present and uploads will prove it.
  if (error && !/already exists/i.test(error.message)) {
    console.warn(`could not ensure evidence bucket (continuing; assuming it exists): ${error.message}`);
  }
}

/**
 * Delete every object from Runs other than `keepRunId` so the bucket doesn't
 * grow unbounded (each Run re-uploads full video). Best-effort: a failure to
 * prune must never fail a publish. Objects are laid out under `<runId>/<file>`,
 * so top-level "folders" are Run ids.
 */
async function pruneOldRuns(supabase: SupabaseClient, keepRunId: string): Promise<void> {
  const bucket = supabase.storage.from(EVIDENCE_BUCKET);
  try {
    const { data: roots, error } = await bucket.list('', { limit: 1000 });
    if (error || !roots) return;
    for (const entry of roots) {
      // Directory entries come back with no id/metadata; files at the root
      // (there shouldn't be any) have an id — skip those to be safe.
      if (entry.name === keepRunId || entry.id) continue;
      const { data: files } = await bucket.list(entry.name, { limit: 1000 });
      if (!files || files.length === 0) continue;
      await bucket.remove(files.map((f) => `${entry.name}/${f.name}`));
    }
  } catch (err) {
    console.warn(`could not prune old evidence: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Upload every evidence file for a Run to Supabase Storage under
 * `<runId>/<file>` and return a map of {filename -> public URL} so the mapper
 * can point `replay.videoUrl` at the hosted WebM. Missing/unreadable files are
 * skipped; a total absence of evidence returns an empty map. Objects from
 * prior Runs are pruned so the bucket tracks only the latest Run.
 */
export async function uploadEvidence(
  supabase: SupabaseClient,
  runId: string,
  evidenceDir: string,
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
  // never leaves the bucket empty of the run the report points at.
  await pruneOldRuns(supabase, runId);

  return urls;
}
