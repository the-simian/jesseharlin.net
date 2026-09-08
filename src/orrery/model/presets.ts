import type { Body, InstrumentState, Ratio } from "./types";

export type Preset = {
  id: string;
  name: string;
  caption: string;
  build: () => InstrumentState;
};

export function createEmptyState(): InstrumentState {
  return {
    bodies: [
      {
        id: "sun",
        parentId: null,
        discRadius: 0.35,
        orbitRadius: 0,
        eccentricity: 0,
        periapsisRadians: 0,
        phaseRadians: 0,
        speedRatio: { numerator: 1, denominator: 1 },
        pitchOffsetSemitones: 0,
        exchangesPitch: false,
        strikesParent: false,
        drift: { mode: "still" },
      },
    ],
    selectedBodyIds: [],
    anchorMidi: 58,
    scale: [0, 2, 3, 5, 7, 8, 10],
    baseTurnsPerSecond: 0.25,
    maxVoices: 32,
    soundEnabled: false,
    activeView: null,
  };
}

const ratio = (numerator: number, denominator = 1): Ratio => ({ numerator, denominator });

function add(
  state: InstrumentState,
  id: string,
  parentId: string,
  orbitRadius: number,
  discRadius: number,
  speedRatio: Ratio,
  pitchOffsetSemitones: number,
  eccentricity = 0.2,
  phaseRadians = 0,
  periapsisRadians = 0,
): Body {
  const body: Body = {
    id,
    parentId,
    orbitRadius,
    discRadius,
    speedRatio,
    pitchOffsetSemitones,
    eccentricity,
    phaseRadians,
    periapsisRadians,
    exchangesPitch: parentId !== "sun",
    strikesParent: false,
    drift: { mode: "still" },
  };
  state.bodies.push(body);
  return body;
}

/** One root per comet passage; eight passages return to D. */
export const FOLIA_ROOTS = [0, -5, 0, -2, 3, -2, 0, -5] as const;

/** Moons exchange notes while comet strikes transpose their shared sun ancestor. */
export function laFolia(): InstrumentState {
  const state = createEmptyState();
  state.anchorMidi = 50; // D3; the gongs are an octave below it.
  state.scale = [0, 2, 3, 5, 7, 8, 10];
  state.baseTurnsPerSecond = 0.05;
  const sun = state.bodies[0];
  if (sun) {
    sun.discRadius = 1.7;
    sun.drift = { mode: "struck", target: "pitch", steps: [...FOLIA_ROOTS] };
  }
  const bass = add(state, "bass", "sun", 3.1, 0.35, ratio(1, 4), -12, 0.3);
  bass.exchangesPitch = false;
  for (const [i, speed] of [ratio(1, 4), ratio(1, 3), ratio(1, 2), ratio(2, 3)].entries())
    add(state, `bass-gong-${i}`, "bass", 1.2, 0.32, speed, 0, 0.25, 0.7 + i * 1.5, i * 0.5);
  const tenor = add(state, "tenor", "bass", 3, 0.2, ratio(1, 3), 12, 0.2, 1);
  tenor.exchangesPitch = false;
  for (const [i, speed] of [
    ratio(1, 4),
    ratio(1, 2),
    ratio(2, 3),
    ratio(1),
    ratio(3, 2),
    ratio(2),
  ].entries()) {
    add(state, `tenor-${i}`, "tenor", 0.8, 0.11, speed, i % 2 ? 7 : 3, 0.22, i * 1.03, i * 0.37);
  }
  add(state, "soprano", "sun", 7, 0.14, ratio(1, 2), 12, 0.35, 2);
  for (const [i, speed] of [1, 1.5, 2, 3, 4, 5].entries())
    add(
      state,
      `soprano-${i}`,
      "soprano",
      0.6,
      0.065,
      speed === 1.5 ? ratio(3, 2) : ratio(speed),
      [0, 2, 3, 7, 10, 12][i] ?? 0,
      0.45,
      i * 1.07,
      i * 0.41,
    );
  for (const [i, speed] of [3, 5].entries())
    add(state, `silver-${i}`, "soprano-0", 0.25, 0.035, ratio(speed), i * 7, 0.4, i * 2, i * 0.8);
  for (const id of ["soprano-0", "tenor-0"]) {
    const moon = state.bodies.find((body) => body.id === id);
    if (moon) moon.speedRatio.numerator *= -1;
  }
  // The comet: a long oval that grazes the sun once per turn and crosses every
  // ring on the way in and out. Each strike sets the next root of the road.
  const comet = add(state, "comet", "sun", 11, 0.16, ratio(1), -12, 0.86, Math.PI, 0.6);
  comet.strikesParent = true;
  comet.strikeSteps = [-5, 0, -2, 3, -2, 0, -5, 0];
  add(state, "comet-moon", "comet", 0.4, 0.06, ratio(3), 7, 0.2, 1);
  return state;
}

