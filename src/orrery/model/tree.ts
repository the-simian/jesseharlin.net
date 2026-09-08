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

/** What a moon is made of: deep space, a chime, a plucked string, a voice, or the old bell. */
export type Timbre = "deep" | "chime" | "string" | "vox" | "bell";

/** The timbres in the order moons take them; the bell is not in the round. */
export const TIMBRES: readonly Timbre[] = ["deep", "chime", "string", "vox"];

/**
 * Moons round one parent take the timbres in turn, in the order they were
 * added, so a ring of four sounds deep space, a chime, a string, and a voice. The sun and
 * planets have their own sections; the caller casts them by depth first.
 */
export function timbreOf(body: Body, bodies: readonly Body[]): Timbre {
  let ordinal = 0;
  for (const other of bodies) {
    if (other.id === body.id) break;
    if (other.parentId === body.parentId) ordinal++;
  }
  return TIMBRES[ordinal % TIMBRES.length] ?? "deep";
}
