export const DEFAULT_ANALYSIS_ID = "shopflow-default";

/**
 * A project is identified by its URL. The same URL always maps to the same
 * analysis id, so re-running a project replaces its data; a different URL is a
 * separate project kept alongside the others. The id is a stable, readable slug
 * of the URL's host + path, plus a short hash suffix so two URLs that slugify to
 * the same string can't collide.
 */
export function analysisIdForUrl(rawUrl: string): string {
  let host = "";
  let path = "";
  try {
    const u = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
    host = u.host.replace(/^www\./, "").toLowerCase();
    path = u.pathname.replace(/\/+$/, "");
  } catch {
    host = rawUrl.trim().toLowerCase();
  }
  const normalized = `${host}${path}`;
  const slug = normalized
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toLowerCase();
  return `proj-${slug || "app"}-${djb2(normalized)}`;
}

/** Small stable non-crypto hash → base36, to disambiguate slugs. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