type Spec = {
  ring: number;
  disc: number;
  speed: Ratio;
  pitch: number;
  e?: number;
  phase?: number;
  periapsis?: number;
  exchanges?: boolean;
  strikes?: boolean;
};

function place(state: InstrumentState, id: string, parentId: string, spec: Spec): Body {
  const body: Body = {
    id,
    parentId,
    orbitRadius: spec.ring,
    discRadius: spec.disc,
    speedRatio: spec.speed,
    pitchOffsetSemitones: spec.pitch,
    eccentricity: spec.e ?? 0.2,
    phaseRadians: spec.phase ?? 0,
    periapsisRadians: spec.periapsis ?? 0,
    exchangesPitch: spec.exchanges ?? parentId !== "sun",
    strikesParent: spec.strikes ?? false,
    drift: { mode: "still" },
  };
  state.bodies.push(body);
  return body;
}

/**
 * A ground bass that falls four steps and climbs back, the way a passacaglia
 * does; the comet turns it. Dorian, so the sixth is bright against the minor third.
 */
export function wellPassacaglia(): InstrumentState {
  const state = createEmptyState();
  state.anchorMidi = 50;
  state.scale = [0, 2, 3, 5, 7, 9, 10];
  state.baseTurnsPerSecond = 0.045;
  const sun = state.bodies[0];
  if (sun) {
    sun.discRadius = 1.7;
    sun.drift = { mode: "struck", target: "pitch", steps: [0, -2, -3, -5, -3, -2] };
  }
  // Ground: two heavy gongs on one oval, slow, a fifth apart, that meet head-on.
  place(state, "ground", "sun", {
    ring: 3.2,
    disc: 0.3,
    speed: ratio(1, 4),
    pitch: -12,
    e: 0.25,
    exchanges: false,
  });
  place(state, "gong-a", "ground", {
    ring: 1.1,
    disc: 0.34,
    speed: ratio(1, 3),
    pitch: 0,
    e: 0.3,
    phase: 0.2,
  });
  place(state, "gong-b", "ground", {
    ring: 1.1,
    disc: 0.34,
    speed: ratio(-1, 4),
    pitch: 7,
    e: 0.3,
    phase: 2.9,
    periapsis: 1.2,
  });
  place(state, "gong-c", "ground", {
    ring: 1.1,
    disc: 0.3,
    speed: ratio(1, 2),
    pitch: 3,
    e: 0.3,
    phase: 4.4,
    periapsis: 2.3,
  });
  // Voices: two rails a third and a fifth up, each with five moons trading notes.
  place(state, "alto", "sun", {
    ring: 5.2,
    disc: 0.2,
    speed: ratio(1, 3),
    pitch: 3,
    e: 0.3,
    phase: 2.1,
    exchanges: false,
  });
  for (const [i, speed] of [ratio(1, 2), ratio(2, 3), ratio(1), ratio(-3, 2), ratio(2)].entries())
    place(state, `alto-${i}`, "alto", {
      ring: 0.85,
      disc: 0.1,
      speed,
      pitch: [0, 3, 7, 10, 12][i] ?? 0,
      e: 0.3,
      phase: i * 1.1,
      periapsis: i * 0.6,
    });
  place(state, "treble", "sun", {
    ring: 7.4,
    disc: 0.16,
    speed: ratio(1, 2),
    pitch: 12,
    e: 0.35,
    phase: 4.5,
    exchanges: false,
  });
  for (const [i, speed] of [
    ratio(1),
    ratio(3, 2),
    ratio(-2),
    ratio(3),
    ratio(4),
    ratio(5),
  ].entries())
    place(state, `treble-${i}`, "treble", {
      ring: 0.6,
      disc: 0.06,
      speed,
      pitch: [0, 2, 3, 7, 10, 12][i] ?? 0,
      e: 0.45,
      phase: i * 0.95,
      periapsis: i * 0.5,
    });
  place(state, "treble-spark", "treble-0", {
    ring: 0.22,
    disc: 0.03,
    speed: ratio(5),
    pitch: 12,
    e: 0.3,
  });
  place(state, "comet", "sun", {
    ring: 6.2,
    disc: 0.15,
    speed: ratio(1, 2),
    pitch: -12,
    e: 0.7,
    phase: Math.PI,
    periapsis: 2.4,
    strikes: true,
  });
  place(state, "comet-moon", "comet", { ring: 0.4, disc: 0.05, speed: ratio(4), pitch: 7, e: 0.2 });
  return state;
}

