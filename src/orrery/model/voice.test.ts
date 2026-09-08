import { test } from "bun:test";
import { createVoiceEngine, decayFor, reverbImpulse, WOBBLE_RATE } from "../audio/voice";
import { sharedMix } from "../mix";
import { addBody, applyPreset, setActiveView, setSoundEnabled } from "./commands";
import { midiToHz } from "./pitch";
import { createEmptyState as createInitialState, laFolia } from "./presets";
import { createSimulation } from "./simulation";
import type { Contact } from "./types";

/** decayFor scales by the mix's ring; tests measure the bare curve at a ring of one. */
sharedMix.setLevel("decay", 1);
const RING = 1.6;

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

test("decay decreases smoothly across the register and meets the three duration targets", () => {
  for (const velocity of [0, 0.5, 1]) {
    for (let midi = 34; midi <= 82; midi += 0.25) {
      const duration = decayFor(midi, velocity) / RING;
      assert(duration <= decayFor(midi - 0.25, velocity) / RING);
      assert(Math.abs(duration - decayFor(midi - 0.0001, velocity) / RING) < 0.0001);
      if (midi <= 46) assert(duration >= 5 && duration <= 6.25);
      if (midi === 58) assert(duration >= 2.2 && duration <= 2.75);
      if (midi >= 70) assert(duration >= 0.5 && duration <= 0.625);
    }
  }
});

test("velocity lengthens decay monotonically by at most 25 percent", () => {
  for (let midi = 34; midi <= 82; midi++) {
    const base = decayFor(midi, 0);
    let previous = base;
    for (const velocity of [0, 0.25, 0.5, 0.75, 1, 2]) {
      const duration = decayFor(midi, velocity);
      assert(duration >= previous && duration <= base * 1.25 + 1e-9);
      previous = duration;
    }
    assert(decayFor(midi, -1) === base);
    assert(Math.abs(decayFor(midi, 1) - base * 1.25) < 1e-12);
  }
});

