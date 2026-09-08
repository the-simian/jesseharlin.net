import { test } from "bun:test";
import {
  applyPreset,
  createInitialState,
  selectBody,
  setActiveView,
  setOffset,
  setSoundEnabled,
} from "./commands";
import { pitchClass, soundingPitch } from "./pitch";
import { arrangementChanged, getPresetId, PRESETS } from "./presets";
import { createSimulation } from "./simulation";
import type { Contact } from "./types";
import { validateState } from "./validate";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

for (const preset of PRESETS) {
  test(`${preset.name}: one minute of measured music`, () => {
    const state = preset.build();
    assert(validateState(state).ok);
    const simulation = createSimulation(state);
    const contacts: Contact[] = [];
    for (let second = 0; second < 60; second++) {
      contacts.push(...simulation.advance(1).flatMap((frame) => frame.contacts));
    }
    const pitches = new Set(
      contacts
        .filter((contact) => contact.intensity > 0)
        .flatMap((contact) => [contact.pitchA, contact.pitchB]),
    );
    if (preset.id === "empty") {
      assert(state.bodies.length === 1 && contacts.length === 0 && pitches.size === 0);
    } else {
      assert(state.bodies.some((body) => body.exchangesPitch));
      assert(contacts.length >= 20 && contacts.length <= 400, `${contacts.length} contacts/min`);
      const pairs = new Map<string, number[]>();
      for (const contact of contacts) {
        assert(contact.intensity > 0);
        assert(state.scale.includes(pitchClass(contact.pitchA - state.anchorMidi)));
        assert(state.scale.includes(pitchClass(contact.pitchB - state.anchorMidi)));
        const a = state.bodies.find((body) => body.id === contact.a);
        const b = state.bodies.find((body) => body.id === contact.b);
        assert(
          a &&
            b &&
            ((a.parentId === b.parentId &&
              a.orbitRadius === b.orbitRadius &&
              a.eccentricity === b.eccentricity) ||
              a.strikesParent ||
              b.strikesParent),
        );
        const key = [contact.a, contact.b].sort().join(":");
        const times = pairs.get(key) ?? [];
        times.push(contact.time);
        pairs.set(key, times);
      }
      assert(pairs.size > 1);
      assert(pitches.size > 1);
    }
    console.log(
      `${preset.name}: ${contacts.length} contacts/min, ${new Set([...pitches].map((pitch) => pitchClass(pitch - state.anchorMidi)).filter((degree) => state.scale.includes(degree))).size} scale degrees, MIDI ${pitches.size ? Math.min(...pitches) : "none"}..${pitches.size ? Math.max(...pitches) : "none"}, max shade ${Math.max(0, ...contacts.map((contact) => contact.shade)).toFixed(3)}`,
    );
  }, 30000);
}

test("presets build independently, preserve listening context, and derive identity after edits", () => {
  assert(
    PRESETS.length >= 2 && new Set(PRESETS.map((preset) => preset.id)).size === PRESETS.length,
  );
  const initial = createInitialState();
  assert(
    getPresetId(initial) === PRESETS[0]?.id && !initial.soundEnabled && initial.activeView === null,
  );
  for (const preset of PRESETS) {
    const first = preset.build();
    const snapshot = JSON.stringify(first);
    const second = preset.build();
    const sun = second.bodies[0];
    assert(sun);
    sun.speedRatio.numerator = 5;
    sun.pitchOffsetSemitones = 7;
    assert(JSON.stringify(first) === snapshot);
    const previous = selectBody(setActiveView(setSoundEnabled(initial, true), "pool"), "sun");
    const applied = applyPreset(previous, preset.id);
    assert(
      applied.soundEnabled && applied.activeView === "pool" && applied.selectedBodyIds.length === 0,
    );
    assert(getPresetId(applied) === preset.id);
    assert(applied.arrangement === previous.arrangement + 1);
    assert(arrangementChanged(previous, applied));
    assert(!arrangementChanged(applied, setOffset(applied, "sun", 7)));
    assert(getPresetId(setOffset(applied, "sun", 7)) === null);
    assert(applyPreset(applied, "missing") === applied);
    assert(JSON.stringify(previous.bodies) === JSON.stringify(initial.bodies));
  }
}, 30000);

test("reloading an ensemble restores its phases and score at the current simulation time", () => {
  const state = createInitialState();
  const simulation = createSimulation(state);
  const time = simulation.advance(51.75).at(-1)?.time;
  assert(time !== undefined);
  const next = applyPreset(state, PRESETS[0]?.id ?? "missing");
  simulation.setState(next);
  const fresh = createSimulation(next);
  const positions = simulation.positionsAt(time);
  fresh.positionsAt(0).forEach((position, i) => {
    const actual = positions[i];
    assert(actual && Math.hypot(actual.x - position.x, actual.y - position.y) < 1e-8);
  });
  const restarted = simulation.advance(8.5).flatMap((frame) => frame.contacts);
  const expected = fresh.advance(8.5).flatMap((frame) => frame.contacts);
  assert(restarted.length === expected.length);
  expected.forEach((contact, i) => {
    const actual = restarted[i];
    assert(actual && actual.a === contact.a && actual.b === contact.b);
    assert(actual.pitchA === contact.pitchA && actual.pitchB === contact.pitchB);
    assert(Math.abs(actual.time - time - contact.time) < 1e-7);
  });
}, 30000);

