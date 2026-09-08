import { depthOf } from "./tree";
import type { Body, PatchName } from "./types";

/**
 * The cast: which patch each body sounds. Every role has a set of patches it
 * can play and a default order moons take round their parent. A patch is
 * named for a body of the sky, so choosing a sound reads as choosing a world:
 * stars for the sun, exoplanets for the planets, real moons for the moons.
 */

export type Role = "sun" | "planet" | "moon";

export function roleOf(depth: number): Role {
  return depth === 0 ? "sun" : depth === 1 ? "planet" : "moon";
}

export const PATCHES_FOR_ROLE: Record<Role, readonly PatchName[]> = {
  sun: ["pad"],
  planet: ["harp", "pluck"],
  moon: ["deep", "chime", "string", "vox", "bell"],
};

/** The order moons take patches in when none is chosen; the bell is not in the round. */
const MOON_ROUND: readonly PatchName[] = ["deep", "chime", "string", "vox"];

export const PATCH_NAMES: Record<PatchName, string> = {
  pad: "Betelgeuse",
  harp: "Dimidium",
  pluck: "Draugr",
  deep: "Charon",
  chime: "Enceladus",
  string: "Titania",
  vox: "Miranda",
  bell: "Hyperion",
};

/** One line on each sound, for the panel. */
export const PATCH_NOTES: Record<PatchName, string> = {
  pad: "a slow pad of three bowed strings",
  harp: "a harp that blooms after the pluck",
  pluck: "a plain harp string",
  deep: "airy, two tones a breath apart",
  chime: "a chime of glass",
  string: "a plucked nylon string",
  vox: "a sung vowel",
  bell: "the metallophone",
};

/** The colour a body takes for its patch, 0 to 1 per channel; the swatch and the sky agree. */
export const PATCH_COLORS: Record<PatchName, readonly [number, number, number]> = {
  pad: [1, 0.86, 0.45],
  harp: [0.96, 0.9, 0.78],
  pluck: [0.6, 0.86, 0.74],
  deep: [0.74, 0.8, 0.96],
  chime: [0.86, 0.96, 1],
  string: [1, 0.72, 0.38],
  vox: [0.68, 0.58, 1],
  bell: [0.9, 0.88, 0.8],
};

/** The patch a body's role falls back to; bodies of that patch keep the palette's own colour. */
export function defaultPatchOf(body: Body, bodies: readonly Body[]): PatchName {
  const byId = new Map(bodies.map((candidate) => [candidate.id, candidate]));
  const role = roleOf(depthOf(body, byId));
  if (role === "sun") return "pad";
  if (role === "planet") return "harp";
  let ordinal = 0;
  for (const other of bodies) {
    if (other.id === body.id) break;
    if (other.parentId === body.parentId) ordinal++;
  }
  return MOON_ROUND[ordinal % MOON_ROUND.length] ?? "deep";
}

/** The patch a body sounds: its own choice when it has one and its role allows it, else the default. */
export function patchOf(body: Body, bodies: readonly Body[]): PatchName {
  if (body.patch) {
    const byId = new Map(bodies.map((candidate) => [candidate.id, candidate]));
    if (PATCHES_FOR_ROLE[roleOf(depthOf(body, byId))].includes(body.patch)) return body.patch;
  }
  return defaultPatchOf(body, bodies);
}

/** A body's place in the arrangement: the sun, planet 2, moon 3. Moons count across the sky. */
export function placeOf(body: Body, bodies: readonly Body[]): string {
  const byId = new Map(bodies.map((candidate) => [candidate.id, candidate]));
  const role = roleOf(depthOf(body, byId));
  if (role === "sun") return "sun";
  let ordinal = 0;
  for (const other of bodies) {
    if (other.id === body.id) break;
    if (roleOf(depthOf(other, byId)) === role) ordinal++;
  }
  return `${role} ${ordinal + 1}`;
}
