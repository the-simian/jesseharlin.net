import { test } from "bun:test";
import {
  addBody,
  clearSelection,
  removeBody,
  selectBody,
  setActiveView,
  setDrift,
  setOffset,
  setOrbitRadius,
  setPatch,
  setPhase,
  setRatio,
  setSoundEnabled,
} from "./commands";
import { decayCurve } from "./decay";
import { defaultPatchOf, patchOf, placeOf } from "./patches";
import { midiToHz, pitchClass, snapToScale, soundingPitch } from "./pitch";
import { createEmptyState } from "./presets";
import { createSimulation, shadeAt, spreadAt } from "./simulation";
import { depthOf } from "./tree";
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
    eccentricity: 0,
    periapsisRadians: 0,
    phaseRadians: 0,
    speedRatio: { numerator: 1, denominator: 1 },
    pitchOffsetSemitones: 0,
    exchangesPitch: false,
    strikesParent: false,
    drift: { mode: "still" },
    ...patch,
  };
}
function pair(): InstrumentState {
  const state = createEmptyState();
  return {
    ...state,
    bodies: [
      ...state.bodies,
      child("a"),
      child("b", {
        eccentricity: 0,
        periapsisRadians: 0,
        phaseRadians: Math.PI,
        speedRatio: { numerator: 2, denominator: 1 },
      }),
    ],
  };
}

test("empty state is a lone silent sun ready for an arrangement", () => {
  const state = createEmptyState();
  assert(validateState(state).ok);
  assert(state.bodies.length === 1 && state.bodies[0]?.parentId === null);
  assert(state.baseTurnsPerSecond > 0 && state.maxVoices > 0);
  assert(!state.soundEnabled && state.activeView === null);
  assert(
    createSimulation(state)
      .advance(1)
      .every((frame) => frame.contacts.length === 0),
  );
});

