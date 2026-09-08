import type { BodyId, InstrumentState, ViewName } from "./types";

export const pitchClass = (value: number): number => ((value % 12) + 12) % 12;

/** Explicit score time keeps this function pure; omitted time means the opening pitch. */
export function soundingPitch(
  state: InstrumentState,
  id: BodyId,
  view: ViewName,
  timeSeconds = 0,
  pitchOffsets?: Readonly<Record<BodyId, number>>,
): number {
  if (!Number.isFinite(timeSeconds)) throw new Error("Pitch time must be finite.");
  const visited = new Set<BodyId>();
  let cursor: BodyId | null = id;
  let offset = 0;
  while (cursor !== null) {
    if (visited.has(cursor)) throw new Error("Cyclic parentage.");
    visited.add(cursor);
    const body = state.bodies.find((candidate) => candidate.id === cursor);
    if (!body) throw new Error(`Unknown body: ${cursor}`);
    // A live parent offset transposes every descendant without changing its orbit.
    offset += pitchOffsets?.[body.id] ?? body.pitchOffsetSemitones;
    cursor = body.parentId;
  }
  const snapped = snapToScale(state.scale, offset);
  return state.anchorMidi + (view === "pool" ? -snapped : snapped);
}

/**
 * Offsets stack down the chain and their sum can leave the scale even when
 * each step is on it. The sounding pitch is the nearest scale degree to that
 * sum (ties resolve downward), so whatever meets, agrees.
 */
export function snapToScale(scale: readonly number[], offset: number): number {
  if (scale.length === 0) return offset;
  const octave = Math.floor(offset / 12);
  const within = offset - octave * 12;
  let best = offset;
  let distance = Number.POSITIVE_INFINITY;
  for (const shift of [-12, 0, 12]) {
    for (const degree of scale) {
      const candidate = octave * 12 + degree + shift;
      const gap = Math.abs(candidate - offset);
      if (gap < distance || (gap === distance && candidate < best)) {
        distance = gap;
        best = candidate;
      }
    }
  }
  return within === best - octave * 12 ? offset : best;
}
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
