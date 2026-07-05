/**
 * Screen ids are URL paths (e.g. "/login", "/projects/alpha/tasks/new", "/"),
 * so they contain slashes. A raw `/screens/${id}` link produces `/screens//login`,
 * which the single-segment `:id` route can't match — the router falls through to
 * NotFound. Encoding the id keeps it inside one path segment; ScreenDetails
 * decodes it back before looking the screen up.
 */
export function screenHref(id: string): string {
  return `/screens/${encodeURIComponent(id)}`;
}

/** Reverse of {@link screenHref}: recover a screen id from a route param. */
export function screenIdFromParam(param: string | undefined): string | undefined {
  if (param === undefined) return undefined;
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}
