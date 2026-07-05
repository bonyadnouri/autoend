import type { Screen, ScreenEdge } from "../types";

/**
 * Relative spacing between laid-out nodes, in React Flow coordinate units — not
 * pixels. The map always renders with `fitView`, so these only control the
 * graph's proportions (how far apart neighbours sit), never its on-screen size;
 * the layout adapts to any node count, aspect ratio, or viewport.
 */
const LAYER_GAP = 320;
const SIBLING_GAP = 180;

/** A stored position counts as "real" (user-dragged or seeded) once it leaves the origin. */
function hasRealPosition(screen: Screen): boolean {
  return screen.position.x !== 0 || screen.position.y !== 0;
}

/**
 * Derive graph positions from the screen/edge structure instead of persisting
 * absolute coordinates. Screens are placed in BFS layers from the entry points
 * (or edge-less roots), so a freshly streamed run lays itself out readably
 * without the backend baking in pixel positions. Screens that already carry a
 * real stored position keep it (respecting drags and seeded layouts).
 */
export function layoutScreens(
  screens: Screen[],
  edges: ScreenEdge[],
): Map<string, { x: number; y: number }> {
  const ids = screens.map((s) => s.id);
  const idSet = new Set(ids);
  const screenById = new Map(screens.map((s) => [s.id, s]));

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) {
    adjacency.set(id, []);
    indegree.set(id, 0);
  }
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const roots = ids.filter((id) => screenById.get(id)!.isEntryPoint || (indegree.get(id) ?? 0) === 0);
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const root of roots.length > 0 ? roots : ids.slice(0, 1)) {
    layer.set(root, 0);
    queue.push(root);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = layer.get(current)!;
    for (const next of adjacency.get(current) ?? []) {
      if (!layer.has(next)) {
        layer.set(next, depth + 1);
        queue.push(next);
      }
    }
  }

  // Any node the traversal never reached (disconnected) lands in a trailing layer.
  let maxLayer = 0;
  for (const depth of layer.values()) maxLayer = Math.max(maxLayer, depth);
  for (const id of ids) if (!layer.has(id)) layer.set(id, maxLayer + 1);

  const byLayer = new Map<number, string[]>();
  for (const id of ids) {
    const depth = layer.get(id)!;
    if (!byLayer.has(depth)) byLayer.set(depth, []);
    byLayer.get(depth)!.push(id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, group] of byLayer) {
    group.forEach((id, index) => {
      const screen = screenById.get(id)!;
      positions.set(
        id,
        hasRealPosition(screen)
          ? screen.position
          : { x: depth * LAYER_GAP, y: index * SIBLING_GAP },
      );
    });
  }
  return positions;
}
