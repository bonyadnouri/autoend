const DYNAMIC_SEGMENT = /^[\da-f]{8,}$|^\d+$/i;

/** Normalize a URL pathname into a stable screen id. */
export function screenId(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname
      .replace(/\/+$/, '')
      .split('/')
      .filter(Boolean)
      .map((seg) => (DYNAMIC_SEGMENT.test(seg) ? ':id' : seg.toLowerCase()));
    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
  } catch {
    return '/';
  }
}

export function screenTitle(path: string): string {
  if (path === '/') return 'Home';
  const last = path.split('/').filter(Boolean).pop() ?? 'page';
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function edgeId(source: string, target: string): string {
  return `${source}→${target}`;
}
