import type { Body, BodyId, Drift, InstrumentState, Ratio, ViewName } from "./types";
import { validateState } from "./validate";

function accept(previous: InstrumentState, next: InstrumentState): InstrumentState {
  return validateState(next).ok ? next : previous;
}
function edit(state: InstrumentState, id: BodyId, patch: Partial<Body>): InstrumentState {
  if (!state.bodies.some((body) => body.id === id)) return state;
  return accept(state, {
    ...state,
    bodies: state.bodies.map((body) => (body.id === id ? { ...body, ...patch } : body)),
  });
}
export function createInitialState(): InstrumentState {
  return {
    bodies: [
      {
        id: "sun",
        parentId: null,
        discRadius: 0.35,
        orbitRadius: 0,
        phaseRadians: 0,
        speedRatio: { numerator: 1, denominator: 1 },
        pitchOffsetSemitones: 0,
        drift: { mode: "still" },
      },
    ],
    selectedBodyIds: [],
    anchorMidi: 57,
    baseTurnsPerSecond: 0.25,
    maxVoices: 6,
    soundEnabled: false,
    activeView: null,
  };
}
export function addBody(state: InstrumentState, parentId: BodyId): InstrumentState {
  const parent = state.bodies.find((body) => body.id === parentId);
  if (!parent) return state;
  let serial = 1;
  while (state.bodies.some((body) => body.id === `body-${serial}`)) serial++;
  const siblings = state.bodies.filter((body) => body.parentId === parentId);
  const discRadius = parent.discRadius * 0.55;
  const orbitRadius = Math.max(
    parent.discRadius + discRadius + 0.2,
    ...siblings.map(
      (body) =>
        body.orbitRadius +
        body.discRadius +
        discRadius +
        0.2 +
        (body.drift.mode !== "still" && body.drift.target === "orbitRadius"
          ? body.drift.amplitude
          : 0),
    ),
  );
  return accept(state, {
    ...state,
    bodies: [
      ...state.bodies,
      {
        id: `body-${serial}`,
        parentId,
        discRadius,
        orbitRadius,
        phaseRadians: (siblings.length * Math.PI * (3 - Math.sqrt(5))) % (2 * Math.PI),
        speedRatio: { numerator: 1, denominator: 1 },
        pitchOffsetSemitones: 0,
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
export const setRatio = (state: InstrumentState, id: BodyId, speedRatio: Ratio) =>
  edit(state, id, { speedRatio: { ...speedRatio } });
export const setOffset = (state: InstrumentState, id: BodyId, pitchOffsetSemitones: number) =>
  edit(state, id, { pitchOffsetSemitones });
export const setDrift = (state: InstrumentState, id: BodyId, drift: Drift) =>
  edit(state, id, { drift: { ...drift } });
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
