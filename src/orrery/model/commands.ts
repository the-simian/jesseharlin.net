import { PRESETS } from "./presets";
import type { Body, BodyId, Drift, InstrumentState, PatchName, Ratio, ViewName } from "./types";
import { validateState } from "./validate";

function accept(previous: InstrumentState, next: InstrumentState): InstrumentState {
  return validateState(next).ok ? next : previous;
}
function edit(state: InstrumentState, id: BodyId, patch: Partial<Body>): InstrumentState {
  if (!state.bodies.some((body) => body.id === id)) return state;
  const resetsPitch = "pitchOffsetSemitones" in patch || "drift" in patch;
  return accept(state, {
    ...state,
    bodies: state.bodies.map((body) =>
      body.id === id
        ? {
            ...body,
            ...patch,
            ...(resetsPitch ? { pitchRevision: (body.pitchRevision ?? 0) + 1 } : {}),
          }
        : body,
    ),
  });
}
export function createInitialState(): InstrumentState {
  const first = PRESETS[0];
  if (!first) throw new Error("A default ensemble is required.");
  return first.build();
}

export function applyPreset(state: InstrumentState, presetId: string): InstrumentState {
  const preset = PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return state;
  return accept(state, {
    ...preset.build(),
    arrangement: state.arrangement + 1,
    soundEnabled: state.soundEnabled,
    activeView: state.activeView,
  });
}
/** Speed ratios handed to successive siblings on one ring, so they lap each other and meet. */
const SIBLING_RATIOS: Ratio[] = [
  { numerator: 1, denominator: 1 },
  { numerator: 3, denominator: 2 },
  { numerator: 1, denominator: 2 },
  { numerator: 2, denominator: 1 },
  { numerator: 2, denominator: 3 },
  { numerator: 3, denominator: 1 },
  { numerator: 1, denominator: 3 },
];

/** The innermost ring a child of this parent may use without touching the parent's disc. */
export function innermostRing(parent: Body, discRadius: number): number {
  return parent.discRadius + discRadius + 0.2;
}

/**
 * Add a child around parentId. New siblings share the first sibling's ring at a
 * different speed, so bodies meet and the instrument has something to say;
 * separate rings are a choice the visitor makes with setOrbitRadius.
 */
export function addBody(state: InstrumentState, parentId: BodyId): InstrumentState {
  const parent = state.bodies.find((body) => body.id === parentId);
  if (!parent) return state;
  let serial = 1;
  while (state.bodies.some((body) => body.id === `body-${serial}`)) serial++;
  const siblings = state.bodies.filter((body) => body.parentId === parentId);
  const discRadius = parent.discRadius * 0.55;
  const first = siblings[0];
  const orbitRadius = first ? first.orbitRadius : innermostRing(parent, discRadius) + 0.6;
  const ratio = SIBLING_RATIOS[siblings.length % SIBLING_RATIOS.length] ?? SIBLING_RATIOS[0];
  return accept(state, {
    ...state,
    bodies: [
      ...state.bodies,
      {
        id: `body-${serial}`,
        parentId,
        discRadius,
        orbitRadius,
        eccentricity: 0,
        periapsisRadians: 0,
        phaseRadians: (siblings.length * Math.PI * (3 - Math.sqrt(5))) % (2 * Math.PI),
        speedRatio: { ...(ratio as Ratio) },
        pitchOffsetSemitones: 0,
        exchangesPitch: parent.parentId !== null,
        strikesParent: false,
        drift: { mode: "still" },
      },
    ],
  });
}
export function removeBody(state: InstrumentState, id: BodyId): InstrumentState {
  if (!state.bodies.some((body) => body.id === id)) return state;
  const removed = new Set([id]);
  let count = 0;
  while (count !== removed.size) {
    count = removed.size;
    for (const body of state.bodies)
      if (body.parentId !== null && removed.has(body.parentId)) removed.add(body.id);
  }
  return accept(state, {
    ...state,
    bodies: state.bodies.filter((body) => !removed.has(body.id)),
    selectedBodyIds: state.selectedBodyIds.filter((selected) => !removed.has(selected)),
  });
}
export const setPatch = (state: InstrumentState, id: BodyId, patch: PatchName) =>
  edit(state, id, { patch });
export const setRatio = (state: InstrumentState, id: BodyId, speedRatio: Ratio) =>
  edit(state, id, { speedRatio: { ...speedRatio } });
export const setOffset = (state: InstrumentState, id: BodyId, pitchOffsetSemitones: number) =>
  edit(state, id, { pitchOffsetSemitones });
export const setDrift = (state: InstrumentState, id: BodyId, drift: Drift) =>
  edit(state, id, {
    drift: { ...drift },
  });
export const setPhase = (state: InstrumentState, id: BodyId, phaseRadians: number) =>
  edit(state, id, { phaseRadians });
export const setOrbitRadius = (state: InstrumentState, id: BodyId, orbitRadius: number) =>
  edit(state, id, { orbitRadius });
export const selectBody = (state: InstrumentState, id: BodyId) =>
  accept(state, { ...state, selectedBodyIds: [id] });
export const clearSelection = (state: InstrumentState) =>
  accept(state, { ...state, selectedBodyIds: [] });
export const setSoundEnabled = (state: InstrumentState, soundEnabled: boolean) =>
  accept(state, { ...state, soundEnabled });
export const setActiveView = (state: InstrumentState, activeView: ViewName | null) =>
  accept(state, { ...state, activeView });