test("La Folia mirrors every ancestor, including the sun, around its anchor", () => {
  const state = createInitialState();
  assert(soundingPitch(state, "bass-gong-0", "telescope") < state.anchorMidi);
  for (const frame of createSimulation(state).advance(30)) {
    for (const body of state.bodies) {
      assert(
        soundingPitch(state, body.id, "pool", frame.time, frame.pitchOffsets) +
          soundingPitch(state, body.id, "telescope", frame.time, frame.pitchOffsets) ===
          2 * state.anchorMidi,
      );
    }
  }
}, 30000);

test("La Folia sounds bass and ornament roles with changing shade", () => {
  const state = createInitialState();
  assert(state.bodies.some((body) => body.eccentricity > 0));
  const events = createSimulation(state)
    .advance(60)
    .flatMap((frame) => frame.contacts);
  assert(events.length >= 20 && events.length <= 400, `${events.length} contacts/min`);
  const bass = events.filter((contact) => contact.a.startsWith("bass-gong")).length;
  const soprano = events.filter(
    (contact) => contact.a.startsWith("soprano-") || contact.a.startsWith("silver-"),
  ).length;
  assert(bass > 0 && soprano > 0);
  assert(new Set(events.map((contact) => Math.round(contact.shade * 100))).size >= 2);
  for (const contact of events) {
    assert(contact.shade >= 0 && contact.shade <= 1 && contact.weight > 0 && contact.weight <= 1);
    assert(contact.closing > 0);
  }
  console.log(`La Folia rails: bass ${bass}/min, soprano and small moons ${soprano}/min`);
}, 30000);

test("every sounding preset has fixed carriers, exchanging moons, and nested ornaments", () => {
  for (const preset of PRESETS.filter((preset) => preset.id !== "empty")) {
    const state = preset.build();
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    assert(
      state.bodies.some(
        (body) => body.parentId !== null && !body.exchangesPitch && !body.strikesParent,
      ),
    );
    assert(state.bodies.some((body) => body.exchangesPitch));
    assert(
      state.bodies.some((body) => {
        const parent = body.parentId === null ? undefined : byId.get(body.parentId);
        return parent && parent.parentId !== null;
      }),
    );
  }
}, 30000);

test("the comet walks the Folia roots in order and meets bodies on the way", () => {
  // Two hundred simulated seconds at 240 Hz take a while.

  const state = createInitialState();
  const simulation = createSimulation(state);
  const comet = state.bodies.find((body) => body.id === "comet");
  const sun = state.bodies.find((body) => body.id === "sun");
  assert(comet && sun && comet.strikesParent && !comet.exchangesPitch && comet.strikeSteps);
  assert(state.bodies.some((body) => body.parentId === comet.id));
  const periapsis = comet.orbitRadius * (1 - comet.eccentricity);
  const apoapsis = comet.orbitRadius * (1 + comet.eccentricity);
  assert(periapsis < sun.discRadius + comet.discRadius);
  const carriers = state.bodies.filter((body) => body.parentId === sun.id && !body.strikesParent);
  assert(
    apoapsis > Math.max(...carriers.map((body) => body.orbitRadius * (1 + body.eccentricity))),
    "The comet must reach beyond the outer carrier ring.",
  );
  let strikes = 0;
  const roots: number[] = [];
  const partners = new Set<string>();
  for (let second = 0; second < 200; second++) {
    for (const frame of simulation.advance(1)) {
      for (const contact of frame.contacts) {
        if (contact.a === comet.id || contact.b === comet.id)
          partners.add(contact.a === comet.id ? contact.b : contact.a);
        if (![contact.a, contact.b].includes(sun.id) || ![contact.a, contact.b].includes(comet.id))
          continue;
        const expected = comet.strikeSteps[strikes % comet.strikeSteps.length];
        strikes++;
        assert(expected !== undefined && frame.pitchOffsets.sun === expected);
        assert(
          (contact.a === sun.id ? contact.pitchA : contact.pitchB) === state.anchorMidi + expected,
        );
        roots.push(frame.pitchOffsets.sun);
      }
    }
  }
  assert(strikes >= comet.strikeSteps.length, `${strikes} strikes`);
  assert(partners.size > 1, "Successive comet passes must meet different bodies.");
  console.log(
    `Folia sun offsets: ${roots.join(", ")}; comet partners: ${[...partners].join(", ")}`,
  );
}, 30000);

