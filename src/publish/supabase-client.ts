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
 * Table writes work with the open-RLS `anon` key, but Storage bucket
 * creation/upload needs elevated rights — prefer the service-role key when
 * present. autoend is a server-side CLI (never a browser), so this is safe.
 */
export function supabaseCredentials(): SupabaseCredentials | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
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
