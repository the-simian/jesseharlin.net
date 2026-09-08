import { soundingPitch } from "./pitch";
import { arrangementChanged } from "./presets";
import type { Body, BodyPosition, Contact, InstrumentState, SimulationFrame } from "./types";
import { validateState } from "./validate";

const TAU = 2 * Math.PI;
// Length-prefix the first id so delimiters inside ids cannot collide.
const pairKey = (a: string, b: string): string =>
  a < b ? `${a.length}:${a}${b}` : `${b.length}:${b}${a}`;
export const FIXED_STEP_SECONDS = 1 / 240;
// Eight equally spaced amplitude levels. Integrate the actual staircase, not its sine source.
const stair = (angle: number) => Math.round((Math.sin(angle) + 1) * 3.5) / 3.5 - 1;
const edges = [0, TAU];
for (let k = 0; k < 7; k++) {
  const angle = Math.asin((k + 0.5) / 3.5 - 1);
  edges.push((angle + TAU) % TAU, Math.PI - angle);
}
edges.sort((a, b) => a - b);
function stairIntegral(angle: number): number {
  const remainder = ((angle % TAU) + TAU) % TAU;
  let sum = 0;
  for (let i = 1; i < edges.length; i++) {
    const start = edges[i - 1] ?? 0;
    const end = edges[i] ?? TAU;
    sum += Math.max(0, Math.min(remainder, end) - start) * stair((start + end) / 2);
  }
  return sum;
}
function angularTravel(body: Body, state: InstrumentState, time: number): number {
  const rate =
    (TAU * state.baseTurnsPerSecond * body.speedRatio.numerator) / body.speedRatio.denominator;
  const drift = body.drift;
  if (drift.mode === "still" || drift.target !== "speed") return rate * time;
  const frequency = TAU / drift.periodSeconds;
  const integral =
    drift.mode === "sine" ? 1 - Math.cos(frequency * time) : stairIntegral(frequency * time);
  return rate * (time + (drift.amplitude * integral) / frequency);
}
function radiusAt(body: Body, time: number): number {
  const drift = body.drift;
  if (drift.mode === "still" || drift.target !== "orbitRadius") return body.orbitRadius;
  const angle = (TAU * time) / drift.periodSeconds;
  return (
    body.orbitRadius + drift.amplitude * (drift.mode === "sine" ? Math.sin(angle) : stair(angle))
  );
}

/** Soft disc coverage of the finite segment from the sun to a contact midpoint. */
export function shadeAt(
  state: InstrumentState,
  positions: BodyPosition[],
  a: string,
  b: string,
): number {
  const first = positions.find((position) => position.id === a);
  const second = positions.find((position) => position.id === b);
  if (!first || !second) return 0;
  const x = (first.x + second.x) / 2;
  const y = (first.y + second.y) / 2;
  const lengthSquared = x * x + y * y;
  if (lengthSquared === 0) return 0;
  let light = 1;
  for (const body of state.bodies) {
    if (body.parentId === null || body.id === a || body.id === b) continue;
    const position = positions.find((position) => position.id === body.id);
    if (!position) continue;
    const t = Math.max(0, Math.min(1, (position.x * x + position.y * y) / lengthSquared));
    const distanceSquared = (position.x - t * x) ** 2 + (position.y - t * y) ** 2;
    const coverage = Math.sqrt(Math.max(0, 1 - distanceSquared / body.discRadius ** 2));
    light *= 1 - coverage;
  }
  return 1 - light;
}

/**
 * How spread out the ensemble is, 0 drawn in to 1 flung out: the mean, over the
 * orbiting bodies, of each one's distance from the sun measured between the
 * nearest and farthest it can ever be along its chain of orbits. Comets are left
 * out; they would swamp the mean. The audio reads this as a tilt: near, the sun
 * warms; far, the moons twinkle.
 */