/**
 * A quick bronze ensemble: interlocking pairs on every ring, a five-note
 * scale, a gong every so often, and no comet; the exchange alone keeps it moving.
 */
export function rainOnBronze(): InstrumentState {
  const state = createEmptyState();
  state.anchorMidi = 55;
  state.scale = [0, 1, 3, 7, 8];
  state.baseTurnsPerSecond = 0.07;
  const sun = state.bodies[0];
  if (sun) sun.discRadius = 1.4;
  place(state, "gong", "sun", {
    ring: 2.9,
    disc: 0.32,
    speed: ratio(1, 4),
    pitch: -12,
    e: 0.2,
    exchanges: false,
  });
  place(state, "gong-a", "gong", {
    ring: 1.0,
    disc: 0.36,
    speed: ratio(1, 3),
    pitch: 0,
    e: 0.25,
    phase: 0.3,
  });
  place(state, "gong-b", "gong", {
    ring: 1.0,
    disc: 0.36,
    speed: ratio(-1, 3),
    pitch: 7,
    e: 0.25,
    phase: 3.2,
    periapsis: 1.6,
  });
  const rails: Array<[string, number, number, number]> = [
    ["saron", 4.6, 0, 0.12],
    ["peking", 6.3, 12, 0.08],
  ];
  for (const [name, ring, pitch, disc] of rails) {
    place(state, name, "sun", {
      ring,
      disc: 0.18,
      speed: ratio(name === "saron" ? 1 : 2, 3),
      pitch,
      e: 0.3,
      phase: name.length,
      exchanges: false,
    });
    const speeds = [ratio(1, 2), ratio(1), ratio(-2, 3), ratio(3, 2), ratio(2)];
    for (const [i, speed] of speeds.entries())
      place(state, `${name}-${i}`, name, {
        ring: 0.9,
        disc: disc * 0.8,
        speed,
        pitch: [0, 3, 7, 8, 12][i] ?? 0,
        e: 0.35,
        phase: i * 0.9,
        periapsis: i * 0.45,
      });
  }
  place(state, "peking-spark", "peking-4", {
    ring: 0.2,
    disc: 0.03,
    speed: ratio(5),
    pitch: 7,
    e: 0.3,
  });
  return state;
}

