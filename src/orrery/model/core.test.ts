import { test } from "bun:test";
import {
  addBody,
  clearSelection,
  createInitialState,
  removeBody,
  selectBody,
  setActiveView,
  setDrift,
  setOffset,
  setOrbitRadius,
  setPhase,
  setRatio,
  setSoundEnabled,
} from "./commands";
import { midiToHz, soundingPitch } from "./pitch";
import { createSimulation } from "./simulation";
import { type Body, type InstrumentState, LIMITS } from "./types";
import { validateState } from "./validate";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function close(actual: number, expected: number, tolerance = 1e-8) {
  assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
function child(id: string, patch: Partial<Body> = {}): Body {
  return {
    id,
    parentId: "sun",
    discRadius: 0.1,
    orbitRadius: 1,
    phaseRadians: 0,
    speedRatio: { numerator: 1, denominator: 1 },
    pitchOffsetSemitones: 0,
    drift: { mode: "still" },
    ...patch,
  };
}
function pair(): InstrumentState {
  const state = createInitialState();
  return {
    ...state,
    bodies: [
      ...state.bodies,
      child("a"),
      child("b", {
        phaseRadians: Math.PI,
        speedRatio: { numerator: 2, denominator: 1 },
      }),
    ],
  };
}

test("initial state is a lone silent sun with the required defaults", () => {
  const state = createInitialState();
  assert(validateState(state).ok);
  assert(state.bodies.length === 1 && state.bodies[0]?.parentId === null);
  assert(state.anchorMidi === 57 && state.baseTurnsPerSecond === 0.25 && state.maxVoices === 6);
  assert(!state.soundEnabled && state.activeView === null);
  assert(
    createSimulation(state)
      .advance(1)
      .every((frame) => frame.contacts.length === 0),
  );
});

test("validation rejects malformed trees, limits, and geometry", () => {
  const initial = createInitialState();
  const sun = initial.bodies[0];
  assert(sun);
  const invalid: InstrumentState[] = [
    { ...initial, bodies: [] },
    { ...initial, bodies: [sun, { ...sun, id: "second" }] },
    { ...initial, bodies: [sun, child("a", { parentId: "missing" })] },
    { ...initial, bodies: [sun, child("a", { parentId: "b" }), child("b", { parentId: "a" })] },
    {
      ...initial,
      bodies: [sun, child("a"), child("b", { parentId: "a" }), child("c", { parentId: "b" })],
    },
    {
      ...initial,
      bodies: [sun, ...Array.from({ length: LIMITS.maxBodies }, (_, i) => child(`${i}`))],
    },
    { ...initial, bodies: [sun, child("a"), child("a")] },
    ...[
      { discRadius: 0 },
      { discRadius: -1 },
      { discRadius: Number.NaN },
      { orbitRadius: 0.4 },
      { orbitRadius: Number.POSITIVE_INFINITY },
      { phaseRadians: Number.NaN },
      { pitchOffsetSemitones: 1 },
      { speedRatio: { numerator: 7, denominator: 1 } },
      { drift: { mode: "sine", target: "orbitRadius", amplitude: 0.8, periodSeconds: 10 } },
      { drift: { mode: "sine", target: "speed", amplitude: 2, periodSeconds: 10 } },
      { drift: { mode: "stair", target: "speed", amplitude: 0.1, periodSeconds: 0 } },
    ].map((patch) => ({ ...initial, bodies: [sun, child("a", patch as Partial<Body>)] })),
  ];
  for (const state of invalid) assert(!validateState(state).ok, JSON.stringify(state));
  for (const speedRatio of LIMITS.allowedRatios)
    assert(validateState({ ...initial, bodies: [sun, child("a", { speedRatio })] }).ok);
  assert(validateState({ ...initial, bodies: [sun, child("a", { orbitRadius: 0.45 })] }).ok);
});

test("commands are immutable, validate edits, spread siblings, and remove descendants", () => {
  const initial = createInitialState();
  const snapshot = JSON.stringify(initial);
  Object.freeze(initial.bodies[0]);
  Object.freeze(initial.bodies);
  Object.freeze(initial);
  const first = addBody(initial, "sun");
  assert(JSON.stringify(initial) === snapshot && first !== initial);
  const second = addBody(first, "sun");
  const a = second.bodies[1];
  const b = second.bodies[2];
  assert(a && b);
  assert(
    b.orbitRadius > a.orbitRadius + a.discRadius + b.discRadius &&
      b.phaseRadians !== a.phaseRadians,
  );
  const nested = addBody(second, a.id);
  const moon = nested.bodies[3];
  assert(moon);
  assert(addBody(nested, moon.id) === nested);
  assert(removeBody(nested, "sun") === nested);
  const selected = selectBody(nested, moon.id);
  const removed = removeBody(selected, a.id);
  assert(removed.bodies.length === 2 && removed.selectedBodyIds.length === 0);
  assert(clearSelection(selected).selectedBodyIds.length === 0);
  assert(selectBody(second, "missing") === second);
  assert(setRatio(second, a.id, { numerator: 7, denominator: 1 }) === second);
  assert(setOffset(second, a.id, 1) === second);
  assert(setOrbitRadius(second, a.id, 0) === second);
  assert(setPhase(second, a.id, Number.NaN) === second);
  assert(setPhase(second, a.id, 1).bodies[1]?.phaseRadians === 1);
  assert(
    setDrift(second, a.id, { mode: "sine", target: "speed", amplitude: 0.1, periodSeconds: 20 }) !==
      second,
  );
  assert(setSoundEnabled(second, true).soundEnabled && !second.soundEnabled);
  assert(setActiveView(second, "pool").activeView === "pool");
  let full = second;
  while (full.bodies.length < LIMITS.maxBodies) full = addBody(full, "sun");
  assert(addBody(full, "sun") === full);
});

test("pitch includes the sun and every ancestor, mirrored around A3 in the pool", () => {
  let state = addBody(addBody(createInitialState(), "sun"), "body-1");
  state = setOffset(setOffset(setOffset(state, "sun", -4), "body-1", 7), "body-2", 5);
  close(soundingPitch(state, "sun", "telescope"), 53);
  close(soundingPitch(state, "body-2", "telescope"), 65);
  close(soundingPitch(state, "body-2", "pool"), 49);
  close(midiToHz(69), 440);
  close(midiToHz(57), 220);
});

test("contact entry matches relative-speed period and finite-disc entry angle", () => {
  const simulation = createSimulation(pair());
  const contacts = simulation.advance(14).flatMap((frame) => frame.contacts);
  const relativeSpeed = 2 * Math.PI * 0.25;
  const period = (2 * Math.PI) / relativeSpeed;
  const entryAngle = 2 * Math.asin(0.2 / 2);
  const first = (Math.PI - entryAngle) / relativeSpeed;
  assert(contacts.length === 4);
  contacts.forEach((contact, i) => {
    close(contact.time, first + i * period, 0.0001);
    assert(
      contact.a === "a" && contact.b === "b" && contact.intensity > 0 && contact.intensity <= 1,
    );
  });
});

test("persistent overlap emits once, and render cadence does not change physics", () => {
  const state = pair();
  const b = state.bodies[2];
  assert(b);
  state.bodies[2] = { ...b, phaseRadians: 0.05, speedRatio: { numerator: 1, denominator: 1 } };
  assert(
    createSimulation(state)
      .advance(10)
      .flatMap((frame) => frame.contacts).length === 1,
  );
  const one = createSimulation(pair())
    .advance(5)
    .flatMap((frame) => frame.contacts);
  const split = createSimulation(pair());
  const many = Array.from({ length: 300 }, () => split.advance(1 / 60))
    .flat(2)
    .flatMap((frame) => frame.contacts);
  assert(JSON.stringify(one) === JSON.stringify(many));
});

test("hot swap preserves time and phase, while explicit phase edits rotate by their delta", () => {
  let state = pair();
  const simulation = createSimulation(state);
  const frames = simulation.advance(0.7);
  const time = frames.at(-1)?.time;
  assert(time !== undefined);
  const before = simulation.positionsAt(time)[1];
  assert(before);
  state = setRatio(state, "a", { numerator: 3, denominator: 1 });
  simulation.setState(state);
  const after = simulation.positionsAt(time)[1];
  assert(after);
  close(before.x, after.x);
  close(before.y, after.y);
  const future = simulation.positionsAt(time + 0.1)[1];
  assert(future);
  close(
    Math.atan2(future.y, future.x) - Math.atan2(after.y, after.x),
    0.1 * 2 * Math.PI * 0.25 * 3,
  );
  state = setPhase(state, "a", Math.PI / 2);
  simulation.setState(state);
  const edited = simulation.positionsAt(time)[1];
  assert(edited);
  close(edited.x, -after.y);
  close(edited.y, after.x);
  assert((simulation.advance(0.1).at(-1)?.time ?? 0) > time);
});

test("drift is deterministic, periodic, and integrates speed continuously", () => {
  for (const mode of ["sine", "stair"] as const) {
    let state = pair();
    state = setDrift(state, "a", { mode, target: "speed", amplitude: 0.5, periodSeconds: 4 });
    const simulation = createSimulation(state);
    const start = simulation.positionsAt(0)[1];
    const end = simulation.positionsAt(4)[1];
    assert(start && end);
    close(start.x, end.x);
    close(start.y, end.y);
    const before = simulation.positionsAt(2 - 1e-7)[1];
    const after = simulation.positionsAt(2 + 1e-7)[1];
    assert(before && after);
    assert(Math.hypot(after.x - before.x, after.y - before.y) < 1e-5);
    state = setDrift(state, "a", { mode, target: "orbitRadius", amplitude: 0.2, periodSeconds: 4 });
    const radial = createSimulation(state);
    const radii = Array.from({ length: 80 }, (_, i) => {
      const position = radial.positionsAt(i / 20)[1];
      assert(position);
      return Math.round(Math.hypot(position.x, position.y) * 1e8) / 1e8;
    });
    assert(radii.every((radius) => radius >= 0.8 && radius <= 1.2));
    if (mode === "stair") assert(new Set(radii).size === 8);
  }
});
