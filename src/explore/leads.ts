import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * The Lead ledger (CONTEXT.md: Lead; ADR-0007): suspicious-but-unconfirmed
 * observations that outlive their finder. Wave two chases the best Leads of
 * wave one; unconsumed Leads persist here and seed the next Run — curiosity
 * compounds across Runs, like the Flow Map does for coverage.
 *
 * Lives at .autoend/leads.json beside the Flow Map, versioning with the
 * Target's codebase.
 */

export interface Lead {
  /** Content hash of the normalized hint — the dedupe key across Runs. */
  id: string;
  /** What looked suspicious or unexplored, in the explorer's words. */
  hint: string;
  /** Where to start chasing it. */
  url?: string;
  /** Which persona/wave reported it, e.g. "domain-power-user w1". */
  source: string;
  addedAt: string;
}

/** Ledger cap — oldest Leads fall off first; a stale scent is a cold scent. */
const LEDGER_CAP = 50;

function leadsPath(repoRoot: string): string {
  return join(repoRoot, '.autoend', 'leads.json');
}

export function makeLead(hint: string, source: string, url?: string): Lead {
  const id = createHash('sha256').update(normalizeHint(hint)).digest('hex').slice(0, 12);
  return { id, hint, url, source, addedAt: new Date().toISOString() };
}

function normalizeHint(hint: string): string {
  return hint.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Missing or corrupt ledger means no Leads — the ledger must never fail a Run. */
export async function loadLeads(repoRoot: string): Promise<Lead[]> {
  try {
    const parsed = JSON.parse(await readFile(leadsPath(repoRoot), 'utf8')) as { leads?: unknown };
    if (!Array.isArray(parsed.leads)) return [];
    return parsed.leads.filter(
      (l): l is Lead =>
        typeof l === 'object' && l !== null &&
        typeof (l as Lead).id === 'string' && typeof (l as Lead).hint === 'string',
    );
  } catch {
    return [];
  }
}

export async function saveLeads(repoRoot: string, leads: Lead[]): Promise<void> {
  await mkdir(join(repoRoot, '.autoend'), { recursive: true });
  const capped = leads.slice(-LEDGER_CAP);
  await writeFile(leadsPath(repoRoot), JSON.stringify({ leads: capped }, null, 2));
}

/** Dedupe by id (newest wins for freshness metadata). Pure — exported for tests. */
export function dedupeLeads(leads: Lead[]): Lead[] {
  const byId = new Map<string, Lead>();
  for (const lead of leads) byId.set(lead.id, lead);
  return [...byId.values()];
}

/**
 * Split the ledger for a Wave: `taken` seeds the explorers, `rest` stays.
 * Newest first — recent scents are warmest. Pure — exported for tests.
 */
export function takeLeads(leads: Lead[], count: number): { taken: Lead[]; rest: Lead[] } {
  const newestFirst = [...leads].reverse();
  const taken = newestFirst.slice(0, count);
  const takenIds = new Set(taken.map((l) => l.id));
  return { taken, rest: leads.filter((l) => !takenIds.has(l.id)) };
}
