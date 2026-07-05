import { isSupabaseConfigured } from "../lib/supabase";

export function SupabaseSetupBanner() {
  if (isSupabaseConfigured) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-900">
      Using mock data. Set <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code> and{" "}
      <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_ANON_KEY</code> in{" "}
      <code className="rounded bg-amber-100 px-1">.env.local</code> (local) or Vercel env vars (production), then redeploy.
    </div>
  );
}