/** Fifths stacked on fifths, Lydian, vast and slow; the comet walks the key by fifths. */
export function ladder(): InstrumentState {
  const state = createEmptyState();
  state.anchorMidi = 48;
  state.scale = [0, 2, 4, 6, 7, 9, 11];
  state.baseTurnsPerSecond = 0.035;
  const sun = state.bodies[0];
  if (sun) {
    sun.discRadius = 1.9;
    sun.drift = { mode: "struck", target: "pitch", steps: [0, 7, 2, 9, 4, 9, 2, 7] };
  }
  place(state, "deep", "sun", {
    ring: 3.4,
    disc: 0.32,
    speed: ratio(1, 4),
    pitch: -12,
    e: 0.3,
    exchanges: false,
  });
  place(state, "deep-a", "deep", {
    ring: 1.2,
    disc: 0.4,
    speed: ratio(1, 4),
    pitch: 0,
    e: 0.3,
    phase: 0.5,
  });
  place(state, "deep-b", "deep", {
    ring: 1.2,
    disc: 0.4,
    speed: ratio(-1, 3),
    pitch: 7,
    e: 0.3,
    phase: 3.6,
    periapsis: 1.0,
  });
  place(state, "deep-c", "deep", {
    ring: 1.2,
    disc: 0.36,
    speed: ratio(1, 2),
    pitch: 12,
    e: 0.3,
    phase: 5.2,
    periapsis: 2.1,
  });
  place(state, "mid", "sun", {
    ring: 5.6,
    disc: 0.2,
    speed: ratio(1, 3),
    pitch: 7,
    e: 0.35,
    phase: 2.5,
    exchanges: false,
  });
  for (const [i, speed] of [ratio(1, 2), ratio(1), ratio(-1), ratio(3, 2), ratio(2)].entries())
    place(state, `mid-${i}`, "mid", {
      ring: 0.9,
      disc: 0.11,
      speed,
      pitch: [0, 7, 12, -5, -3][i] ?? 0,
      e: 0.35,
      phase: i * 1.2,
      periapsis: i * 0.7,
    });
  place(state, "high", "sun", {
    ring: 8.2,
    disc: 0.15,
    speed: ratio(1, 2),
    pitch: 12,
    e: 0.4,
    phase: 4.8,
    exchanges: false,
  });
  for (const [i, speed] of [
    ratio(1),
    ratio(-3, 2),
    ratio(2),
    ratio(3),
    ratio(-4),
    ratio(5),
  ].entries())
    place(state, `high-${i}`, "high", {
      ring: 0.6,
      disc: 0.06,
      speed,
      pitch: [0, 4, 7, -1, 12, -8][i] ?? 0,
      e: 0.45,
      phase: i * 0.8,
      periapsis: i * 0.55,
    });
  place(state, "high-spark", "high-2", {
    ring: 0.22,
    disc: 0.03,
    speed: ratio(5),
    pitch: 7,
    e: 0.3,
  });
  place(state, "comet", "sun", {
    ring: 6.8,
    disc: 0.15,
    speed: ratio(1, 2),
    pitch: 0,
    e: 0.7,
    phase: Math.PI,
    periapsis: 3.9,
    strikes: true,
  });
  place(state, "comet-moon", "comet", { ring: 0.4, disc: 0.05, speed: ratio(3), pitch: 7, e: 0.2 });
  return state;
}

/**
 * A four-chord road in a major key: the subdominant seventh, the dominant,
 * the mediant, and the relative minor, turned by the comet. The rails spell
 * sevenths above whichever root the sun holds.
 */