test("Folia exchanges scale notes within 120 seconds and changes the second minute's score", () => {
  const state = createInitialState();
  const authored = JSON.stringify(state);
  const simulation = createSimulation(state);
  const events: Contact[] = [];
  let exchanged = false;
  let live = Object.fromEntries(state.bodies.map((body) => [body.id, body.pitchOffsetSemitones]));
  for (let second = 0; second < 120; second++) {
    for (const frame of simulation.advance(1)) {
      events.push(...frame.contacts);
      for (const contact of frame.contacts) {
        const a = state.bodies.find((body) => body.id === contact.a);
        const b = state.bodies.find((body) => body.id === contact.b);
        if (
          a?.exchangesPitch &&
          b?.exchangesPitch &&
          live[a.id] !== live[b.id] &&
          frame.pitchOffsets[a.id] === live[b.id] &&
          frame.pitchOffsets[b.id] === live[a.id]
        )
          exchanged = true;
      }
      for (const parent of ["tenor", "soprano", "soprano-0"]) {
        const bodies = state.bodies.filter((body) => body.parentId === parent);
        const expected = bodies.map((body) => body.pitchOffsetSemitones).sort((a, b) => a - b);
        const actual = bodies
          .map((body) => frame.pitchOffsets[body.id])
          .sort((a, b) => (a ?? 0) - (b ?? 0));
        assert(JSON.stringify(expected) === JSON.stringify(actual));
        assert(
          actual.every(
            (offset) => offset !== undefined && state.scale.includes(pitchClass(offset)),
          ),
        );
      }
      live = frame.pitchOffsets;
    }
  }
  const pitchesIn = (from: number, to: number) =>
    events
      .filter((contact) => contact.time >= from && contact.time < to)
      .map((contact) => [contact.pitchA, contact.pitchB]);
  assert(exchanged && JSON.stringify(state) === authored);
  assert(JSON.stringify(pitchesIn(0, 60)) !== JSON.stringify(pitchesIn(60, 120)));
  assert(events.length / 2 >= 20 && events.length / 2 <= 400);
  const pitches = events.flatMap((contact) => [contact.pitchA, contact.pitchB]);
  assert(pitches.every((pitch) => state.scale.includes(pitchClass(pitch - state.anchorMidi))));
  console.log(
    `Folia exchange score: ${events.length / 2} contacts/min, MIDI ${Math.min(...pitches)}..${Math.max(...pitches)}`,
  );
}, 30000);

for (const preset of PRESETS) {
  test(`${preset.name}: every comet completes its root cycle within 300 seconds`, () => {
    const state = preset.build();
    const comets = state.bodies.filter((body) => body.strikesParent);
    if (!comets.length) return;
    const counts = new Map<string, number>();
    for (const comet of comets) {
      const parent = state.bodies.find((body) => body.id === comet.parentId);
      assert(parent && comet.strikeSteps?.length);
      assert(
        comet.orbitRadius * (1 - comet.eccentricity) < parent.discRadius + comet.discRadius - 0.1,
      );
    }
    const simulation = createSimulation(state);
    for (let second = 0; second < 300; second++) {
      for (const frame of simulation.advance(1)) {
        for (const contact of frame.contacts) {
          const comet = comets.find(
            (body) =>
              (contact.a === body.id && contact.b === body.parentId) ||
              (contact.b === body.id && contact.a === body.parentId),
          );
          if (!comet) continue;
          const parent = state.bodies.find((body) => body.id === comet.parentId);
          const steps = comet.strikeSteps;
          assert(parent && steps);
          const index = counts.get(comet.id) ?? 0;
          assert(
            frame.pitchOffsets[parent.id] ===
              parent.pitchOffsetSemitones + (steps[index % steps.length] ?? 0),
          );
          counts.set(comet.id, index + 1);
        }
      }
      if (comets.every((comet) => (counts.get(comet.id) ?? 0) >= (comet.strikeSteps?.length ?? 0)))
        break;
    }
    for (const comet of comets)
      assert(
        (counts.get(comet.id) ?? 0) >= (comet.strikeSteps?.length ?? 0),
        `${preset.name}: ${comet.id} did not finish`,
      );
  }, 30000);
}

test("custom arrangement revisions restart engines without matching a preset fingerprint", () => {
  const state = createInitialState();
  const simulation = createSimulation(state);
  const time = simulation.advance(2).at(-1)?.time;
  assert(time !== undefined);
  const next = { ...state, arrangement: state.arrangement + 1, baseTurnsPerSecond: 0.06 };
  assert(getPresetId(next) === null && arrangementChanged(state, next));
  simulation.setState(next);
  const fresh = createSimulation(next);
  for (const [i, position] of fresh.positionsAt(0).entries()) {
    const actual = simulation.positionsAt(time)[i];
    assert(actual && Math.hypot(actual.x - position.x, actual.y - position.y) < 1e-8);
  }
});
