import { PATCHES_FOR_ROLE, roleOf } from "./patches";
import { pitchClass } from "./pitch";
import { depthOf } from "./tree";
import { type InstrumentState, LIMITS } from "./types";

export function validateState(
  state: InstrumentState,
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!Number.isSafeInteger(state.arrangement) || state.arrangement < 0)
    problems.push("Arrangement revision must be a nonnegative safe integer.");
  const validScale =
    Array.isArray(state.scale) &&
    state.scale.length > 0 &&
    state.scale.every(
      (degree, i) =>
        Number.isInteger(degree) &&
        degree >= 0 &&
        degree < 12 &&
        (i === 0 || degree > (state.scale[i - 1] ?? -1)),
    );
  if (!validScale)
    problems.push("Scale must contain sorted, unique semitone degrees from 0 to 11.");
  const byId = new Map(state.bodies.map((body) => [body.id, body]));
  if (byId.size !== state.bodies.length) problems.push("Body ids must be unique.");
  if (state.bodies.length > LIMITS.maxBodies) problems.push("Too many bodies.");
  if (state.bodies.filter((body) => body.parentId === null).length !== 1)
    problems.push("Exactly one sun is required.");
  if (!Number.isFinite(state.anchorMidi)) problems.push("Anchor must be finite.");
  if (!Number.isFinite(state.baseTurnsPerSecond) || state.baseTurnsPerSecond < 0)
    problems.push("Base speed must be finite and nonnegative.");
  if (!Number.isInteger(state.maxVoices) || state.maxVoices < 1)
    problems.push("Voice cap must be a positive integer.");
  if (typeof state.soundEnabled !== "boolean") problems.push("Invalid sound flag.");
  if (![null, "telescope", "pool"].includes(state.activeView)) problems.push("Invalid view.");
  if (
    new Set(state.selectedBodyIds).size !== state.selectedBodyIds.length ||
    state.selectedBodyIds.some((id) => !byId.has(id))
  )
    problems.push("Invalid selection.");
  for (const body of state.bodies) {
    const fail = (message: string) => problems.push(`${body.id}: ${message}`);
    if (typeof body.strikesParent !== "boolean") fail("Invalid parent strike flag.");
    if (typeof body.exchangesPitch !== "boolean") fail("Invalid pitch exchange flag.");
    if (!body.id) fail("Id is required.");
    if (body.patch !== undefined) {
      let allowed = false;
      try {
        allowed = PATCHES_FOR_ROLE[roleOf(depthOf(body, byId))].includes(body.patch);
      } catch {
        allowed = false;
      }
      if (!allowed) fail("Patch is not one this body can play.");
    }
    if (!Number.isFinite(body.discRadius) || body.discRadius <= 0)
      fail("Disc radius must be positive.");
    if (!Number.isFinite(body.orbitRadius) || body.orbitRadius < 0) fail("Invalid orbit radius.");
    if (!Number.isFinite(body.eccentricity) || body.eccentricity < 0 || body.eccentricity > 0.9)
      fail("Eccentricity must be from 0 to 0.9.");
    if (body.strikeSteps !== undefined) {
      if (!body.strikesParent) fail("Strike steps need a body that strikes its parent.");
      if (!Array.isArray(body.strikeSteps) || body.strikeSteps.length === 0)
        fail("Strike steps must be a non-empty list.");
      else if (!body.strikeSteps.every((step) => Number.isInteger(step) && Math.abs(step) <= 24))
        fail("Strike steps must be integers within two octaves.");
    }
    if (!Number.isFinite(body.periapsisRadians)) fail("Periapsis must be finite.");
    if (!Number.isFinite(body.phaseRadians)) fail("Phase must be finite.");
    if (
      !LIMITS.allowedRatios.some(
        (r) =>
          r.numerator === body.speedRatio.numerator &&
          r.denominator === body.speedRatio.denominator,
      )
    )
      fail("Invalid speed ratio.");
    if (!LIMITS.allowedOffsets.includes(body.pitchOffsetSemitones)) fail("Invalid pitch offset.");
    const onScale = validScale && state.scale.includes(pitchClass(body.pitchOffsetSemitones));
    if (!onScale) fail("Pitch offset must belong to the scale.");
    if (
      body.pitchRevision !== undefined &&
      (!Number.isSafeInteger(body.pitchRevision) || body.pitchRevision < 0)
    )
      fail("Pitch revision must be a nonnegative safe integer.");
    const drift = body.drift;
    if (drift.mode !== "still") {
      if (
        !["sine", "stair"].includes(drift.mode) ||
        !["speed", "orbitRadius"].includes(drift.target) ||
        !Number.isFinite(drift.amplitude) ||
        drift.amplitude < 0 ||
        !Number.isFinite(drift.periodSeconds) ||
        drift.periodSeconds <= 0
      )
        fail("Invalid drift.");
      if (drift.target === "speed" && drift.amplitude > 1)
        fail("Speed drift amplitude exceeds one.");
    }
    if (body.parentId === null) {
      if (body.orbitRadius !== 0 || drift.mode !== "still") fail("Sun must remain at the origin.");
    } else {
      const parent = byId.get(body.parentId);
      if (!parent) fail("Parent does not exist.");
      const excursion =
        drift.mode !== "still" && drift.target === "orbitRadius" ? drift.amplitude : 0;
      if (
        parent &&
        !body.strikesParent &&
        body.orbitRadius * (1 - body.eccentricity) - excursion < parent.discRadius + body.discRadius
      )
        fail("Orbit intersects the parent's disc.");
    }
    const visited = new Set([body.id]);
    let parentId = body.parentId;
    let depth = 0;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        fail("Cyclic parentage.");
        break;
      }
      visited.add(parentId);
      depth++;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    if (depth > LIMITS.maxDepth) fail("Maximum depth exceeded.");
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}
