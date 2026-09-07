import { createInitialState } from "../model/commands";
import { midiToHz } from "../model/pitch";
import type { Contact, InstrumentState, ViewName } from "../model/types";
import { validateState } from "../model/validate";

const LOOKAHEAD = 0.1;
const DURATION = 1.0;
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
  let enabled = false;
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
      master.connect(context.destination);
      context.onstatechange = () => {
        if (context?.state !== "running") cancel();
      };
    }
    cancel();
    await context.resume();
    if (request === generation) enabled = context.state === "running";
  }
  function disable() {
    generation++;
    enabled = false;
    cancel();
  }
  function setState(next: InstrumentState) {
    if (!validateState(next).ok) return;
    const reset =
      !next.soundEnabled ||
      next.activeView !== state.activeView ||
      next.maxVoices < state.maxVoices;
    state = next;
    if (reset) cancel();
  }
  function excite(midi: number, velocity: number, view: ViewName, start: number) {
    if (!context || !master) return;
    const frequency = midiToHz(midi);
    if (!Number.isFinite(frequency) || frequency <= 0 || frequency >= context.sampleRate / 2)
      return;
    // A struck bell, restrained: an inharmonic FM partial that brightens with the
    // strike and dies quickly, over a long, quiet fundamental. Harder strikes are
    // brighter, not just louder.
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modulation = context.createGain();
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const nyquist = context.sampleRate * 0.45;
    carrier.frequency.value = frequency;
    modulator.frequency.value = Math.min(frequency * 2.7, nyquist);
    modulation.gain.setValueAtTime(frequency * (0.15 + 1.05 * velocity ** 2), start);
    modulation.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
    modulator.connect(modulation);
    modulation.connect(carrier.frequency);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.045 * velocity, start + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.00001, start + DURATION - 0.025);
    envelope.gain.linearRampToValueAtTime(0, start + DURATION);
    filter.type = "lowpass";
    filter.frequency.value = Math.min(
      nyquist,
      view === "pool" ? 1200 + 1800 * velocity ** 2 : 2500 + 4000 * velocity ** 2,
    );
    filter.Q.value = 0.5;
    carrier.connect(envelope);
    envelope.connect(filter);
    filter.connect(master);
    const voice: Excitation = {
      start,
      end: start + DURATION,
      oscillators: [carrier, modulator],
      nodes: [carrier, modulator, modulation, envelope, filter],
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
      Map<string, { midi: number; velocity: number; time: number }>
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
        const overlapping = [...voices].filter(
          (voice) => voice.start < start + DURATION && voice.end > start,
        ).length;
        if (overlapping >= state.maxVoices) {
          suppressed++;
          continue;
        }
        excite(note.midi, note.velocity, view, start);
      }
    }
    // Retain only the deduplication window that can still be scheduled.
    for (const key of seen)
      if (Number(key.slice(0, key.indexOf(":"))) / 240 < simulationTimeNow - LOOKAHEAD)
        seen.delete(key);
    if (suppressed) options.onSuppressed?.(suppressed);
  }
  return { enable, disable, setState, scheduleContacts };
}