export function lanternRoad(): InstrumentState {
  const state = createEmptyState();
  state.anchorMidi = 53; // F3
  state.scale = [0, 2, 4, 5, 7, 9, 11];
  state.baseTurnsPerSecond = 0.05;
  const sun = state.bodies[0];
  if (sun) {
    sun.discRadius = 1.7;
    // Roots relative to F: F, G, E, A; then the same road again a step lower to return.
    sun.drift = { mode: "struck", target: "pitch", steps: [0, 2, -1, 4, 0, 2, -1, 4] };
  }
  place(state, "bass", "sun", {
    ring: 3.2,
    disc: 0.32,
    speed: ratio(1, 4),
    pitch: -12,
    e: 0.25,
    exchanges: false,
  });
  place(state, "bass-a", "bass", {
    ring: 1.1,
    disc: 0.34,
    speed: ratio(1, 3),
    pitch: 0,
    e: 0.3,
    phase: 0.4,
  });
  place(state, "bass-b", "bass", {
    ring: 1.1,
    disc: 0.34,
    speed: ratio(-1, 4),
    pitch: 7,
    e: 0.3,
    phase: 3.1,
    periapsis: 1.4,
  });
  place(state, "seventh", "sun", {
    ring: 5.0,
    disc: 0.2,
    speed: ratio(1, 3),
    pitch: 4,
    e: 0.3,
    phase: 1.7,
    exchanges: false,
  });
  for (const [i, speed] of [ratio(1, 2), ratio(1), ratio(-1), ratio(3, 2), ratio(2)].entries())
    place(state, `seventh-${i}`, "seventh", {
      ring: 0.85,
      disc: 0.1,
      speed,
      pitch: [0, 4, 7, -1, 12][i] ?? 0,
      e: 0.3,
      phase: i * 1.15,
      periapsis: i * 0.65,
    });
  place(state, "bright", "sun", {
    ring: 7.2,
    disc: 0.16,
    speed: ratio(1, 2),
    pitch: 12,
    e: 0.35,
    phase: 4.2,
    exchanges: false,
  });
  for (const [i, speed] of [
    ratio(1),
    ratio(-3, 2),
    ratio(2),
    ratio(3),
    ratio(-4),
    ratio(5),
  ].entries())
    place(state, `bright-${i}`, "bright", {
      ring: 0.6,
      disc: 0.06,
      speed,
      pitch: [0, 2, 4, 7, -1, 12][i] ?? 0,
      e: 0.45,
      phase: i * 0.9,
      periapsis: i * 0.5,
    });
  place(state, "bright-spark", "bright-1", {
    ring: 0.22,
    disc: 0.03,
    speed: ratio(5),
    pitch: 4,
    e: 0.3,
  });
  place(state, "comet", "sun", {
    ring: 6.1,
    disc: 0.15,
    speed: ratio(1, 2),
    pitch: -12,
    e: 0.7,
    phase: Math.PI,
    periapsis: 0.9,
    strikes: true,
  });
  place(state, "comet-moon", "comet", { ring: 0.4, disc: 0.05, speed: ratio(3), pitch: 7, e: 0.2 });
  return state;
}

/**
 * Geometry first: rings spaced by the golden ratio, phases at the golden
 * angle, eccentricities from the same number, speeds along the Fibonacci
 * ratios the instrument allows. A pentatonic scale so whatever meets agrees.
 * No comet; the exchange is the only history.
 */
export function goldenMean(): InstrumentState {
  const state = createEmptyState();
  state.anchorMidi = 52; // E3
  state.scale = [0, 2, 4, 7, 9];
  state.baseTurnsPerSecond = 0.05;
  const phi = (1 + Math.sqrt(5)) / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const sun = state.bodies[0];
  if (sun) sun.discRadius = 1.5;
  const fib: Ratio[] = [ratio(1, 3), ratio(1, 2), ratio(1), ratio(2), ratio(3), ratio(5)];
  const pitches = [0, 2, 4, 7, 12, -5, -3, -8, -10, -12];
  let ring = 3.1;
  let index = 0;
  for (let rail = 0; rail < 3; rail++) {
    const carrier = place(state, `rail-${rail}`, "sun", {
      ring,
      disc: 0.32 / phi ** rail,
      speed: fib[rail] ?? ratio(1),
      pitch: [-12, 0, 12][rail] ?? 0,
      e: 1 / phi ** (rail + 2),
      phase: rail * goldenAngle,
      periapsis: rail * goldenAngle * 2,
      exchanges: false,
    });
    const moons = 3 + rail * 2;
    for (let m = 0; m < moons; m++) {
      const speed = fib[(m + rail) % fib.length] ?? ratio(1);
      const retro = m % 3 === 2;
      place(state, `rail-${rail}-${m}`, carrier.id, {
        ring: carrier.discRadius * phi ** 2 + 0.2,
        disc: carrier.discRadius / phi,
        speed: retro ? ratio(-speed.numerator, speed.denominator) : speed,
        pitch: pitches[index++ % pitches.length] ?? 0,
        e: 1 / phi ** 2,
        phase: m * goldenAngle,
        periapsis: m * goldenAngle * phi,
      });
    }
    ring *= phi;
  }
  place(state, "rail-2-spark", "rail-2-4", {
    ring: 0.2,
    disc: 0.025,
    speed: ratio(5),
    pitch: 7,
    e: 0.2,
  });
  return state;
}

