/**
 * The voice engine: Web Audio voices scheduled ahead of the picture, cast by role,
 * with a synthetic room and the sun's drone. Reads the mix; owns the audio graph.
 */
import { sharedMix } from "../mix";
import { createInitialState } from "../model/commands";
import { decayCurve } from "../model/decay";
import { midiToHz, soundingPitch } from "../model/pitch";
import { depthOf } from "../model/tree";
import type { Contact, InstrumentState, ViewName } from "../model/types";
import { validateState } from "../model/validate";

const LOOKAHEAD = 0.1;
/**
 * The decay curve scaled by the mix's ring. With only (midi, velocity) this is
 * the bare register envelope; the engine also passes weight, closing speed, and
 * the anchor.
 */
export function decayFor(
  midi: number,
  velocity: number,
  weight?: number,
  closing = 0,
  anchorMidi = 58,
): number {
  return decayCurve(midi, velocity, weight, closing, anchorMidi) * 1.6 * sharedMix.getMix().decay;
}

/** Deterministic stereo noise, increasingly filtered and faded to silence. */
export function reverbImpulse(
  context: Pick<BaseAudioContext, "sampleRate" | "createBuffer">,
  view: ViewName,
): AudioBuffer {
  const seconds = view === "pool" ? 7 : 4;
  const buffer = context.createBuffer(
    2,
    Math.ceil(context.sampleRate * seconds),
    context.sampleRate,
  );
  let seed = 0x46504c49;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const progress = i / data.length;
      const cutoff = (view === "pool" ? 1800 : 5000) * (1 - 0.8 * progress);
      const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / context.sampleRate);
      filtered += alpha * (seed / 0x80000000 - 1 - filtered);
      data[i] =
        filtered *
        Math.exp(-7 * progress) *
        (1 - progress) *
        Math.min(1, i / (context.sampleRate * 0.015));
    }
  }
  return buffer;
}

interface Excitation {
  start: number;
  end: number;
  oscillators: OscillatorNode[];
  nodes: AudioNode[];
  /** Undo any connection made into the voice from outside it. */
  unplug?: () => void;
}

/**
 * The struck sun's warble follows its wobble: the sphere's ripple runs at this
 * rate, in radians per second, and its swell decays by e^(-3t / decay).
 */
export const WOBBLE_RATE = 18;

/** Where a body sits in the tree decides its section. */
export type Role = "sun" | "planet" | "moon";

export function roleOf(depth: number): Role {
  return depth === 0 ? "sun" : depth === 1 ? "planet" : "moon";
}

/** What every patch is handed: the note, its time, and the shared envelope and filter. */
interface Patch {
  context: AudioContext;
  frequency: number;
  velocity: number;
  start: number;
  duration: number;
  nyquist: number;
  envelope: GainNode;
  filter: BiquadFilterNode;
}

interface Cast {
  /** The first oscillator is the carrier at the fundamental; its end releases the voice. */
  oscillators: OscillatorNode[];
  nodes: AudioNode[];
}

/**
 * The sun as the string section far upstage: the hushed, held strings of Ives'
 * The Unanswered Question. Two triangles a few cents apart drift slowly against
 * each other over a sine an octave down; the section swells in over more than a
 * second, holds low and dark, and darkens further as it fades. Nothing about it
 * should pulse or bite.
 */
function pad(
  { context, frequency, velocity, start, duration, envelope, filter }: Patch,
  open: number,
): Cast {
  const left = context.createOscillator();
  const right = context.createOscillator();
  const sub = context.createOscillator();
  const section = context.createGain();
  const subGain = context.createGain();
  left.type = "triangle";
  right.type = "triangle";
  left.frequency.value = frequency;
  right.frequency.value = frequency;
  left.detune.value = -4;
  right.detune.value = 4;
  sub.frequency.value = frequency / 2;
  section.gain.value = 0.3;
  subGain.gain.value = 0.3;
  left.connect(section);
  right.connect(section);
  sub.connect(subGain);
  section.connect(envelope);
  subGain.connect(envelope);
  const peak = 0.3 + 0.25 * velocity;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(peak, start + 1.3);
  envelope.gain.exponentialRampToValueAtTime(peak * 0.85, start + Math.max(1.4, duration * 0.5));
  // The bows open the tone over the first two seconds, then it closes with the fade.
  filter.frequency.setValueAtTime(Math.max(120, frequency * 1.2), start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(180, open * 0.25), start + 2.0);
  filter.Q.value = 0.6;
  return { oscillators: [left, right, sub], nodes: [section, subGain] };
}

