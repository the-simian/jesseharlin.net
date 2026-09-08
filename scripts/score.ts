/**
 * Render a preset offline: run the simulation, write the contacts as a MIDI
 * file, and print a piano roll and a few musical measurements to the terminal.
 *
 *   bun scripts/score.ts <preset-id> [seconds=120] [view=telescope|pool] [out.mid]
 *
 * The MIDI file opens in Ableton; the terminal roll is for reading a score
 * without ears. Velocity comes from contact intensity; note length from the
 * same decay curve the voice engine uses, so the roll shows what rings.
 */
import { writeFileSync } from "node:fs";
import { decayFor } from "../src/orrery/audio/voice";
import { PRESETS } from "../src/orrery/model/presets";
import { createSimulation } from "../src/orrery/model/simulation";
import type { Contact, InstrumentState } from "../src/orrery/model/types";
import { validateState } from "../src/orrery/model/validate";

const [presetId = PRESETS[0]?.id ?? "", secondsArg = "120", view = "telescope", outArg] =
  process.argv.slice(2);
const seconds = Number(secondsArg);
const ALL = [...PRESETS];
const preset = ALL.find((candidate) => candidate.id === presetId);
if (!preset) {
  console.error(`Unknown preset "${presetId}". Known: ${ALL.map((p) => p.id).join(", ")}`);
  process.exit(1);
}
const state: InstrumentState = preset.build();
const problems = validateState(state);
if (!problems.ok) {
  console.error(`${preset.name} is invalid:\n  ${problems.problems.join("\n  ")}`);
  process.exit(1);
}
const simulation = createSimulation(state);
const contacts: Contact[] = [];
for (let second = 0; second < seconds; second++) {
  for (const frame of simulation.advance(1)) contacts.push(...frame.contacts);
}

type Note = { time: number; midi: number; velocity: number; length: number; body: string };
const mirror = (midi: number) => (view === "pool" ? 2 * state.anchorMidi - midi : midi);
const notes: Note[] = contacts.flatMap((contact) => {
  const extra = contact as Contact & { weight?: number; closing?: number };
  const velocity = Math.round(30 + 97 * Math.min(1, contact.intensity));
  const make = (midi: number, body: string): Note => ({
    time: contact.time,
    midi: mirror(midi),
    velocity,
    length: decayFor(mirror(midi), contact.intensity, extra.weight, extra.closing),
    body,
  });
  return [make(contact.pitchA, contact.a), make(contact.pitchB, contact.b)];
});

// --- MIDI (format 0, one track, 480 ticks per quarter at 120 bpm: 1 s = 960 ticks) ---
const TPQ = 480;
const ticksPerSecond = TPQ * 2;
function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}
type Event = { tick: number; bytes: number[] };
const events: Event[] = [];
for (const note of notes) {
  const midi = Math.max(0, Math.min(127, Math.round(note.midi)));
  const on = Math.round(note.time * ticksPerSecond);
  const off = on + Math.max(1, Math.round(note.length * ticksPerSecond));
  events.push({ tick: on, bytes: [0x90, midi, note.velocity] });
  events.push({ tick: off, bytes: [0x80, midi, 0] });
}
events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
const track: number[] = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]; // tempo 120 bpm
let last = 0;
for (const event of events) {
  track.push(...variableLength(event.tick - last), ...event.bytes);
  last = event.tick;
}
track.push(0x00, 0xff, 0x2f, 0x00);
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const file = new Uint8Array([
  0x4d, 0x54, 0x68, 0x64, ...be32(6), 0, 0, 0, 1, (TPQ >> 8) & 255, TPQ & 255,
  0x4d, 0x54, 0x72, 0x6b, ...be32(track.length), ...track,
]);
const out = outArg ?? `scores/${preset.id}-${view}.mid`;
writeFileSync(out, file);

// --- Terminal piano roll: one column per second, one row per sounding pitch ---
const pitches = [...new Set(notes.map((n) => Math.round(n.midi)))].sort((a, b) => b - a);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const name = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const columns = Math.min(seconds, 120);
console.log(`\n${preset.name} (${view}): ${notes.length / 2} contacts in ${seconds} s, ${out}`);
console.log(`${"".padStart(5)}${[...Array(columns).keys()].map((i) => (i % 10 === 0 ? String(i / 10 % 10) : ".")).join("")}`);
for (const midi of pitches) {
  const row = Array(columns).fill(" ");
  for (const note of notes) {
    if (Math.round(note.midi) !== midi || note.time >= columns) continue;
    const start = Math.floor(note.time);
    const end = Math.min(columns - 1, Math.floor(note.time + note.length));
    const glyph = note.velocity > 100 ? "#" : note.velocity > 70 ? "+" : "-";
    row[start] = glyph;
    for (let c = start + 1; c <= end; c++) if (row[c] === " ") row[c] = "~";
  }
  console.log(`${name(midi).padStart(4)} ${row.join("")}`);
}

// --- Measurements ---
const perMinute = ((notes.length / 2) * 60) / seconds;
const times = contacts.map((c) => c.time).sort((a, b) => a - b);
const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
const gapBins = [0.1, 0.25, 0.5, 1, 2, 4, 8];
const gapHistogram = gapBins.map((edge, i) => {
  const low = i === 0 ? 0 : (gapBins[i - 1] ?? 0);
  return `${low}-${edge}s:${gaps.filter((g) => g >= low && g < edge).length}`;
});
const dyads = new Map<string, number>();
for (const contact of contacts) {
  const interval = Math.abs(mirror(contact.pitchA) - mirror(contact.pitchB)) % 12;
  dyads.set(String(interval), (dyads.get(String(interval)) ?? 0) + 1);
}
const windows = 4;
const chroma: string[] = [];
for (let w = 0; w < windows; w++) {
  const from = (seconds / windows) * w;
  const to = from + seconds / windows;
  const counts = new Array(12).fill(0);
  for (const note of notes) if (note.time >= from && note.time < to) counts[((Math.round(note.midi) % 12) + 12) % 12]++;
  const top = counts
    .map((count, pc) => ({ count, pc }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .filter((entry) => entry.count > 0)
    .map((entry) => `${NAMES[entry.pc]}:${entry.count}`);
  chroma.push(`${Math.round(from)}-${Math.round(to)}s [${top.join(" ")}]`);
}
console.log(`\ncontacts/min ${perMinute.toFixed(1)}; distinct pitches ${pitches.length}; range ${name(pitches.at(-1) ?? 0)}..${name(pitches[0] ?? 0)}`);
console.log(`gaps between contacts: ${gapHistogram.join("  ")}`);
console.log(`dyad intervals (semitones mod 12): ${[...dyads.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ")}`);
console.log(`pitch classes by quarter: ${chroma.join(" | ")}`);
const byBody = new Map<string, number>();
for (const note of notes) byBody.set(note.body, (byBody.get(note.body) ?? 0) + 1);
console.log(`busiest bodies: ${[...byBody.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(" ")}`);
