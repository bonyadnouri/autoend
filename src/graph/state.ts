/**
 * State abstraction for the interaction graph (issue #16).
 *
 * The hard problem the issue calls out: raw URLs are too fine-grained to be
 * graph nodes. `/product/1`, `/product/2`, `/product/abc-123` are the *same*
 * screen ("a product page"), and `/search?q=foo` vs `/search?q=bar` are the
 * same "search results" state. Without collapsing them, the graph explodes
 * into one node per visited URL and stops being a readable map of the app.
 *
 * `canonicalizeState` is the abstraction (clustering) function: it maps a raw
 * URL to a canonical node key by dropping the origin, replacing dynamic path
 * segments (ids, slugs, hashes) with a `:id` placeholder, and dropping volatile
 * query strings. Two URLs that denote the same screen collapse to the same
 * canonical id. It is deliberately a pure, deterministic function so it can be
 * unit-tested without a browser and swapped for a richer accessibility-snapshot
 * abstraction later (issue #16, approach B).
 */

export interface CanonicalState {
  /** Stable node key — equal for URLs that denote the same screen. */
  id: string;
  /** Human-readable label for the node. */
  label: string;
}

/**
 * A path segment is treated as dynamic (an id/parameter, not a distinct screen)
 * when it looks like one of the common id shapes. Kept conservative so that
 * genuine route names (e.g. "pricing", "about") are never collapsed.
 */
const PURE_NUMERIC = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{12,}$/i;
/** Long opaque token (base64url / random id) that also contains a digit. */
const OPAQUE_TOKEN = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/;

export function isDynamicSegment(segment: string): boolean {
  return (
    PURE_NUMERIC.test(segment) ||
    UUID.test(segment) ||
    LONG_HEX.test(segment) ||
    OPAQUE_TOKEN.test(segment)
  );
}

/** Normalize a path into canonical segments, replacing dynamic ones with `:id`. */
function canonicalizePath(pathname: string): string {
  const segments = pathname.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return '/';
  const canonical = segments.map((s) => (isDynamicSegment(decodeSafe(s)) ? ':id' : decodeSafe(s).toLowerCase()));
  return '/' + canonical.join('/');
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Map a raw URL to its canonical graph node. `target` (the Run's Target) lets
 * relative URLs resolve; when omitted, absolute URLs still work.
 */
export function canonicalizeState(rawUrl: string, target?: URL | string): CanonicalState {
  let url: URL;
  try {
    url = target ? new URL(rawUrl, typeof target === 'string' ? target : target.href) : new URL(rawUrl);
  } catch {
    // Not a parseable URL — treat the raw string as an opaque state.
    const cleaned = rawUrl.trim() || '/';
    return { id: cleaned, label: cleaned };
  }

  const path = canonicalizePath(url.pathname);

  // Hash routing (SPAs): a hash that looks like a route (`#/cart`) is part of
  // the state; a plain anchor (`#section`) is not.
  let hashRoute = '';
  if (url.hash.startsWith('#/')) {
    hashRoute = '#' + canonicalizePath(url.hash.slice(1));
  }

  const id = path + hashRoute;
  return { id, label: labelFor(id) };
}

/** A short human label: the last meaningful segment, or "home" for the root. */
function labelFor(canonicalId: string): string {
  const segments = canonicalId.replace(/^#/, '').split('/').filter((s) => s.length > 0 && s !== ':id');
  if (segments.length === 0) return 'home';
  return segments[segments.length - 1];
}