/**
 * A planet as a harp string: a sine carrier, a harmonic partial that flashes
 * and is gone in a few hundredths of a second, and a pick click, then the
 * fundamental rings plainly and closes fast.
 */
function pluck(
  { context, frequency, velocity, start, duration, nyquist, envelope, filter }: Patch,
  open: number,
): Cast {
  const carrier = context.createOscillator();
  const modulator = context.createOscillator();
  const pick = context.createOscillator();
  const modulation = context.createGain();
  const pickGain = context.createGain();
  carrier.frequency.value = frequency;
  modulator.frequency.value = Math.min(frequency * 2, nyquist);
  modulation.gain.setValueAtTime(frequency * (0.4 + 1.4 * velocity), start);
  modulation.gain.exponentialRampToValueAtTime(frequency * 0.02, start + 0.06);
  modulation.gain.exponentialRampToValueAtTime(0.001, start + Math.min(duration, 0.6));
  modulator.connect(modulation);
  modulation.connect(carrier.frequency);
  pick.frequency.value = Math.min(frequency * 5, nyquist);
  pickGain.gain.setValueAtTime(0, start);
  pickGain.gain.linearRampToValueAtTime(0.3 * velocity, start + 0.002);
  pickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.02);
  pick.connect(pickGain);
  pickGain.connect(filter);
  carrier.connect(envelope);
  const peak = 0.9 * velocity;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(peak, start + 0.0015);
  envelope.gain.exponentialRampToValueAtTime(peak * 0.35, start + Math.min(duration * 0.5, 0.3));
  filter.frequency.setValueAtTime(Math.min(nyquist, open * 1.3), start);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(200, frequency * 2.5),
    start + Math.min(duration * 0.5, 0.45),
  );
  filter.Q.value = 0.7;
  return { oscillators: [carrier, modulator, pick], nodes: [modulation, pickGain] };
}

/**
 * A moon as a bell: the metallophone. Heavy low moons are gongs (deep
 * inharmonic partial, long soft bloom), small or high moons are plinks (bright,
 * short, glassy), and the rest are pedaled strings between the two.
 */
function bell(
  { context, frequency, velocity, start, duration, nyquist, envelope, filter }: Patch,
  open: number,
  weight: number,
  midi: number,
): Cast {
  const register = Math.max(0, Math.min(1, (midi - 40) / 40));
  const gong = weight > 0.6 && register < 0.45;
  const plink = weight < 0.3 || register > 0.75;
  const carrier = context.createOscillator();
  const modulator = context.createOscillator();
  const hammer = context.createOscillator();
  const modulation = context.createGain();
  const hammerGain = context.createGain();
  carrier.frequency.value = frequency;
  const ratioFm = gong ? 1.41 : plink ? 3.53 : 2.0;
  modulator.frequency.value = Math.min(frequency * ratioFm, nyquist);
  const brightness = (gong ? 0.5 : plink ? 1.1 : 0.8) * (0.7 + 0.5 * velocity);
  modulation.gain.setValueAtTime(frequency * (0.2 + 1.0 * velocity ** 2) * brightness, start);
  modulation.gain.exponentialRampToValueAtTime(
    frequency * (gong ? 0.08 : 0.01),
    start + (gong ? 0.6 : plink ? 0.05 : 0.12),
  );
  modulation.gain.exponentialRampToValueAtTime(0.001, start + duration);
  modulator.connect(modulation);
  modulation.connect(carrier.frequency);
  // The hammer: a short burst of a high partial that makes the attack a strike.
  hammer.frequency.value = Math.min(frequency * (plink ? 6.1 : 4.2), nyquist);
  hammerGain.gain.setValueAtTime(0, start);
  hammerGain.gain.linearRampToValueAtTime((gong ? 0.15 : 0.35) * velocity, start + 0.003);
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, start + (gong ? 0.12 : 0.05));
  hammer.connect(hammerGain);
  hammerGain.connect(filter);
  // A gentle notch a tenth above the fundamental thins the body of the bell so
  // the strike and the shimmer read, not the honk between them.
  const notch = context.createBiquadFilter();
  notch.type = "peaking";
  notch.frequency.value = Math.min(nyquist, frequency * 2.4);
  notch.Q.value = 1.4;
  notch.gain.value = -7;
  carrier.connect(notch);
  notch.connect(envelope);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(0.9 * velocity, start + (gong ? 0.012 : 0.002));
  filter.frequency.value = Math.min(nyquist, open * (plink ? 1.6 : gong ? 0.6 : 1));
  filter.Q.value = gong ? 1.2 : 0.5;
  return { oscillators: [carrier, modulator, hammer], nodes: [modulation, hammerGain, notch] };
}
export interface VoiceEngineOptions {
  onSuppressed?: (count: number) => void;
}

