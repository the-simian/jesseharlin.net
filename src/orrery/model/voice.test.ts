import { test } from "bun:test";
import { createVoiceEngine } from "../audio/voice";
import { addBody, createInitialState, setActiveView, setSoundEnabled } from "./commands";
import { midiToHz } from "./pitch";
import type { Contact } from "./types";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

test("audio merges dyads, caps new voices, mirrors pool pitch, and cancels without backlog", async () => {
  const original = globalThis.AudioContext;
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const oscillators: {
    frequency: ReturnType<typeof parameter>;
    starts: number[];
    stops: (number | undefined)[];
  }[] = [];
  const filters: ReturnType<typeof parameter>[] = [];
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
    createGain: () => ({ ...node(), gain: parameter() }),
    createBiquadFilter: () => {
      const frequency = parameter();
      filters.push(frequency);
      return { ...node(), frequency, Q: parameter(), type: "lowpass" };
    },
    createOscillator: () => {
      const oscillator = {
        ...node(),
        frequency: parameter(),
        starts: [] as number[],
        stops: [] as (number | undefined)[],
        onended: null,
        start(time: number) {
          oscillator.starts.push(time);
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
    const contacts: Contact[] = [
      { time: 1, a: "sun", b: "body-1", pitchA: 53, pitchB: 60, intensity: 0.2 },
      { time: 1, a: "body-1", b: "body-2", pitchA: 60, pitchB: 65, intensity: 0.8 },
    ];
    engine.scheduleContacts(contacts, "pool", 1);
    assert(oscillators.length === 4, "Two FM voices must each have two oscillators.");
    assert(suppressed === 1, "The quiet sun excitation must be suppressed.");
    assert(Math.abs((oscillators[0]?.frequency.value ?? 0) - midiToHz(54)) < 1e-8);
    assert(Math.abs((oscillators[2]?.frequency.value ?? 0) - midiToHz(49)) < 1e-8);
    assert(oscillators.every((oscillator) => oscillator.starts[0] === 10.1));
    assert(filters.every((filter) => filter.value === 1800));
    engine.scheduleContacts(contacts, "pool", 1);
    assert(
      oscillators.length === 4 && suppressed === 1,
      "Repeated scheduling must not duplicate notes.",
    );
    engine.disable();
    assert(
      oscillators.every((oscillator) => oscillator.stops.includes(undefined)),
      "Disable must stop future voices.",
    );
    await engine.enable();
    engine.scheduleContacts(contacts, "pool", 1);
    assert(oscillators.length === 4, "Reenable must not replay the old batch.");
    context.currentTime += 0.02;
    engine.scheduleContacts([{ ...(contacts[0] as Contact), time: 1.02 }], "pool", 1.02);
    assert(Number(oscillators.length) === 8, "Fresh contacts must sound after reenable.");
    context.state = "suspended";
    context.onstatechange?.();
    context.currentTime += 4;
    context.state = "running";
    engine.scheduleContacts([{ ...(contacts[0] as Contact), time: 1.04 }], "pool", 1.05);
    assert(Number(oscillators.length) === 8, "Suspension must discard even a recent backlog.");
    engine.disable();
  } finally {
    if (original) globalThis.AudioContext = original;
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
