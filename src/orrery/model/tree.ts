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

/** What a moon is made of: a bell (the metallophone), a plucked string, or a voice. */
export type Timbre = "bell" | "string" | "vox";

export const TIMBRES: readonly Timbre[] = ["bell", "string", "vox"];

/**
 * Moons round one parent take the timbres in turn, in the order they were
 * added, so a ring of three sounds a bell, a string, and a voice. The sun and
 * planets have their own sections and are always bells here; the caller casts
 * them by depth first.
 */
export function timbreOf(body: Body, bodies: readonly Body[]): Timbre {
  let ordinal = 0;
  for (const other of bodies) {
    if (other.id === body.id) break;
    if (other.parentId === body.parentId) ordinal++;
  }
  return TIMBRES[ordinal % TIMBRES.length] ?? "bell";
}