export function createVoiceEngine(options: VoiceEngineOptions = {}) {
  let state = createInitialState();
  let context: AudioContext | undefined;
  let glue: DynamicsCompressorNode | undefined;
  let makeup: GainNode | undefined;
  let master: DynamicsCompressorNode | undefined;
  let bus: GainNode | undefined;
  let bells: GainNode | undefined;
  let droneBus: GainNode | undefined;
  let output: GainNode | undefined;
  let dry: GainNode | undefined;
  let wet: GainNode | undefined;
  let reverb: ConvolverNode | undefined;
  let reverbView: ViewName | undefined;
  const impulses = new Map<ViewName, AudioBuffer>();
  function configureReverb() {
    if (!context || !reverb || !dry || !wet) return;
    const view = state.activeView ?? "telescope";
    if (reverbView === view && reverb.buffer) return;
    let impulse = impulses.get(view);
    if (!impulse) {
      impulse = reverbImpulse(context, view);
      impulses.set(view, impulse);
    }
    reverb.buffer = impulse;
    reverbView = view;
    applyMix();
  }
  /** Levels from the mix: bells, drone, and the room, with the pool a touch wetter. */
  function applyMix() {
    const mix = sharedMix.getMix();
    const view = state.activeView ?? "telescope";
    const amount = Math.min(0.9, mix.reverb * (view === "pool" ? 1.3 : 1));
    if (dry) dry.gain.value = 1 - amount * 0.6;
    if (wet) wet.gain.value = amount;
    if (bells) bells.gain.value = mix.bells * 1.6;
    if (droneBus) droneBus.gain.value = mix.drone;
  }
  const unsubscribeMix = sharedMix.subscribe(applyMix);
  let enabled = false;
  let liveOffsets: Readonly<Record<string, number>> | undefined;
  /**
   * The drone is a chord of held strings, not a note: the sun's root two
   * octaves down, the fifth above it, the root an octave down, and the scale's
   * tenth above the sun, quiet and wide, the way the strings sit under Ives' The
   * Unanswered Question. It glides when the comet moves the root.
   */
  let drone:
    | {
        strings: { oscillators: OscillatorNode[]; interval: number }[];
        nodes: AudioNode[];
        filter: BiquadFilterNode;
        gain: GainNode;
        midi: number;
      }
    | undefined;
  let shades: number[] = [];
  /**
   * The warble: one sine, at the wobble's rate, whose depth is thrown up by a
   * strike on the sun and decays as the sphere settles. It leans on the pitch
   * of one triangle in each pair and on the lowpass, so what is seen is heard.
   */
  let warble:
    | {
        lfo: OscillatorNode;
        depth: GainNode;
        droneDetune: GainNode;
        droneCutoff: GainNode;
      }
    | undefined;
  /** The drone's lowpass as last set, so the warble's swing can scale with it. */
  let droneCutoff = 400;
  function ensureWarble() {
    if (warble || !context) return warble;
    const now = context.currentTime;
    const lfo = context.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = WOBBLE_RATE / (2 * Math.PI);
    const depth = context.createGain();
    depth.gain.value = 0;
    const droneDetune = context.createGain();
    droneDetune.gain.value = DRONE_WARBLE_CENTS;
    const droneCutoffGain = context.createGain();
    droneCutoffGain.gain.value = droneCutoff * DRONE_WARBLE_SWING;
    lfo.connect(depth);
    depth.connect(droneDetune);
    depth.connect(droneCutoffGain);
    lfo.start(now);
    warble = { lfo, depth, droneDetune, droneCutoff: droneCutoffGain };
    return warble;
  }
  function stopWarble() {
    if (!warble) return;
    warble.lfo.stop();
    for (const node of [warble.lfo, warble.depth, warble.droneDetune, warble.droneCutoff])
      node.disconnect();
    warble = undefined;
  }
  /** A strike on the sun sets the warble swinging; it settles as the sphere does. */
  function strikeWarble(start: number, velocity: number, decay: number) {
    const unit = ensureWarble();
    if (!unit) return;
    unit.depth.gain.setValueAtTime(0.3 + 0.7 * velocity, start);
    unit.depth.gain.setTargetAtTime(0, start, decay / 3);
  }
  /**
   * The ensemble's spread, 0 drawn in to 1 flung out, eased so the orchestration
   * tilts rather than jumps: the sun's pad and drone warm and open as the bodies
   * draw in; the moons brighten and thin as they fly out.
   */
  let spread = 0.5;
  function stopDrone() {
    if (!drone) return;
    for (const string of drone.strings)
      for (const oscillator of string.oscillators) {
        oscillator.stop();
        oscillator.disconnect();
      }
    for (const node of drone.nodes) node.disconnect();
    drone.filter.disconnect();
    drone.gain.disconnect();
    drone = undefined;
    stopWarble();
  }
  /** The chord's intervals from the sun's note, with the tenth taken from the scale. */
  function droneIntervals(): number[] {
    const third = state.scale.includes(3) ? 3 : state.scale.includes(4) ? 4 : 7;
    return [-24, -17, -12, 12 + third];
  }
  /** How loud each string of the chord is, bottom to top; the whole breathes with the tilt. */
  const DRONE_LEVELS = [0.04, 0.022, 0.02, 0.012];
  /** How far the warble bends one triangle of each drone string, in cents, at full depth. */
  const DRONE_WARBLE_CENTS = 7;
  /** How far the warble swings the drone's lowpass, as a share of its cutoff. */
  const DRONE_WARBLE_SWING = 0.35;
  /** The same for the struck pad: its second triangle bends, its lowpass sweeps. */
  const PAD_WARBLE_CENTS = 10;
  const PAD_WARBLE_SWING = 0.3;
  function updateFrame(
    pitchOffsets: Readonly<Record<string, number>>,
    time: number,
    contacts: readonly Contact[] = [],
    spreadNow = spread,
  ) {
    liveOffsets = pitchOffsets;
    shades = [...shades, ...contacts.map((contact) => contact.shade)].slice(-16);
    spread += (Math.max(0, Math.min(1, spreadNow)) - spread) * 0.05;
    if (state.soundEnabled && state.activeView) updateDrone(time);
  }
  function updateDrone(time = 0) {
    if (!enabled || !context || !bus || context.state !== "running") return;
    const sun = state.bodies.find((body) => body.parentId === null);
    if (!sun) return;
    const view = state.activeView ?? "telescope";
    const midi = soundingPitch(state, sun.id, view, 0, liveOffsets);
    const now = context.currentTime;
    const near = 1 - spread;
    if (!drone) {
      const audio = context;
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.3;
      // The drone's EQ: the sub and the top of the chord are wanted; the hoot
      // between them is not. A shallow notch through the upper bass lowers it
      // a little, and a highpass under the sub keeps rumble out.
      const rumble = audio.createBiquadFilter();
      rumble.type = "highpass";
      rumble.frequency.value = 32;
      rumble.Q.value = 0.5;
      const hum = audio.createBiquadFilter();
      hum.type = "peaking";
      hum.frequency.value = 130;
      hum.Q.value = 1.2;
      hum.gain.value = -4;
      rumble.connect(hum);
      hum.connect(filter);
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.7 + 0.6 * near, now + 2.5);
      const nodes: AudioNode[] = [rumble, hum];
      const swing = ensureWarble();
      swing?.droneCutoff.connect(filter.frequency);
      const strings = droneIntervals().map((interval, index) => {
        const frequency = midiToHz(midi + interval);
        const level = audio.createGain();
        level.gain.value = DRONE_LEVELS[index] ?? 0.01;
        level.connect(rumble);
        nodes.push(level);
        // Two triangles a few cents apart carry each string; under the low ones a
        // quiet sawtooth, mostly closed off by the lowpass, gives the grain of a bow.
        const parts: { type: OscillatorType; cents: number; gain: number }[] = [
          { type: "triangle", cents: -4, gain: 1 },
          { type: "triangle", cents: 4, gain: 1 },
        ];
        if (index < 2) parts.push({ type: "sawtooth", cents: 0, gain: 0.22 });
        const oscillators = parts.map((part) => {
          const oscillator = audio.createOscillator();
          oscillator.type = part.type;
          oscillator.frequency.value = frequency;
          oscillator.detune.value = part.cents;
          if (part.cents > 0) swing?.droneDetune.connect(oscillator.detune);
          if (part.gain === 1) oscillator.connect(level);
          else {
            const bow = audio.createGain();
            bow.gain.value = part.gain;
            oscillator.connect(bow);
            bow.connect(level);
            nodes.push(bow);
          }
          oscillator.start(now);
          return oscillator;
        });
        return { oscillators, interval };
      });
      filter.connect(gain);
      gain.connect(droneBus ?? bus);
      drone = { strings, nodes, filter, gain, midi };
    }
    if (drone.midi !== midi) {
      // Strings slide, they do not step.
      for (const string of drone.strings)
        for (const oscillator of string.oscillators)
          oscillator.frequency.setTargetAtTime(
            midiToHz(midi + string.interval),
            now + LOOKAHEAD,
            1.2,
          );
      drone.midi = midi;
    }
    const shade = shades.reduce((sum, value) => sum + value, 0) / Math.max(1, shades.length);
    const cutoff =
      (view === "pool" ? 350 : 600) *
      (0.5 + 1.3 * near) *
      (1 + 0.15 * Math.sin(time / 13)) *
      (1 - 0.6 * shade);
    drone.filter.frequency.setTargetAtTime(cutoff, now, 2);
    drone.gain.gain.setTargetAtTime(0.7 + 0.6 * near, now, 2);
    droneCutoff = cutoff;
    warble?.droneCutoff.gain.setTargetAtTime(cutoff * DRONE_WARBLE_SWING, now, 2);
  }
  let generation = 0;
  let mapping: { simulation: number; audio: number } | undefined;
  let needsFreshEpoch = false;
  let epochCutoff = Number.NEGATIVE_INFINITY;
  let lastSimulationTime = Number.NEGATIVE_INFINITY;
  let seen = new Set<string>();
  const voices = new Set<Excitation>();
  function release(voice: Excitation) {
    for (const oscillator of voice.oscillators) {
      oscillator.onended = null;
      oscillator.stop();
    }
    for (const node of voice.nodes) node.disconnect();
    voice.unplug?.();
    voices.delete(voice);
  }
  function cancel() {
    if (mapping) needsFreshEpoch = true;
    for (const voice of voices) release(voice);
    mapping = undefined;
    lastSimulationTime = Number.NEGATIVE_INFINITY;
    seen = new Set();
  }
  async function enable(): Promise<void> {
    const request = ++generation;
    if (!context) {
      context = new AudioContext();
      // Two stages tame the sum. The glue is gentle and slow: it leans on the
      // loud cascades so the small ornaments underneath come forward, and the
      // makeup gain lifts the whole. The limiter after it is a brick wall for
      // whatever the glue lets through.
      glue = context.createDynamicsCompressor();
      glue.threshold.value = -30;
      glue.knee.value = 18;
      glue.ratio.value = 3.5;
      glue.attack.value = 0.012;
      glue.release.value = 0.3;
      makeup = context.createGain();
      makeup.gain.value = 1.7;
      master = context.createDynamicsCompressor();
      master.threshold.value = -6;
      master.knee.value = 0;
      master.ratio.value = 20;
      master.attack.value = 0.002;
      master.release.value = 0.12;
      bus = context.createGain();
      bells = context.createGain();
      droneBus = context.createGain();
      bells.connect(bus);
      droneBus.connect(bus);
      dry = context.createGain();
      wet = context.createGain();
      reverb = context.createConvolver();
      output = context.createGain();
      // Post-compressor trim includes transient overshoot in the measured peak budget.
      output.gain.value = 0.85;
      bus.connect(dry);
      dry.connect(glue);
      bus.connect(reverb);
      reverb.connect(wet);
      wet.connect(glue);
      glue.connect(makeup);
      makeup.connect(master);
      master.connect(output);
      output.connect(context.destination);
      context.onstatechange = () => {
        if (context?.state !== "running") {
          cancel();
          stopDrone();
        }
      };
    }
    cancel();
    await context.resume();
    if (request === generation) {
      enabled = context.state === "running";
      configureReverb();
      if (output) output.gain.value = 0.85;
      applyMix();
      updateDrone();
    }
  }
  function disable() {
    generation++;
    enabled = false;
    stopDrone();
    if (output) output.gain.value = 0;
    if (reverb) reverb.buffer = null;
    cancel();
  }
  function setState(next: InstrumentState) {
    if (!validateState(next).ok) return;
    const replaced = next.arrangement !== state.arrangement;
    const reset =
      replaced ||
      !next.soundEnabled ||
      next.activeView !== state.activeView ||
      next.maxVoices < state.maxVoices;
    if (replaced) {
      liveOffsets = undefined;
      shades = [];
    }
    state = next;
    if (reset) {
      cancel();
      stopDrone();
    }
    if (enabled && state.soundEnabled && state.activeView) {
      configureReverb();
      updateDrone();
    }
  }
  /**
   * A body's patch follows its place in the tree, the way an ensemble is cast
   * by section: the sun is a pad (bowed, slow to bloom, held), planets are
   * plucks (a harp string: bright for an instant, then a plain ringing
   * fundamental), and moons are bells (the metallophone: gongs when heavy and
   * low, plinks when small or high). Every patch is three oscillators feeding one
   * envelope and one lowpass, so the voice budget is the same whatever is cast.
   */
  function excite(
    midi: number,
    velocity: number,
    view: ViewName,
    start: number,
    duration: number,
    shade: number,
    weight = 0.5,
    role: Role = "moon",
  ) {
    if (!context || !bus) return;
    // The struck sun breathes longer than its mass alone would give it.
    if (role === "sun") duration *= 1.4;
    const frequency = midiToHz(midi);
    if (!Number.isFinite(frequency) || frequency <= 0 || frequency >= context.sampleRate / 2)
      return;
    const nyquist = context.sampleRate * 0.45;
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    const open = view === "pool" ? 1200 + 1800 * velocity ** 2 : 2500 + 4000 * velocity ** 2;
    const lit = 1 - 0.88 * Math.max(0, Math.min(1, shade));
    const patch: Patch = {
      context,
      frequency,
      velocity,
      start,
      duration,
      nyquist,
      envelope,
      filter,
    };
    // The tilt: drawn in, the sun opens; flung out, the moons do.
    const cast =
      role === "sun"
        ? pad(patch, open * lit * (0.5 + 1.0 * (1 - spread)))
        : role === "planet"
          ? pluck(patch, open * lit)
          : bell(patch, open * lit * (0.55 + 0.9 * spread), weight, midi);
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration - 0.025);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    // Every tone darkens as it rings, the way a pedaled string loses its top first.
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, frequency * 1.5), start + duration);
    envelope.connect(filter);
    filter.connect(bells ?? bus);
    const voice: Excitation = {
      start,
      end: start + duration,
      oscillators: cast.oscillators,
      nodes: [...cast.oscillators, ...cast.nodes, envelope, filter],
    };
    if (role === "sun") {
      // The sphere's ripple decays without the mass and closing the tone hears.
      const wobble = decayFor(midi, velocity, undefined, 0, state.anchorMidi);
      strikeWarble(start, velocity, wobble);
      const swing = ensureWarble();
      const other = cast.oscillators[1];
      if (swing && other) {
        const bend = context.createGain();
        bend.gain.value = PAD_WARBLE_CENTS;
        const sweep = context.createGain();
        sweep.gain.value = open * lit * PAD_WARBLE_SWING;
        swing.depth.connect(bend);
        swing.depth.connect(sweep);
        bend.connect(other.detune);
        sweep.connect(filter.frequency);
        voice.nodes.push(bend, sweep);
        voice.unplug = () => {
          swing.depth.disconnect(bend);
          swing.depth.disconnect(sweep);
        };
      }
    }
    voices.add(voice);
    const carrier = cast.oscillators[0];
    if (carrier) carrier.onended = () => release(voice);
    for (const oscillator of voice.oscillators) {
      oscillator.start(start);
      oscillator.stop(voice.end);
    }
  }
  function scheduleContacts(
    contacts: readonly Contact[],
    view: ViewName,
    simulationTimeNow: number,
  ) {
    if (
      !enabled ||
      !state.soundEnabled ||
      state.activeView !== view ||
      !context ||
      context.state !== "running"
    ) {
      cancel();
      return;
    }
    if (!Number.isFinite(simulationTimeNow)) return;
    const now = context.currentTime;
    if (
      !mapping ||
      simulationTimeNow < lastSimulationTime ||
      Math.abs(simulationTimeNow - mapping.simulation - (now - mapping.audio)) > 0.25
    ) {
      cancel();
      mapping = { simulation: simulationTimeNow, audio: now };
      if (needsFreshEpoch) epochCutoff = simulationTimeNow;
      needsFreshEpoch = false;
    }
    lastSimulationTime = simulationTimeNow;
    for (const voice of voices) if (voice.end <= now) release(voice);
    // Merge each body's contacts within a fixed simulation tick; keep the strongest velocity.
    const batches = new Map<
      number,
      Map<
        string,
        {
          midi: number;
          velocity: number;
          time: number;
          weight: number;
          closing: number;
          shade: number;
        }
      >
    >();
    for (const contact of contacts) {
      if (
        !Number.isFinite(contact.time) ||
        contact.time <= epochCutoff ||
        contact.time < simulationTimeNow - LOOKAHEAD ||
        contact.time > simulationTimeNow ||
        !Number.isFinite(contact.intensity) ||
        contact.intensity <= 0
      )
        continue;
      const tick = Math.floor((contact.time + 1e-9) * 240);
      let batch = batches.get(tick);
      if (!batch) {
        batch = new Map();
        batches.set(tick, batch);
      }
      for (const [id, pitch] of [
        [contact.a, contact.pitchA],
        [contact.b, contact.pitchB],
      ] as const) {
        if (!state.bodies.some((body) => body.id === id) || !Number.isFinite(pitch)) continue;
        const velocity = Math.min(1, contact.intensity);
        const previous = batch.get(id);
        if (!previous || velocity > previous.velocity)
          batch.set(id, {
            midi: view === "pool" ? 2 * state.anchorMidi - pitch : pitch,
            velocity,
            time: contact.time,
            weight: contact.weight,
            closing: contact.closing,
            shade: contact.shade,
          });
      }
    }
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    let suppressed = 0;
    for (const [tick, batch] of [...batches].sort(([a], [b]) => a - b)) {
      for (const [id, note] of [...batch].sort(([, a], [, b]) => b.velocity - a.velocity)) {
        const key = `${tick}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const start = mapping.audio + note.time - mapping.simulation + LOOKAHEAD;
        if (start < now) continue;
        const duration = decayFor(
          note.midi,
          note.velocity,
          note.weight,
          note.closing,
          state.anchorMidi,
        );
        const overlapping = [...voices].filter(
          (voice) => voice.start < start + duration && voice.end > start,
        ).length;
        if (overlapping >= state.maxVoices) {
          suppressed++;
          continue;
        }
        const body = byId.get(id);
        const role = body ? roleOf(depthOf(body, byId)) : "moon";
        excite(note.midi, note.velocity, view, start, duration, note.shade, note.weight, role);
      }
    }
    // Retain only the deduplication window that can still be scheduled.
    for (const key of seen)
      if (Number(key.slice(0, key.indexOf(":"))) / 240 < simulationTimeNow - LOOKAHEAD)
        seen.delete(key);
    if (suppressed) options.onSuppressed?.(suppressed);
  }
  function dispose() {
    unsubscribeMix();
    disable();
  }
  return { enable, disable, setState, scheduleContacts, updateFrame, dispose };
}