test("audio merges dyads, caps new voices, mirrors pool pitch, and cancels without backlog", async () => {
  const original = globalThis.AudioContext;
  const parameter = () => ({
    value: 0,
    targets: [] as number[],
    /** Values programmed on the timeline, in order. */
    scheduled: [] as number[],
    setTargetAtTime(value: number) {
      this.targets.push(value);
    },
    setValueAtTime(value: number) {
      this.scheduled.push(value);
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const oscillators: {
    frequency: ReturnType<typeof parameter>;
    starts: number[];
    stops: (number | undefined)[];
  }[] = [];
  const drones: typeof oscillators = [];
  const filters: { frequency: ReturnType<typeof parameter>; type: string }[] = [];
  let created = 0;
  const context = {
    currentTime: 10,
    state: "running",
    sampleRate: 48000,
    destination: node(),
    onstatechange: undefined as (() => void) | undefined,
    async resume() {
      context.state = "running";
    },
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
    }),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length),
    }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createGain: () => ({ ...node(), gain: parameter() }),
    createBiquadFilter: () => {
      const frequency = parameter();
      const filter = { ...node(), frequency, Q: parameter(), gain: parameter(), type: "lowpass" };
      filters.push(filter);
      return filter;
    },
    createOscillator: () => {
      const oscillator = {
        ...node(),
        frequency: parameter(),
        detune: parameter(),
        type: "sine",
        starts: [] as number[],
        stops: [] as (number | undefined)[],
        onended: null,
        start(time: number) {
          oscillator.starts.push(time);
          // Drone strings start now; struck voices start a lookahead later.
          if (time === context.currentTime) {
            oscillators.splice(oscillators.indexOf(oscillator), 1);
            drones.push(oscillator);
          }
        },
        stop(time?: number) {
          oscillator.stops.push(time);
        },
      };
      oscillators.push(oscillator);
      return oscillator;
    },
  };
  function MockAudioContext() {
    created++;
    return context;
  }
  globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  try {
    let suppressed = 0;
    const engine = createVoiceEngine({
      onSuppressed: (count) => {
        suppressed += count;
      },
    });
    assert(created === 0, "AudioContext must be lazy.");
    const state = {
      ...setSoundEnabled(
        setActiveView(addBody(addBody(createInitialState(), "sun"), "sun"), "pool"),
        true,
      ),
      maxVoices: 2,
    };
    engine.setState(state);
    await engine.enable();
    assert(
      drones.length >= 8 && drones.every((oscillator) => oscillator.starts[0] === 10),
      "The drone is a chord of at least four strings, each at least two oscillators.",
    );
    assert(
      drones.some(
        (oscillator) => Math.abs(oscillator.frequency.value - WOBBLE_RATE / (2 * Math.PI)) < 1e-9,
      ),
      "The warble's sine runs at the sphere's wobble rate.",
    );
    engine.updateFrame({ sun: 7 }, 1, []);
    const litCutoff = filters[0]?.frequency.targets.at(-1) ?? 0;
    const lowest = Math.min(
      ...drones.map((oscillator) => oscillator.frequency.targets.at(-1) ?? 1e9),
    );
    assert(
      Math.abs(lowest - midiToHz(51 - 24)) < 1e-8,
      "The drone's bottom string must follow the live sun pitch two octaves down.",
    );
    const contacts: Contact[] = [
      {
        time: 1,
        a: "sun",
        b: "body-1",
        pitchA: 53,
        pitchB: 60,
        intensity: 0.2,
        weight: 0,
        shade: 0,
        closing: 0,
      },
      {
        time: 1,
        a: "body-1",
        b: "body-2",
        pitchA: 60,
        pitchB: 65,
        intensity: 0.8,
        weight: 0,
        shade: 0,
        closing: 0,
      },
    ];
    engine.updateFrame(
      { sun: 7 },
      1,
      contacts.map((contact) => ({ ...contact, shade: 1 })),
    );
    assert(
      (filters[0]?.frequency.targets.at(-1) ?? 1000) < litCutoff * 0.5,
      "Recent shade must darken the drone filter.",
    );
    engine.scheduleContacts(contacts, "pool", 1);
    assert(oscillators.length === 6, "Two FM voices must each have three oscillators.");
    assert(suppressed === 1, "The quiet sun excitation must be suppressed.");
    assert(Math.abs((oscillators[0]?.frequency.value ?? 0) - midiToHz(56)) < 1e-8);
    assert(Math.abs((oscillators[3]?.frequency.value ?? 0) - midiToHz(51)) < 1e-8);
    assert(oscillators.every((oscillator) => oscillator.starts[0] === 10.1));
    // Every voice's lowpass opens above its fundamental and under Nyquist, whatever the patch.
    for (const [index, midi] of [56, 51].entries()) {
      // Struck voices own the lowpasses that are never retargeted; the drone's EQ is not one.
      const filter = filters.filter(
        (candidate) => candidate.type === "lowpass" && candidate.frequency.targets.length === 0,
      )[index]?.frequency;
      const opening = filter?.scheduled[0] ?? filter?.value ?? 0;
      assert(
        opening > midiToHz(midi) && opening < 48000 * 0.45,
        `Voice ${index} opens at ${opening}.`,
      );
    }
    for (const [index, midi] of [56, 56, 56, 51, 51, 51].entries()) {
      assert(oscillators[index]?.stops[0] === 10.1 + decayFor(midi, 0.8));
    }
    engine.scheduleContacts(contacts, "pool", 1);
    assert(
      oscillators.length === 6 && suppressed === 1,
      "Repeated scheduling must not duplicate notes.",
    );
    engine.disable();
    assert(drones.every((oscillator) => oscillator.stops.includes(undefined)));
    assert(
      oscillators.every((oscillator) => oscillator.stops.includes(undefined)),
      "Disable must stop future voices.",
    );
    await engine.enable();
    engine.scheduleContacts(contacts, "pool", 1);
    assert(oscillators.length === 6, "Reenable must not replay the old batch.");
    context.currentTime += 0.02;
    engine.scheduleContacts([{ ...(contacts[0] as Contact), time: 1.02 }], "pool", 1.02);
    assert(Number(oscillators.length) === 12, "Fresh contacts must sound after reenable.");
    context.state = "suspended";
    context.onstatechange?.();
    context.currentTime += 4;
    context.state = "running";
    engine.scheduleContacts([{ ...(contacts[0] as Contact), time: 1.04 }], "pool", 1.05);
    assert(Number(oscillators.length) === 12, "Suspension must discard even a recent backlog.");
    engine.disable();

    await engine.enable();
    engine.scheduleContacts([], "pool", 4.99);
    context.currentTime += 0.01;
    const before = oscillators.length;
    const suppressedBefore = suppressed;
    const mixed: Contact = {
      time: 5,
      a: "sun",
      b: "body-1",
      pitchA: 70,
      pitchB: 46,
      intensity: 1,
      weight: 0,
      shade: 0,
      closing: 0,
    };
    engine.scheduleContacts([{ ...mixed, shade: 1 }], "pool", 5);
    // Full shade leaves an eighth of the light: a hard hit in the pool opens at 3000 Hz lit.
    const shaded = filters.at(-1)?.frequency;
    const shadedOpening = shaded?.scheduled[0] ?? shaded?.value ?? 0;
    assert(
      shadedOpening > 0 && shadedOpening < 3000 * 0.25,
      `Shaded voice opens at ${shadedOpening}.`,
    );
    assert(oscillators.length === before + 6);
    context.currentTime += 1.1;
    engine.scheduleContacts([{ ...mixed, time: 6.1 }], "pool", 6.1);
    assert(oscillators.length === before + 9, "The short voice must free a slot early.");
    assert(suppressed === suppressedBefore + 1, "The low sustain must still occupy a slot.");
    context.currentTime += 1;
    engine.scheduleContacts([{ ...mixed, time: 7.1 }], "pool", 7.1);
    assert(oscillators.length === before + 9, "Both low sustains must outlive one second.");
    assert(suppressed === suppressedBefore + 3);
    // The sun's own note breathes 1.4 times longer than its register alone would give it.
    context.currentTime += 16;
    engine.scheduleContacts([{ ...mixed, time: 23.1 }], "pool", 23.1);
    assert(oscillators.length === before + 15, "Expired low sustains must free both slots.");
    engine.disable();
    const fullState = { ...state, maxVoices: 12 };
    while (fullState.bodies.length < 14) {
      fullState.bodies = addBody(fullState, "sun").bodies;
    }
    engine.setState(fullState);
    await engine.enable();
    context.currentTime += 1;
    engine.scheduleContacts([], "pool", 10);
    context.currentTime += 0.01;
    const startCount = oscillators.length;
    const suppressionCount = suppressed;
    engine.scheduleContacts(
      Array.from({ length: 7 }, (_, i) => ({
        time: 10.01,
        a: fullState.bodies[i * 2]?.id ?? "missing",
        b: fullState.bodies[i * 2 + 1]?.id ?? "missing",
        pitchA: 58,
        pitchB: 65,
        intensity: 0.8,
        weight: 0,
        shade: 0,
        closing: 0,
      })),
      "pool",
      10.01,
    );
    assert(oscillators.length === startCount + 36, "Twelve FM voices must be admitted.");
    assert(
      suppressed === suppressionCount + 2,
      "The thirteenth and fourteenth voices must be suppressed.",
    );
    engine.setState(applyPreset(fullState, "lily-pads"));
    assert(
      oscillators.slice(startCount).every((oscillator) => oscillator.stops.includes(undefined)),
      "Changing ensemble must cancel its old scheduled voices.",
    );
    engine.disable();
    const folia = { ...laFolia(), soundEnabled: true, activeView: "telescope" as const };
    engine.setState(folia);
    await engine.enable();
    const simulation = createSimulation(folia);
    const suppressedAtStart = suppressed;
    engine.scheduleContacts([], "telescope", 20);
    const oscillatorCount = oscillators.length;
    let contactCount = 0;
    for (let tick = 1; tick <= 1200; tick++) {
      context.currentTime += 0.05;
      const events = simulation.advance(0.05).flatMap((frame) => frame.contacts);
      contactCount += events.length;
      engine.scheduleContacts(
        events.map((contact) => ({ ...contact, time: contact.time + 20 })),
        "telescope",
        20 + tick * 0.05,
      );
    }
    assert(contactCount >= 90 && contactCount <= 200);
    assert(
      oscillators.length >= oscillatorCount + contactCount * 2,
      "Measured contacts must actually create voices.",
    );
    assert(
      suppressed === suppressedAtStart,
      "The opener must keep its long tails within 32 voices.",
    );
    engine.disable();
  } finally {
    if (original) globalThis.AudioContext = original;
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});

