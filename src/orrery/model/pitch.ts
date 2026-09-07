import type { BodyId, InstrumentState, ViewName } from "./types";

export function soundingPitch(state: InstrumentState, id: BodyId, view: ViewName): number {
  const visited = new Set<BodyId>();
  let cursor: BodyId | null = id;
  let offset = 0;
  while (cursor !== null) {
    if (visited.has(cursor)) throw new Error("Cyclic parentage.");
    visited.add(cursor);
    const body = state.bodies.find((candidate) => candidate.id === cursor);
    if (!body) throw new Error(`Unknown body: ${cursor}`);
    offset += body.pitchOffsetSemitones;
    cursor = body.parentId;
  }
  return state.anchorMidi + (view === "pool" ? -offset : offset);
}
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