export function spreadAt(state: InstrumentState, positions: BodyPosition[]): number {
  const byId = new Map(state.bodies.map((body) => [body.id, body]));
  let sum = 0;
  let count = 0;
  for (const body of state.bodies) {
    if (body.parentId === null) continue;
    let planet: Body = body;
    let moonReach = 0;
    let farthest = 0;
    let comet = false;
    let cursor: Body | undefined = body;
    while (cursor && cursor.parentId !== null) {
      if (cursor.strikesParent) comet = true;
      farthest += cursor.orbitRadius * (1 + cursor.eccentricity);
      planet = cursor;
      const parent = byId.get(cursor.parentId);
      if (parent && parent.parentId !== null)
        moonReach += cursor.orbitRadius * (1 + cursor.eccentricity);
      cursor = parent;
    }
    if (comet) continue;
    const nearest = Math.max(0, planet.orbitRadius * (1 - planet.eccentricity) - moonReach);
    const span = farthest - nearest;
    if (span <= 0) continue;
    const position = positions.find((candidate) => candidate.id === body.id);
    if (!position) continue;
    const distance = Math.hypot(position.x, position.y);
    sum += Math.max(0, Math.min(1, (distance - nearest) / span));
    count++;
  }
  return count === 0 ? 0.5 : sum / count;
}

