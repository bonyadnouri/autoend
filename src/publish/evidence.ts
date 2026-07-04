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

/** Create the public evidence bucket on first use; idempotent. */
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.storage.getBucket(EVIDENCE_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(EVIDENCE_BUCKET, { public: true });
  // A parallel run may have created it between the check and now — ignore that race.
  if (error && !/already exists/i.test(error.message)) throw error;
}

/**
 * Upload every evidence file for a Run to Supabase Storage under
 * `<runId>/<file>` and return a map of {filename -> public URL} so the mapper
 * can point `replay.videoUrl` at the hosted WebM. Missing/unreadable files are
 * skipped; a total absence of evidence returns an empty map.
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

  // Evidence hosting is best-effort: if the bucket can't be ensured (e.g. the
  // key lacks Storage rights), skip uploads and still publish the table data.
  try {
    await ensureBucket(supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`evidence bucket unavailable, skipping uploads: ${message}`);
    return urls;
  }

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

  return urls;
}
