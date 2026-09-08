import type { Body, BodyId } from "./types";

/** Count parent edges, with the sun at depth zero. */
export function depthOf(body: Body, byId: ReadonlyMap<BodyId, Body>): number {
  let depth = 0;
  let parentId = body.parentId;
  const visited = new Set([body.id]);
  while (parentId !== null) {
    if (visited.has(parentId)) throw new Error("Cyclic parentage.");
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) throw new Error(`Unknown body: ${parentId}`);
    depth++;
    parentId = parent.parentId;
  }
  return depth;
}
