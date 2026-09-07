import { soundingPitch } from "./pitch";
import type { Body, BodyPosition, Contact, InstrumentState, SimulationFrame } from "./types";
import { validateState } from "./validate";

const TAU = 2 * Math.PI;
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

export function createSimulation(initial: InstrumentState) {
  if (!validateState(initial).ok) throw new Error("Invalid initial arrangement.");
  let state = initial;
  let time = 0;
  let remainder = 0;
  let phases = new Map(state.bodies.map((body) => [body.id, body.phaseRadians]));
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
      const angle = angleAt(body, at);
      const radius = parent ? radiusAt(body, at) : 0;
      const value = {
        id: body.id,
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius,
      };
      cache.set(body.id, value);
      return value;
    }
    return state.bodies.map(position);
  }
  function setState(next: InstrumentState) {
    if (!validateState(next).ok) return;
    const oldBodies = new Map(state.bodies.map((body) => [body.id, body]));
    const nextPhases = new Map<string, number>();
    for (const body of next.bodies) {
      const old = oldBodies.get(body.id);
      // An explicit phase edit rotates the current orbit by the edited delta.
      const angle = old
        ? angleAt(old, time) + body.phaseRadians - old.phaseRadians
        : body.phaseRadians;
      nextPhases.set(body.id, angle - angularTravel(body, next, time));
    }
    state = next;
    phases = nextPhases;
    const ids = new Set(next.bodies.map((body) => body.id));
    touching = new Set(
      [...touching].filter((key) => (JSON.parse(key) as string[]).every((id) => ids.has(id))),
    );
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
        ((TAU * state.baseTurnsPerSecond * body.speedRatio.numerator) /
          body.speedRatio.denominator) *
        (body.orbitRadius + (radial ? drift.amplitude : 0)) *
        (1 + (speedDrift ? drift.amplitude : 0));
      if (radial) speed += (TAU * drift.amplitude) / drift.periodSeconds;
    }
    return Math.min(FIXED_STEP_SECONDS, speed > 0 ? radius / (2 * speed) : FIXED_STEP_SECONDS);
  }
  function detect(start: BodyPosition[], end: BodyPosition[], at: number, dt: number): Contact[] {
    const contacts: Contact[] = [];
    for (let i = 0; i < state.bodies.length; i++) {
      for (let j = i + 1; j < state.bodies.length; j++) {
        const a = state.bodies[i];
        const b = state.bodies[j];
        const a0 = start[i];
        const b0 = start[j];
        const a1 = end[i];
        const b1 = end[j];
        if (!a || !b || !a0 || !b0 || !a1 || !b1) continue;
        // Parent and child form one orbital assembly; their own contact is not an excitation.
        if (a.parentId === b.id || b.parentId === a.id) continue;
        const key = JSON.stringify([a.id, b.id].sort());
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
          contacts.push({
            time: at + entry * dt,
            a: a.id,
            b: b.id,
            pitchA: soundingPitch(state, a.id, "telescope"),
            pitchB: soundingPitch(state, b.id, "telescope"),
            intensity: Math.min(1, closing / 4),
          });
        }
        if ((x + dx) ** 2 + (y + dy) ** 2 < radius * radius) touching.add(key);
        else touching.delete(key);
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
      frames.push({ time, positions, contacts });
      remainder = Math.max(0, remainder - FIXED_STEP_SECONDS);
    }
    return frames;
  }
  return { setState, advance, positionsAt };
}