export function createSimulation(initial: InstrumentState) {
  if (!validateState(initial).ok) throw new Error("Invalid initial arrangement.");
  let state = initial;
  let time = 0;
  let remainder = 0;
  let phases = new Map(state.bodies.map((body) => [body.id, body.phaseRadians]));
  let offsets = new Map(state.bodies.map((body) => [body.id, body.pitchOffsetSemitones]));
  let strikes = new Map<string, number>();
  /** A parent's root as set by the last comet to strike it; persists until edited or struck again. */
  let struckRoots = new Map<string, number>();
  function liveOffsets(): Record<string, number> {
    return Object.fromEntries(
      state.bodies.map((body) => [
        body.id,
        (offsets.get(body.id) ?? body.pitchOffsetSemitones) + (struckRoots.get(body.id) ?? 0),
      ]),
    );
  }

  let touching = new Set<string>();
  const angleAt = (body: Body, at: number) =>
    (phases.get(body.id) ?? body.phaseRadians) + angularTravel(body, state, at);
  function positionsAt(at: number): BodyPosition[] {
    if (!Number.isFinite(at)) throw new Error("Render time must be finite.");
    const cache = new Map<string, BodyPosition>();
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    function position(body: Body): BodyPosition {
      const existing = cache.get(body.id);
      if (existing) return existing;
      const parent = body.parentId === null ? undefined : byId.get(body.parentId);
      const origin = parent ? position(parent) : { x: 0, y: 0 };
      const mean = ((angleAt(body, at) % TAU) + TAU) % TAU;
      // Newton on Kepler's equation; the sine seed keeps high eccentricities converging.
      let eccentric = mean + body.eccentricity * Math.sin(mean);
      for (let iteration = 0; iteration < 14; iteration++)
        eccentric -=
          (eccentric - body.eccentricity * Math.sin(eccentric) - mean) /
          (1 - body.eccentricity * Math.cos(eccentric));
      const radius = parent ? radiusAt(body, at) : 0;
      const x = radius * (Math.cos(eccentric) - body.eccentricity);
      const y = radius * Math.sqrt(1 - body.eccentricity ** 2) * Math.sin(eccentric);
      const cos = Math.cos(body.periapsisRadians);
      const sin = Math.sin(body.periapsisRadians);
      const value = {
        id: body.id,
        x: origin.x + cos * x - sin * y,
        y: origin.y + sin * x + cos * y,
      };
      cache.set(body.id, value);
      return value;
    }
    return state.bodies.map(position);
  }
  function setState(next: InstrumentState) {
    if (!validateState(next).ok) return;
    const restart = arrangementChanged(state, next);
    const oldBodies = new Map(state.bodies.map((body) => [body.id, body]));
    const nextPhases = new Map<string, number>();
    for (const body of next.bodies) {
      const old = restart ? undefined : oldBodies.get(body.id);
      // An explicit phase edit rotates the current orbit by the edited delta.
      const angle = old
        ? angleAt(old, time) + body.phaseRadians - old.phaseRadians
        : body.phaseRadians;
      nextPhases.set(body.id, angle - angularTravel(body, next, time));
    }
    offsets = new Map(
      next.bodies.map((body) => {
        const old = oldBodies.get(body.id);
        return [
          body.id,
          !restart && old?.pitchOffsetSemitones === body.pitchOffsetSemitones
            ? (offsets.get(body.id) ?? body.pitchOffsetSemitones)
            : body.pitchOffsetSemitones,
        ];
      }),
    );
    strikes = new Map(
      next.bodies.map((body) => {
        const old = oldBodies.get(body.id);
        const same =
          !restart &&
          JSON.stringify(old?.drift) === JSON.stringify(body.drift) &&
          JSON.stringify(old?.strikeSteps) === JSON.stringify(body.strikeSteps);
        return [body.id, same ? (strikes.get(body.id) ?? 0) : 0];
      }),
    );
    if (restart) struckRoots = new Map();
    else
      struckRoots = new Map(
        [...struckRoots].filter(([id]) => {
          const old = oldBodies.get(id);
          const body = next.bodies.find((candidate) => candidate.id === id);
          return (
            old &&
            body &&
            old.pitchOffsetSemitones === body.pitchOffsetSemitones &&
            (old.pitchRevision ?? 0) === (body.pitchRevision ?? 0) &&
            JSON.stringify(old.drift) === JSON.stringify(body.drift)
          );
        }),
      );
    state = next;
    phases = nextPhases;
    const pairs = new Set<string>();
    for (const [i, a] of next.bodies.entries())
      for (const b of next.bodies.slice(i + 1)) pairs.add(pairKey(a.id, b.id));
    if (restart) {
      touching.clear();
    }
    touching = new Set([...touching].filter((key) => pairs.has(key)));
  }
  function substepLimit(): number {
    // Sum local speed bounds to conservatively include all ancestor motion.
    let speed = 0;
    let radius = Number.POSITIVE_INFINITY;
    for (const body of state.bodies) {
      radius = Math.min(radius, body.discRadius);
      if (body.parentId === null) continue;
      const drift = body.drift;
      const radial = drift.mode !== "still" && drift.target === "orbitRadius";
      const speedDrift = drift.mode !== "still" && drift.target === "speed";
      speed +=
        ((TAU * state.baseTurnsPerSecond * Math.abs(body.speedRatio.numerator)) /
          body.speedRatio.denominator) *
        (body.orbitRadius + (radial ? drift.amplitude : 0)) *
        (1 + (speedDrift ? drift.amplitude : 0)) *
        Math.sqrt((1 + body.eccentricity) / (1 - body.eccentricity));
      if (radial) speed += (TAU * drift.amplitude * (1 + body.eccentricity)) / drift.periodSeconds;
    }
    return Math.min(FIXED_STEP_SECONDS, speed > 0 ? radius / (2 * speed) : FIXED_STEP_SECONDS);
  }
  function detect(start: BodyPosition[], end: BodyPosition[], at: number, dt: number): Contact[] {
    const entries: Omit<Contact, "pitchA" | "pitchB">[] = [];
    for (let i = 0; i < state.bodies.length; i++) {
      for (let j = i + 1; j < state.bodies.length; j++) {
        const a = state.bodies[i];
        const b = state.bodies[j];
        const a0 = start[i];
        const b0 = start[j];
        const a1 = end[i];
        const b1 = end[j];
        if (!a || !b || !a0 || !b0 || !a1 || !b1) continue;
        // A ring shares parent, semi-major axis, and eccentricity. Rotated ovals
        // cross at different anomalies; Kepler speed makes their encounters uneven.
        // Nested motion draws spirographs, while rational mean rates stay periodic.
        const parentPair = a.parentId === b.id || b.parentId === a.id;
        const parentStrike =
          (a.parentId === b.id && a.strikesParent) || (b.parentId === a.id && b.strikesParent);
        const sameRing =
          a.parentId !== null &&
          a.parentId === b.parentId &&
          a.orbitRadius === b.orbitRadius &&
          a.eccentricity === b.eccentricity;
        if (parentPair ? !parentStrike : !sameRing && !a.strikesParent && !b.strikesParent)
          continue;
        const key = pairKey(a.id, b.id);
        const x = a0.x - b0.x;
        const y = a0.y - b0.y;
        const dx = a1.x - b1.x - x;
        const dy = a1.y - b1.y - y;
        const radius = a.discRadius + b.discRadius;
        const c = x * x + y * y - radius * radius;
        const aa = dx * dx + dy * dy;
        const bb = 2 * (x * dx + y * dy);
        const discriminant = bb * bb - 4 * aa * c;
        const entry =
          c < 0 ? 0 : aa > 0 && discriminant > 0 ? (-bb - Math.sqrt(discriminant)) / (2 * aa) : -1;
        if (c >= 0) touching.delete(key);
        // Sweeping also catches complete passages and the instantaneous jumps of radial stair drift.
        if (!touching.has(key) && entry >= 0 && entry < 1) {
          const nx = x + dx * entry;
          const ny = y + dy * entry;
          const closing = Math.max(0, -(nx * dx + ny * dy) / (Math.hypot(nx, ny) || radius) / dt);
          entries.push({
            time: at + entry * dt,
            a: a.id,
            b: b.id,
            intensity: parentStrike ? 1 : Math.min(1, closing / 4),
            closing,
            shade: shadeAt(state, positionsAt(at + entry * dt), a.id, b.id),
            weight: parentStrike
              ? 1
              : Math.min(
                  1,
                  (a.discRadius + b.discRadius) /
                    (2 *
                      Math.max(
                        ...state.bodies
                          .filter((body) => body.parentId !== null)
                          .map((body) => body.discRadius),
                      )),
                ),
          });
        }
        if ((x + dx) ** 2 + (y + dy) ** 2 < radius * radius) touching.add(key);
        else touching.delete(key);
      }
    }
    entries.sort((a, b) => a.time - b.time || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
    const contacts: Contact[] = [];
    for (const contact of entries) {
      const a = state.bodies.find((body) => body.id === contact.a);
      const b = state.bodies.find((body) => body.id === contact.b);
      if (!a || !b) continue;
      const parent =
        a.parentId === b.id && a.strikesParent
          ? b
          : b.parentId === a.id && b.strikesParent
            ? a
            : undefined;
      const striker = parent ? (parent === a ? b : a) : undefined;
      if (parent && striker?.strikeSteps?.length) {
        // The comet is a step sequencer: each strike sets its parent's root to the
        // comet's next step. With several comets, the last to strike wins.
        const index = strikes.get(striker.id) ?? 0;
        struckRoots.set(parent.id, striker.strikeSteps[index % striker.strikeSteps.length] ?? 0);
        strikes.set(striker.id, index + 1);
      }
      const live = liveOffsets();
      const pitchA = soundingPitch(state, a.id, "telescope", contact.time, live);
      const pitchB = soundingPitch(state, b.id, "telescope", contact.time, live);
      contacts.push({ ...contact, pitchA, pitchB });
      if (a.exchangesPitch && b.exchangesPitch) {
        const first = offsets.get(a.id) ?? a.pitchOffsetSemitones;
        offsets.set(a.id, offsets.get(b.id) ?? b.pitchOffsetSemitones);
        offsets.set(b.id, first);
      }
    }
    return contacts;
  }
  function advance(dtSeconds: number): SimulationFrame[] {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0)
      throw new Error("Elapsed time must be finite and nonnegative.");
    remainder += dtSeconds;
    const frames: SimulationFrame[] = [];
    const limit = substepLimit();
    while (remainder + 1e-12 >= FIXED_STEP_SECONDS) {
      const count = Math.max(1, Math.ceil(FIXED_STEP_SECONDS / limit));
      const dt = FIXED_STEP_SECONDS / count;
      const contacts: Contact[] = [];
      const frameStart = time;
      let positions = positionsAt(time);
      for (let i = 0; i < count; i++) {
        const nextTime = frameStart + (i + 1) * dt;
        const next = positionsAt(nextTime);
        contacts.push(...detect(positions, next, time, dt));
        time = nextTime;
        positions = next;
      }
      frames.push({ time, positions, contacts, pitchOffsets: liveOffsets() });
      remainder = Math.max(0, remainder - FIXED_STEP_SECONDS);
    }
    return frames;
  }
  return { setState, advance, positionsAt };
}
