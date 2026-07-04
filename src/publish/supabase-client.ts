import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Lumen UI reads a single analysis by this id (its default `analysisId`),
 * so publishing under the same id means the UI needs zero changes to show a Run.
 */
export const DEFAULT_ANALYSIS_ID = 'shopflow-default';

/** @deprecated use resolveAnalysisId() */
export const ANALYSIS_ID = DEFAULT_ANALYSIS_ID;

export function resolveAnalysisId(config?: { analysisId?: string }): string {
  return process.env.AUTOEND_ANALYSIS_ID ?? config?.analysisId ?? DEFAULT_ANALYSIS_ID;
}

/** Public Storage bucket that holds a Run's evidence (WebM video, screenshots). */
export const EVIDENCE_BUCKET = 'evidence';

interface SupabaseCredentials {
  url: string;
  key: string;
}

/**
 * Publishing uses the open-RLS `anon` key: the Lumen tables allow anon writes,
 * and the `evidence` bucket is provisioned public with anon upload/read policies
 * (lumen/supabase/migrations/002_evidence_bucket.sql), so no elevated key is
 * required. A service-role key is still accepted as a fallback for setups that
 * only configured that one, but it is no longer preferred — running with the
 * least-privileged key that works keeps a leaked/committed key low-blast-radius.
 *
 * SECURITY NOTE: the evidence bucket is PUBLIC — uploaded WebM video and
 * screenshots of the Target are world-readable at a guessable URL. Point
 * autoend at environments where that exposure is acceptable (localhost,
 * staging with test data), never production with real user data.
 */
export function supabaseCredentials(): SupabaseCredentials | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return supabaseCredentials() !== null;
}

/** Returns a client, or `null` when Supabase env vars are missing (offline runs). */
export function getSupabase(): SupabaseClient | null {
  const creds = supabaseCredentials();
  if (!creds) return null;
  return createClient(creds.url, creds.key, { auth: { persistSession: false } });
}
