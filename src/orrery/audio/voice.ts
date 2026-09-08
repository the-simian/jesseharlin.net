import { sharedMix } from "../mix";
import { createInitialState } from "../model/commands";
import { midiToHz, soundingPitch } from "../model/pitch";
import { isPresetReplacement } from "../model/presets";
import type { Contact, InstrumentState, ViewName } from "../model/types";
import { validateState } from "../model/validate";

const LOOKAHEAD = 0.1;
/** Two arguments retain the B-flat register envelope; audio supplies mass, speed, and anchor. */
export function decayFor(
  midi: number,
  velocity: number,
  weight?: number,
  closing = 0,
  anchorMidi = 58,
): number {
  const register = Math.max(46, Math.min(70, midi - anchorMidi + 58));
  const base =
    register <= 58
      ? 5 * (2.2 / 5) ** ((register - 46) / 12)
      : 2.2 * (0.5 / 2.2) ** ((register - 58) / 12);
  const registerDecay = base * (1 + 0.25 * Math.max(0, Math.min(1, velocity)));
  // The mix's ring control scales every decay; its default is already 1.5.
  const ring = 1.6 * sharedMix.getMix().decay;
  if (weight === undefined) return registerDecay * ring;
  return (
    ring *
    Math.max(
      0.4,
      Math.min(
        10,
        (registerDecay + 5 * Math.max(0, Math.min(1, weight)) ** 3) /
          (1 + 0.08 * Math.max(0, closing)),
      ),
    )
  );
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
}
export interface VoiceEngineOptions {
  onSuppressed?: (count: number) => void;
}

export function createVoiceEngine(options: VoiceEngineOptions = {}) {
  let state = createInitialState();
  let context: AudioContext | undefined;
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
  let drone:
    | { oscillators: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode; midi: number }
    | undefined;
  let shades: number[] = [];
  function stopDrone() {
    if (!drone) return;
    for (const oscillator of drone.oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    drone.filter.disconnect();
    drone.gain.disconnect();
    drone = undefined;
  }
  function updateFrame(
    pitchOffsets: Readonly<Record<string, number>>,
    time: number,
    contacts: readonly Contact[] = [],
  ) {
    liveOffsets = pitchOffsets;
    shades = [...shades, ...contacts.map((contact) => contact.shade)].slice(-16);
    if (state.soundEnabled && state.activeView) updateDrone(time);
  }
  function updateDrone(time = 0) {
    if (!enabled || !context || !bus || context.state !== "running") return;
    const sun = state.bodies.find((body) => body.parentId === null);
    if (!sun) return;
    const view = state.activeView ?? "telescope";
    // The drone sits an octave under the sun's note, so the bells ring above it.
    const midi = soundingPitch(state, sun.id, view, 0, liveOffsets) - 12;
    const frequency = midiToHz(midi);
    const now = context.currentTime;
    if (!drone) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.5;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 1.5);
      const audio = context;
      const oscillators = [-4, 4].map((cents) => {
        const oscillator = audio.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = cents;
        oscillator.connect(filter);
        oscillator.start(now);
        return oscillator;
      });
      filter.connect(gain);
      gain.connect(droneBus ?? bus);
      drone = { oscillators, filter, gain, midi };
    }
    if (drone.midi !== midi) {
      for (const oscillator of drone.oscillators)
        oscillator.frequency.setTargetAtTime(frequency, now + LOOKAHEAD, 0.3);
      drone.midi = midi;
    }
    const shade = shades.reduce((sum, value) => sum + value, 0) / Math.max(1, shades.length);
    const cutoff =
      (view === "pool" ? 350 : 600) * (1 + 0.15 * Math.sin(time / 13)) * (1 - 0.6 * shade);
    drone.filter.frequency.setTargetAtTime(cutoff, now, 2);
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
      master = context.createDynamicsCompressor();
      master.threshold.value = -12;
      master.knee.value = 0;
      master.ratio.value = 20;
      master.attack.value = 0.003;
      master.release.value = 0.15;
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
      dry.connect(master);
      bus.connect(reverb);
      reverb.connect(wet);
      wet.connect(master);
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
    const reset =
      isPresetReplacement(state, next) ||
      !next.soundEnabled ||
      next.activeView !== state.activeView ||
      next.maxVoices < state.maxVoices;
    if (isPresetReplacement(state, next)) {
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
  function excite(
    midi: number,
    velocity: number,
    view: ViewName,
    start: number,
    duration: number,
    shade: number,
    weight = 0.5,
  ) {
    if (!context || !bus) return;
    // The struck sun breathes longer than its mass alone would give it.
    if (weight >= 0.99) duration *= 1.4;
    const frequency = midiToHz(midi);
    if (!Number.isFinite(frequency) || frequency <= 0 || frequency >= context.sampleRate / 2)
      return;
    // Three voices by role, the way an ensemble is cast: heavy slow bodies are
    // gongs (deep inharmonic partial, long soft bloom), middle bodies are pedaled
    // strings (hammer transient over a warm fundamental), and small quick bodies
    // are metallophone plinks (bright, short, a little glassy). Weight and register
    // decide the casting, so a body's voice follows its size and its note.
    const register = Math.max(0, Math.min(1, (midi - 40) / 40));
    const gong = weight > 0.6 && register < 0.45;
    // The sun struck: the heaviest body, so it gets the softest hand and the longest breath.
    const sunStruck = weight >= 0.99;
    const plink = weight < 0.3 || register > 0.75;
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const hammer = context.createOscillator();
    const modulation = context.createGain();
    const hammerGain = context.createGain();
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const nyquist = context.sampleRate * 0.45;
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
    hammerGain.gain.linearRampToValueAtTime(
      (sunStruck ? 0.06 : gong ? 0.15 : 0.35) * velocity,
      start + (sunStruck ? 0.02 : 0.003),
    );
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, start + (gong ? 0.12 : 0.05));
    hammer.connect(hammerGain);
    hammerGain.connect(filter);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(
      (sunStruck ? 0.55 : 0.9) * velocity,
      start + (sunStruck ? 0.08 : gong ? 0.012 : 0.002),
    );
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration - 0.025);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    filter.type = "lowpass";
    const open = view === "pool" ? 1200 + 1800 * velocity ** 2 : 2500 + 4000 * velocity ** 2;
    filter.frequency.value = Math.min(
      nyquist,
      open * (plink ? 1.6 : gong ? 0.6 : 1) * (1 - 0.88 * Math.max(0, Math.min(1, shade))),
    );
    // The tone darkens as it rings, the way a pedaled string loses its top first.
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, frequency * 1.5), start + duration);
    filter.Q.value = gong ? 1.2 : 0.5;
    carrier.connect(envelope);
    envelope.connect(filter);
    filter.connect(bells ?? bus);
    const voice: Excitation = {
      start,
      end: start + duration,
      oscillators: [carrier, modulator, hammer],
      nodes: [carrier, modulator, hammer, modulation, hammerGain, envelope, filter],
    };
    voices.add(voice);
    carrier.onended = () => release(voice);
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
        excite(note.midi, note.velocity, view, start, duration, note.shade, note.weight);
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
