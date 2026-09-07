/**
 * The orrery: one instrument, seen from the telescope at the top of the tower
 * and from the pool at the bottom. This file is the contract between the
 * simulation and audio core (src/orrery/model, src/orrery/audio) and the
 * Babylon and React surfaces that read it.
 *
 * Pitch accumulates in this model, not in the scene graph: a body's sounding
 * pitch is anchorMidi plus the sum of pitchOffsetSemitones along its ancestry.
 * The pool view uses anchorMidi minus that sum (the instrument's mirror rule).
 */

export type BodyId = string;

/** Orbital speed as a ratio of the base rate, so collision patterns are periodic. */
export type Ratio = { numerator: number; denominator: number };

export type Drift =
  | { mode: "still" }
  | {
      mode: "stair" | "sine";
      target: "orbitRadius" | "speed";
      amplitude: number;
      periodSeconds: number;
    };

export interface Body {
  id: BodyId;
  /** null for the sun. */
  parentId: BodyId | null;
  /** Radius of the finite disc used for contact detection, in orrery units. */
  discRadius: number;
  /** Distance from the parent's centre, in orrery units. 0 for the sun. */
  orbitRadius: number;
  /** Starting angle. */
  phaseRadians: number;
  speedRatio: Ratio;
  /** Offset relative to the parent, in semitones. */
  pitchOffsetSemitones: number;
  drift: Drift;
}

export type ViewName = "telescope" | "pool";

export interface InstrumentState {
  bodies: Body[];
  selectedBodyIds: BodyId[];
  /** Full turns per second for a body with speedRatio 1/1. */
  baseTurnsPerSecond: number;
  /** MIDI note the sun sounds in the telescope view. */
  anchorMidi: number;
  soundEnabled: boolean;
  /** null when no view is on screen; simulation may idle. */
  activeView: ViewName | null;
  maxVoices: number;
}

export const LIMITS = {
  maxBodies: 8,
  maxDepth: 2,
  allowedRatios: [
    { numerator: 1, denominator: 4 },
    { numerator: 1, denominator: 3 },
    { numerator: 1, denominator: 2 },
    { numerator: 2, denominator: 3 },
    { numerator: 1, denominator: 1 },
    { numerator: 3, denominator: 2 },
    { numerator: 2, denominator: 1 },
    { numerator: 3, denominator: 1 },
    { numerator: 4, denominator: 1 },
    { numerator: 5, denominator: 1 },
  ] as readonly Ratio[],
  /** Offsets the visitor may pick, in semitones; seconds, fourths, and fifths favoured. */
  allowedOffsets: [-12, -7, -5, -4, -3, -2, 0, 2, 3, 4, 5, 7, 12] as readonly number[],
} as const;

/** A snapshot of where every body is, for rendering. World coordinates in the orrery plane. */
export interface BodyPosition {
  id: BodyId;
  x: number;
  y: number;
}

/** A contact event, emitted once when two discs enter contact. */
export interface Contact {
  /** Simulation time in seconds. */
  time: number;
  a: BodyId;
  b: BodyId;
  /** Sounding pitches in the telescope view; the pool mirrors them around anchorMidi. */
  pitchA: number;
  pitchB: number;
  /** Relative closing speed at contact, 0 to 1, for velocity. */
  intensity: number;
}

export interface SimulationFrame {
  time: number;
  positions: BodyPosition[];
  contacts: Contact[];
}