/** F, C, D, A and round again: the bright side of the same minor road. */
export function coldHarbour(): InstrumentState {
  const state = wellPassacaglia();
  state.anchorMidi = 50;
  state.scale = [0, 2, 3, 5, 7, 8, 10];
  const comet = state.bodies.find((body) => body.id === "comet");
  if (comet) comet.strikeSteps = [3, -2, 0, -5, 3, -2, 0, -5, 0];
  // A second, slower comet on its own road; whichever struck last holds the key.
  const second = place(state, "comet-2", "sun", {
    ring: 14,
    disc: 0.14,
    speed: ratio(1, 3),
    pitch: -5,
    e: 0.88,
    phase: 0.4,
    periapsis: 4.1,
    strikes: true,
  });
  second.strikeSteps = [-5, 0];
  return state;
}

/** A bass that slips down by half steps under the chords: D, B, B flat, A. Both sixths live in the scale so the line can pass. */
export function slowDescent(): InstrumentState {
  const state = wellPassacaglia();
  state.anchorMidi = 50;
  state.scale = [0, 2, 3, 5, 7, 8, 9, 10];
  const comet = state.bodies.find((body) => body.id === "comet");
  if (comet) comet.strikeSteps = [-3, -4, -5, 0];
  return state;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "lily-pads",
    name: "Celestial lily pads",
    caption:
      "An old minor-key dance turns slowly under crossing bells and small, quick moons; a comet turns the key.",
    build: laFolia,
  },
  {
    id: "lantern",
    name: "Lantern road",
    caption:
      "Four bright chords go round in a major key, the way a road bends home; the comet turns them.",
    build: lanternRoad,
  },
  {
    id: "well",
    name: "The sunken well",
    caption: "A slow ground falls four steps and climbs back, under two singing rails and a comet.",
    build: wellPassacaglia,
  },
  {
    id: "harbour",
    name: "Cold harbour",
    caption: "The bright side of a minor road: the comet lands on the third, then walks home.",
    build: coldHarbour,
  },
  {
    id: "descent",
    name: "Slow descent",
    caption: "A bass that slips down by half steps under bright chords, then climbs back.",
    build: slowDescent,
  },
  {
    id: "golden",
    name: "Golden mean",
    caption:
      "Rings spaced by the golden ratio, five notes that always agree, no key change; only the trading of notes.",
    build: goldenMean,
  },
  {
    id: "ladder",
    name: "Ladder of fifths",
    caption: "Fifths stacked on fifths, bright and vast; the comet climbs the key by fifths.",
    build: ladder,
  },
  {
    id: "empty",
    name: "Empty sky",
    caption: "A silent sun, ready for your own bodies, rings, and pitches.",
    build: createEmptyState,
  },
];

/** Selection, sound, and viewpoint do not change which arrangement is loaded. */
export function getPresetId(state: InstrumentState): string | null {
  return (
    PRESETS.find((preset) => {
      const built = preset.build();
      return (
        state.anchorMidi === built.anchorMidi &&
        JSON.stringify(state.scale) === JSON.stringify(built.scale) &&
        state.baseTurnsPerSecond === built.baseTurnsPerSecond &&
        state.maxVoices === built.maxVoices &&
        JSON.stringify(state.bodies) === JSON.stringify(built.bodies)
      );
    })?.id ?? null
  );
}

/** A whole arrangement replacement restarts its score without resetting the runtime clock. */
export function isPresetReplacement(previous: InstrumentState, next: InstrumentState): boolean {
  return (
    previous.bodies !== next.bodies &&
    next.bodies.every((body) => !previous.bodies.includes(body)) &&
    getPresetId(next) !== null
  );
}