test("validation rejects malformed trees, limits, and geometry", () => {
  const initial = createEmptyState();
  const sun = initial.bodies[0];
  assert(sun);
  const invalid: InstrumentState[] = [
    { ...initial, bodies: [] },
    { ...initial, bodies: [sun, { ...sun, id: "second" }] },
    { ...initial, bodies: [sun, child("a", { parentId: "missing" })] },
    { ...initial, bodies: [sun, child("a", { parentId: "b" }), child("b", { parentId: "a" })] },
    {
      ...initial,
      bodies: [
        sun,
        child("a"),
        child("b", { parentId: "a" }),
        child("c", { parentId: "b" }),
        child("d", { parentId: "c" }),
      ],
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
      { pitchOffsetSemitones: 6 },
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

test("commands are immutable, validate edits, share rings among siblings, and remove descendants", () => {
  const initial = createEmptyState();
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
  // Siblings share a ring at different speeds so they meet; phases are spread.
  assert(
    b.orbitRadius === a.orbitRadius &&
      b.phaseRadians !== a.phaseRadians &&
      (b.speedRatio.numerator !== a.speedRatio.numerator ||
        b.speedRatio.denominator !== a.speedRatio.denominator),
  );
  const nested = addBody(second, a.id);
  const moon = nested.bodies[3];
  assert(moon);
  const deep = addBody(nested, moon.id);
  const leaf = deep.bodies[4];
  assert(leaf && deep !== nested);
  assert(addBody(deep, leaf.id) === deep);
  assert(createSimulation(deep).positionsAt(1).length === 5);
  close(soundingPitch(setOffset(deep, leaf.id, 7), leaf.id, "pool"), deep.anchorMidi - 7);
  assert(removeBody(nested, "sun") === nested);
  const selected = selectBody(nested, moon.id);
  const removed = removeBody(selected, a.id);
  assert(removed.bodies.length === 2 && removed.selectedBodyIds.length === 0);
  assert(clearSelection(selected).selectedBodyIds.length === 0);
  assert(selectBody(second, "missing") === second);
  assert(setRatio(second, a.id, { numerator: 7, denominator: 1 }) === second);
  assert(setOffset(second, a.id, 6) === second);
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

test("pitch includes the sun and every ancestor, mirrored around the anchor in the pool", () => {
  let state = addBody(addBody(createEmptyState(), "sun"), "body-1");
  state = setOffset(setOffset(setOffset(state, "sun", -4), "body-1", 7), "body-2", 5);
  close(soundingPitch(state, "sun", "telescope"), state.anchorMidi - 4);
  close(soundingPitch(state, "body-2", "telescope"), state.anchorMidi + 8);
  close(soundingPitch(state, "body-2", "pool"), state.anchorMidi - 8);
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

test("overlapping discs on different rings or under different parents never excite", () => {
  const state = pair();
  const a = state.bodies[1];
  const b = state.bodies[2];
  assert(a && b);
  state.bodies[2] = { ...b, orbitRadius: 1.01 };
  assert(
    createSimulation(state)
      .advance(5)
      .every((frame) => frame.contacts.length === 0),
  );
  state.bodies.push(child("carrier", { orbitRadius: 2, discRadius: 0.1 }));
  state.bodies[2] = { ...b, parentId: "carrier" };
  assert(
    createSimulation(state)
      .advance(5)
      .every((frame) => frame.contacts.length === 0),
  );
});

test("Kepler ellipses preserve periods, rotate about a focus, and reject unsafe periapsis", () => {
  const state = pair();
  state.bodies = state.bodies.map((body) =>
    body.parentId === null
      ? body
      : { ...body, orbitRadius: 2, eccentricity: 0.7, periapsisRadians: Math.PI / 2 },
  );
  const simulation = createSimulation(state);
  const peri = simulation.positionsAt(0)[1];
  const apo = simulation.positionsAt(2)[1];
  const end = simulation.positionsAt(4)[1];
  assert(peri && apo && end);
  close(peri.x, 0);
  close(peri.y, 0.6);
  close(apo.y, -3.4);
  close(end.y, peri.y);
  const near = simulation.positionsAt(0.001)[1];
  const far = simulation.positionsAt(2.001)[1];
  assert(near && far);
  assert(Math.hypot(near.x - peri.x, near.y - peri.y) > Math.hypot(far.x - apo.x, far.y - apo.y));
  for (const patch of [
    { eccentricity: -0.1 },
    { eccentricity: 0.91 },
    { periapsisRadians: NaN },
    { orbitRadius: 1 },
  ])
    assert(
      !validateState({
        ...state,
        bodies: state.bodies.map((body) => (body.id === "a" ? { ...body, ...patch } : body)),
      }).ok,
    );
  const separate = {
    ...state,
    bodies: state.bodies.map((body) => (body.id === "b" ? { ...body, eccentricity: 0.6 } : body)),
  };
  assert(
    createSimulation(separate)
      .advance(4)
      .every((frame) => frame.contacts.length === 0),
  );
  assert(simulation.advance(4).some((frame) => frame.contacts.length > 0));
});

test("sun shade uses the finite segment, excludes the contacting discs, and softens edges", () => {
  const state = pair();
  state.bodies.push(child("occluder", { discRadius: 0.5 }));
  const positions = [
    { id: "sun", x: 0, y: 0 },
    { id: "a", x: 4, y: 0.1 },
    { id: "b", x: 4, y: -0.1 },
  ];
  const shade = (x: number, y: number) =>
    shadeAt(state, [...positions, { id: "occluder", x, y }], "a", "b");
  close(shade(2, 0), 1);
  close(shade(2, 0.5), 0);
  assert(shade(2, 0.3) > 0 && shade(2, 0.3) < 1);
  close(shade(5, 0), 0);
  close(shade(-1, 0), 0);
  close(shadeAt(state, positions, "a", "b"), 0);
  for (const contact of createSimulation(state)
    .advance(5)
    .flatMap((frame) => frame.contacts)) {
    assert(contact.shade >= 0 && contact.shade <= 1);
    assert(contact.weight > 0 && contact.weight <= 1 && contact.closing >= 0);
  }
});

test("contact exchange conserves scale offsets, preserves state, and honors opt-outs", () => {
  const state = pair();
  state.bodies = state.bodies.map((body) => ({
    ...body,
    exchangesPitch: body.parentId !== null,
    strikesParent: false,
    pitchOffsetSemitones: body.id === "b" ? 7 : 0,
  }));
  const authored = JSON.stringify(state);
  const simulation = createSimulation(state);
  const frame = simulation.advance(2).find((frame) => frame.contacts.length > 0);
  assert(frame && frame.pitchOffsets.a === 7 && frame.pitchOffsets.b === 0);
  assert(JSON.stringify(state) === authored);
  simulation.setState({ ...state, activeView: "pool" });
  assert(simulation.advance(0.01).at(-1)?.pitchOffsets.a === 7);
  for (const offset of Object.values(frame.pitchOffsets))
    assert(state.scale.includes(pitchClass(offset)));
  const fixed = createSimulation({
    ...state,
    bodies: state.bodies.map((body) => ({ ...body, exchangesPitch: false })),
  });
  assert(fixed.advance(2).at(-1)?.pitchOffsets.a === 0);
});

test("retrograde sweeps catch head-on entries with invariant time partitioning", () => {
  const state = pair();
  state.bodies = state.bodies.map((body) =>
    body.id === "b" ? { ...body, speedRatio: { numerator: -4, denominator: 1 } } : body,
  );
  assert(validateState(state).ok);
  const whole = createSimulation(state)
    .advance(4)
    .flatMap((frame) => frame.contacts);
  const simulation = createSimulation(state);
  const split = Array.from({ length: 40 }, () => simulation.advance(0.1))
    .flat(2)
    .flatMap((frame) => frame.contacts);
  assert(whole.length === 5 && JSON.stringify(whole) === JSON.stringify(split));
  assert(whole.every((contact) => contact.closing > 0));
});

test("comet steps advance once per parent contact entry", () => {
  const state = createEmptyState();
  state.bodies.push(
    child("comet", {
      orbitRadius: 1,
      eccentricity: 0.7,
      phaseRadians: Math.PI,
      strikesParent: true,
      strikeSteps: [7, 3, 0],
    }),
  );
  assert(validateState(state).ok);
  const struck = createSimulation(state)
    .advance(9)
    .filter((frame) => frame.contacts.length);
  assert(struck.length === 2);
  assert(struck[0]?.pitchOffsets.sun === 7 && struck[1]?.pitchOffsets.sun === 3);
  assert(
    struck.every((frame) =>
      frame.contacts.every((contact) => contact.weight === 1 && contact.intensity === 1),
    ),
  );
  assert(state.bodies[0]?.pitchOffsetSemitones === 0);
});

test("stacked offsets snap to the nearest scale degree across octaves, with ties downward", () => {
  const scale = [0, 3, 7];
  for (const octave of [-24, -12, 0, 12, 24]) {
    close(snapToScale(scale, octave + 5), octave + 3);
    close(snapToScale(scale, octave + 11), octave + 12);
    for (const degree of scale) close(snapToScale(scale, octave + degree), octave + degree);
  }
});

function struckParent() {
  const state = createEmptyState();
  state.bodies.push(child("carrier", { orbitRadius: 3, discRadius: 0.35 }));
  state.bodies.push(
    child("comet", {
      parentId: "carrier",
      orbitRadius: 1,
      eccentricity: 0.7,
      phaseRadians: Math.PI,
      strikesParent: true,
      strikeSteps: [7, 3, 0],
    }),
  );
  const simulation = createSimulation(state);
  assert(simulation.advance(3).at(-1)?.pitchOffsets.carrier === 7);
  return { state, simulation };
}

test("explicit parent pitch and drift edits clear comet roots, while unrelated edits preserve them", () => {
  for (const edit of [
    (state: InstrumentState) => setOffset(state, "carrier", 0),
    (state: InstrumentState) => setOffset(state, "carrier", 3),
    (state: InstrumentState) => setDrift(state, "carrier", { mode: "still" }),
  ]) {
    const { state, simulation } = struckParent();
    simulation.setState(selectBody(state, "carrier"));
    assert(simulation.advance(0.01).at(-1)?.pitchOffsets.carrier === 7);
    const next = edit(state);
    simulation.setState(next);
    assert(
      simulation.advance(0.01).at(-1)?.pitchOffsets.carrier ===
        next.bodies.find((body) => body.id === "carrier")?.pitchOffsetSemitones,
    );
  }
});

test("removed parents cannot recover stale comet roots when their ids are reused", () => {
  const { state, simulation } = struckParent();
  simulation.setState(removeBody(state, "carrier"));
  simulation.setState(state);
  assert(simulation.advance(0.01).at(-1)?.pitchOffsets.carrier === 0);
});

test("ancestry depth counts parent edges from the sun through nested moons", () => {
  let state = createEmptyState();
  for (const parent of ["sun", "body-1", "body-2"]) state = addBody(state, parent);
  const byId = new Map(state.bodies.map((body) => [body.id, body]));
  for (const [depth, body] of state.bodies.entries()) assert(depthOf(body, byId) === depth);
  assert(state.bodies.length === LIMITS.maxDepth + 1);
});

test("contact pair keys preserve arbitrary ids and stay stable when bodies are reordered", () => {
  const state = createEmptyState();
  for (const id of ["a:b", "c", "a", "b:c"]) state.bodies.push(child(id));
  const simulation = createSimulation(state);
  assert(simulation.advance(0.01).flatMap((frame) => frame.contacts).length === 6);
  simulation.setState({ ...state, bodies: [...state.bodies].reverse() });
  assert(simulation.advance(0.01).every((frame) => frame.contacts.length === 0));
});

test("the bare decay curve preserves gong, carrier, and ornament roles across anchors", () => {
  for (const anchor of [36, 50, 72]) {
    const gong = decayCurve(anchor - 12, 0.2, 1, 0.4, anchor);
    const carrier = decayCurve(anchor, 0.5, 0.2, 1, anchor);
    const ornament = decayCurve(anchor + 24, 1, 0.1, 4, anchor);
    assert(gong > carrier && carrier > ornament && ornament > 0);
    for (const offset of [-12, 0, 12, 24]) {
      const midi = anchor + offset;
      close(decayCurve(midi, 0.5, 0.5, 1, anchor), decayCurve(50 + offset, 0.5, 0.5, 1, 50));
      assert(decayCurve(midi, 0.5, 1, 1, anchor) >= decayCurve(midi, 0.5, 0, 1, anchor));
      assert(decayCurve(midi, 0.5, 1, 0, anchor) >= decayCurve(midi, 0.5, 1, 5, anchor));
    }
  }
});

test("spread runs from drawn in at periapsis to flung out at apoapsis and ignores comets", () => {
  const state = createEmptyState();
  const sun = state.bodies[0];
  assert(sun);
  const planet = {
    ...sun,
    id: "planet",
    parentId: sun.id,
    orbitRadius: 6,
    eccentricity: 0.5,
    periapsisRadians: 0,
    phaseRadians: 0,
    strikesParent: false,
  };
  const comet = { ...planet, id: "comet", orbitRadius: 30, eccentricity: 0.9, strikesParent: true };
  const arranged = { ...state, bodies: [sun, planet, comet] };
  const near = spreadAt(arranged, [
    { id: sun.id, x: 0, y: 0 },
    { id: "planet", x: 3, y: 0 },
    { id: "comet", x: 57, y: 0 },
  ]);
  const far = spreadAt(arranged, [
    { id: sun.id, x: 0, y: 0 },
    { id: "planet", x: -9, y: 0 },
    { id: "comet", x: 3, y: 0 },
  ]);
  assert(Math.abs(near) < 1e-9 && Math.abs(far - 1) < 1e-9, `${near} ${far}`);
  assert(spreadAt(state, [{ id: sun.id, x: 0, y: 0 }]) === 0.5, "A lone sun sits at the middle.");
});

test("moons take their patches in turn, a body may be cast within its role, and places count", () => {
  let next = addBody(createEmptyState(), "sun");
  const planet = next.bodies.at(-1);
  assert(planet !== undefined);
  for (let i = 0; i < 5; i++) next = addBody(next, planet.id);
  const moons = next.bodies.filter((body) => body.parentId === planet.id);
  assert(
    moons.map((moon) => patchOf(moon, next.bodies)).join() === "deep,chime,string,vox,deep",
    "Moons round one parent take deep space, chime, string, and voice in turn.",
  );
  assert(patchOf(planet, next.bodies) === "harp" && defaultPatchOf(planet, next.bodies) === "harp");
  assert(placeOf(planet, next.bodies) === "planet 1");
  assert(placeOf(moons[2] as Body, next.bodies) === "moon 3");
  const cast = setPatch(next, moons[0]?.id ?? "", "bell");
  assert(
    patchOf(cast.bodies.find((body) => body.id === moons[0]?.id) as Body, cast.bodies) === "bell",
  );
  // A patch outside the role is refused whole.
  const refused = setPatch(next, planet.id, "vox");
  assert(refused === next, "A planet cannot be cast to a moon's patch.");
});
