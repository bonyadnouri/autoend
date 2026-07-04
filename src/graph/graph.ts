/**
 * The interaction graph data model and its builder (issue #16, approach A).
 *
 * A Run observes raw transitions — "on URL X, action A led to URL Y". This
 * module clusters those raw observations into a compact graph: nodes are
 * canonical states (see `canonicalizeState`), edges are the actions that move
 * between them, deduped with an occurrence count. Unlike a generic crawl, every
 * edge here comes from a verified, replayable Flow — "the demonstrably-working
 * structure of the app".
 *
 * `buildGraph` is pure (raw transitions in, graph out) so it is unit-testable
 * without a browser. Producing the raw transitions from replay (a `page` proxy
 * that records navigations) is the separate instrumentation step.
 */
import { canonicalizeState } from './state.js';

/** One observed navigation: an `action` on `fromUrl` that ended on `toUrl`. */
export interface Transition {
  fromUrl: string;
  action: string;
  toUrl: string;
}

export interface GraphNode {
  /** Canonical state id (equal for URLs denoting the same screen). */
  id: string;
  label: string;
  /** Sample of the raw URLs that collapsed into this node (for debugging/UI). */
  sampleUrls: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  action: string;
  /** How many observed transitions collapsed into this edge. */
  count: number;
}

export interface InteractionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const MAX_SAMPLE_URLS = 5;

function normalizeAction(action: string): string {
  return action.trim().replace(/\s+/g, ' ');
}

/**
 * Cluster raw transitions into an interaction graph. Nodes are deduped by
 * canonical state id; edges are deduped by (from, action, to) with a count.
 */
export function buildGraph(transitions: Transition[], target?: URL | string): InteractionGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const touchNode = (rawUrl: string): string => {
    const { id, label } = canonicalizeState(rawUrl, target);
    const existing = nodes.get(id);
    if (existing) {
      if (!existing.sampleUrls.includes(rawUrl) && existing.sampleUrls.length < MAX_SAMPLE_URLS) {
        existing.sampleUrls.push(rawUrl);
      }
    } else {
      nodes.set(id, { id, label, sampleUrls: [rawUrl] });
    }
    return id;
  };

  for (const t of transitions) {
    const from = touchNode(t.fromUrl);
    const to = touchNode(t.toUrl);
    const action = normalizeAction(t.action);
    const key = `${from}\u0000${action}\u0000${to}`;
    const edge = edges.get(key);
    if (edge) {
      edge.count += 1;
    } else {
      edges.set(key, { from, to, action, count: 1 });
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
