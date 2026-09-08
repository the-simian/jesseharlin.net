/**
 * The orrery: one instrument, seen from the telescope at the top of the tower
 * and from the pool at the bottom. This file is the contract between the
 * simulation and audio core (src/orrery/model, src/orrery/audio) and the
 * Babylon and React surfaces that read it.
 *
 * Pitch accumulates in this model, not in the scene graph: a body's sounding
 * pitch is anchorMidi plus the sum of live local offsets along its ancestry.
 * The pool view uses anchorMidi minus that sum (the instrument's mirror rule).
 */

export type BodyId = string;

/** Signed orbital speed relative to the base rate; negative numerators run backward. */
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
  /** Semi-major axis in orrery units. Sibling rings share this and eccentricity. */
  orbitRadius: number;
  /** Ellipse eccentricity, from 0 (circle) to 0.9. */
  eccentricity: number;
  /** Orientation of periapsis in the orbital plane, in radians. */
  periapsisRadians: number;
  /** Starting mean anomaly, in radians. */
  phaseRadians: number;
  speedRatio: Ratio;
  /** Offset relative to the parent, in semitones. */
  pitchOffsetSemitones: number;
  /** Explicit pitch or drift edits clear any live comet root, even for the same value. */
  pitchRevision?: number;
  /** Exchange local authored offsets when both contacting bodies opt in. */
  exchangesPitch: boolean;
  /**
   * Roots this body sets on its parent, one per strike, in order; the comet
   * is a step sequencer. With several comets, the last strike wins. Only
   * meaningful with strikesParent.
   */
  strikeSteps?: number[];
  /** Permit parent strikes and contacts across rings along this body's path. */
  strikesParent: boolean;
  drift: Drift;
}

export type ViewName = "telescope" | "pool";

export interface InstrumentState {
  /** Revision of whole-arrangement replacements; ordinary body edits preserve it. */
  arrangement: number;
  bodies: Body[];
  selectedBodyIds: BodyId[];
  /** Full turns per second for a body with speedRatio 1/1. */
  baseTurnsPerSecond: number;
  /** MIDI anchor before the sun's live offset; also the pool reflection axis. */
  anchorMidi: number;
  /** Sorted, unique semitone degrees within an octave, relative to the anchor. */
  scale: readonly number[];
  soundEnabled: boolean;
  /** null when no view is on screen; simulation may idle. */
  activeView: ViewName | null;
  maxVoices: number;
}

export const LIMITS = {
  maxBodies: 24,
  maxDepth: 3,
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
  ].flatMap((ratio) => [ratio, { ...ratio, numerator: -ratio.numerator }]) as readonly Ratio[],
  /**
   * Offsets the visitor may pick, in semitones. Fourths and fifths, both thirds,
   * whole and half steps, the minor seventh, and the octave: the intervals that
   * measured practice in Jesse's own tracks actually uses.
   */
  allowedOffsets: [
    -12, -10, -8, -7, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 7, 8, 10, 12,
  ] as readonly number[],
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
  /** Relative closing speed, 0 to 1; parent strikes receive intensity 1. */
  intensity: number;
  /** Mean disc radius divided by the largest non-sun disc, capped at 1; parent strikes weigh 1. */
  weight: number;
  /** Raw relative closing speed, in orrery units per second. */
  closing: number;
  /** Sun occlusion at the contact midpoint, from 0 (lit) to 1 (covered). */
  shade: number;
}

export interface SimulationFrame {
  time: number;
  positions: BodyPosition[];
  contacts: Contact[];
  /** Live local offsets, including exchanges and comet roots; pass directly to soundingPitch. */
  pitchOffsets: Record<BodyId, number>;
}
