/**
 * Turning observed navigation into graph transitions (issue #16, approach A).
 *
 * During replay each Flow drives a real browser; we record the ordered list of
 * main-frame URLs it lands on (the "visits"). `transitionsFromVisits` turns
 * that ordered list into consecutive `(fromUrl, action, toUrl)` transitions,
 * which `buildGraph` then clusters into the interaction graph.
 *
 * This is the "cheap, lossy" approach the issue describes: the action label is
 * a generic `navigate` for now (precise per-click labels are a follow-up), but
 * the edges are real, verified navigations. Kept pure so it is unit-testable
 * without a browser.
 */
import type { Transition } from './graph.js';

/** Generic action label until per-interaction labels are captured. */
export const NAVIGATE = 'navigate';

/**
 * Ordered main-frame URLs → consecutive transitions. Consecutive duplicates
 * (a reload or same-URL navigation event) produce no edge.
 */
export function transitionsFromVisits(visits: string[]): Transition[] {
  const transitions: Transition[] = [];
  for (let i = 1; i < visits.length; i += 1) {
    const fromUrl = visits[i - 1];
    const toUrl = visits[i];
    if (fromUrl === toUrl) continue;
    transitions.push({ fromUrl, action: NAVIGATE, toUrl });
  }
  return transitions;
}

/**
 * Append a URL to a visits list, ignoring blanks and consecutive duplicates.
 * Used by the replay recorder as the browser navigates.
 */
export function pushVisit(visits: string[], url: string): void {
  if (!url || url === 'about:blank') return;
  if (visits[visits.length - 1] === url) return;
  visits.push(url);
}