test("contact mass lengthens tails and raw closing speed shortens them", () => {
  const gong = decayFor(38, 0.1, 1, 0.4, 50) / RING;
  const anchor = decayFor(50, 0.5, 0.2, 1, 50) / RING;
  const ornament = decayFor(74, 1, 0.1, 4, 50) / RING;
  assert(gong >= 6 && gong <= 10);
  assert(anchor >= 2 && anchor <= 3);
  assert(ornament >= 0.4 && ornament <= 0.8);
  for (const midi of [38, 58, 76]) {
    assert(decayFor(midi, 0.5, 1, 1) >= decayFor(midi, 0.5, 0, 1));
    assert(decayFor(midi, 0.5, 1, 0) >= decayFor(midi, 0.5, 1, 5));
  }
});

test("Folia gongs retain long tails through root changes and all its small ornaments stay short", () => {
  const state = laFolia();
  const events = createSimulation(state)
    .advance(128)
    .flatMap((frame) => frame.contacts);
  for (const contact of events) {
    for (const [id, midi] of [
      [contact.a, contact.pitchA],
      [contact.b, contact.pitchB],
    ] as const) {
      const duration =
        (decayFor(midi, contact.intensity, contact.weight, contact.closing, state.anchorMidi) /
          RING) *
        1.6;
      if (id.startsWith("bass-gong") && contact.a !== "comet" && contact.b !== "comet")
        assert(duration >= 9.6 && duration <= 16, `${id}: ${duration}`);
      if (id.startsWith("soprano-") || id.startsWith("silver-"))
        assert(duration >= 0.64 && duration <= 2, `${id}: ${duration}`);
    }
  }
}, 30000);

test("synthetic reverb has distinct stereo tails, duration, darkness, and decay", () => {
  const context = {
    sampleRate: 8000,
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        length,
        sampleRate,
        numberOfChannels: channels,
        getChannelData: (channel: number) => data[channel],
      } as AudioBuffer;
    },
  };
  const telescope = reverbImpulse(context, "telescope");
  const pool = reverbImpulse(context, "pool");
  assert(telescope.length === 32000 && pool.length === 56000);
  for (const buffer of [telescope, pool]) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    assert(left.some((value, i) => value !== right[i]));
    const energy = (data: Float32Array) => data.reduce((sum, value) => sum + value * value, 0);
    assert(energy(left.slice(0, 8000)) > energy(left.slice(-8000)) * 100);
    assert(left.every(Number.isFinite));
  }
  const roughness = (buffer: AudioBuffer) => {
    const data = buffer.getChannelData(0).slice(100, 8000);
    return (
      data.reduce((sum, value, i) => sum + (value - (data[i - 1] ?? value)) ** 2, 0) /
      data.reduce((sum, value) => sum + value * value, 0)
    );
  };
  assert(roughness(pool) < roughness(telescope));
});
