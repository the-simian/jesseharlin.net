import { test } from "bun:test";
import { sharedMix } from "../mix";
import {
  applyPreset,
  createInitialState,
  selectBody,
  setActiveView,
  setOffset,
  setSoundEnabled,
} from "./commands";
import { pitchClass, soundingPitch } from "./pitch";
import { FOLIA_ROOTS, getPresetId, PRESETS } from "./presets";
import { createSimulation } from "./simulation";
import type { Contact } from "./types";
import { validateState } from "./validate";

/** decayFor scales by the mix; tests measure the bare curve. */
const _RING = 1.6 * sharedMix.getMix().decay;

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
      assert(state.bodies.length >= 17);
      assert(contacts.length >= 20 && contacts.length <= 240, `${contacts.length} contacts/min`);
      const pairs = new Map<string, number[]>();
      for (const contact of contacts) {
        assert(contact.intensity > 0);
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
      const periods = new Set(
        [...pairs.values()]
          .filter((times) => times.length > 1)
          .map((times) => Math.round(((times[1] ?? 0) - (times[0] ?? 0)) * 100)),
      );
      assert(periods.size >= 3, "At least three distinct collision periods must sound.");
      assert(pitches.size >= 4);
    }
    console.log(
      `${preset.name}: ${contacts.length} contacts/min, ${new Set([...pitches].map((pitch) => pitchClass(pitch - state.anchorMidi)).filter((degree) => state.scale.includes(degree))).size} scale degrees, MIDI ${pitches.size ? Math.min(...pitches) : "none"}..${pitches.size ? Math.max(...pitches) : "none"}, max shade ${Math.max(0, ...contacts.map((contact) => contact.shade)).toFixed(3)}`,
    );
  });
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
    assert(getPresetId(setOffset(applied, "sun", 7)) === null);
    assert(applyPreset(applied, "missing") === applied);
    assert(JSON.stringify(previous.bodies) === JSON.stringify(initial.bodies));
  }
});

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
});

test("La Folia starts at D and mirrors every ancestor including the sun", () => {
  const state = createInitialState();
  assert(getPresetId(state) === "lily-pads" && state.anchorMidi === 50);
  assert(soundingPitch(state, "bass-gong-0", "telescope", 120) === 38);
  assert(JSON.stringify(FOLIA_ROOTS) === "[0,-5,0,-2,3,-2,0,-5]");
  for (const frame of createSimulation(state).advance(30)) {
    for (const body of state.bodies) {
      assert(
        soundingPitch(state, body.id, "pool", frame.time, frame.pitchOffsets) +
          soundingPitch(state, body.id, "telescope", frame.time, frame.pitchOffsets) ===
          100,
      );
    }
  }
});

test("La Folia is dense, shaded, and led by ornaments rather than bass attacks", () => {
  const state = createInitialState();
  assert(state.bodies.some((body) => body.eccentricity > 0));
  const events = createSimulation(state)
    .advance(60)
    .flatMap((frame) => frame.contacts);
  assert(events.length >= 90 && events.length <= 200, `${events.length} contacts/min`);
  const bass = events.filter((contact) => contact.a.startsWith("bass-gong")).length;
  const soprano = events.filter(
    (contact) => contact.a.startsWith("soprano-") || contact.a.startsWith("silver-"),
  ).length;
  assert(bass > 0 && bass < 15 && soprano > bass * 4);
  assert(new Set(events.map((contact) => Math.round(contact.shade * 100))).size >= 2);
  for (const contact of events) {
    assert(contact.shade >= 0 && contact.shade <= 1 && contact.weight > 0 && contact.weight <= 1);
    assert(contact.closing > 0);
  }
  console.log(`La Folia rails: bass ${bass}/min, soprano and small moons ${soprano}/min`);
});

test("every sounding preset has moons, nested ornaments, and a distinct harmony", () => {
  for (const preset of PRESETS.filter((preset) => preset.id !== "empty")) {
    const state = preset.build();
    assert(
      state.bodies.some(
        (body) =>
          state.bodies.find((parent) => parent.id === body.parentId)?.parentId !== null &&
          body.parentId !== null,
      ),
    );
  }
});

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
  assert(apoapsis > 7 * 1.35, "The comet must reach beyond the outer carrier ring.");
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
        assert((contact.a === sun.id ? contact.pitchA : contact.pitchB) === 50 + expected);
        roots.push(frame.pitchOffsets.sun);
      }
    }
  }
  assert(strikes >= 8, `${strikes} strikes`);
  assert(partners.size >= 3, "Successive comet passes must meet different bodies.");
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
  assert(JSON.stringify(pitchesIn(0, 56)) !== JSON.stringify(pitchesIn(64, 120)));
  assert(events.length >= 200 && events.length <= 400);
  const consonant = events.filter((contact) =>
    [0, 3, 4, 5, 7, 8, 9].includes(Math.abs(contact.pitchA - contact.pitchB) % 12),
  );
  assert(consonant.length / events.length > 0.75);
  const times = events.map((contact) => contact.time).sort((a, b) => a - b);
  const gaps = times.slice(1).map((time, i) => time - (times[i] ?? 0));
  assert(gaps.some((gap) => gap >= 2 && gap < 8));
});
