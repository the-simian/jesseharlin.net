import { createVoiceEngine } from "./audio/voice";
import { createSimulation } from "./model/simulation";
import type { BodyPosition, Contact, InstrumentState } from "./model/types";
import type { OrreryStore } from "./store";

/** Audio is scheduled this far ahead, so the picture runs this far behind. */
export const VISUAL_DELAY = 0.1;

export type RenderFrame = {
  /** Simulation time the picture shows (already delayed). */
  time: number;
  positions: BodyPosition[];
  /** Contacts whose time has just passed in the delayed timeline. */
  contacts: Contact[];
};

type Snapshot = { time: number; positions: BodyPosition[] };

/**
 * Owns the simulation clock and the voice engine, forwards store changes to
 * both, and hands the view one RenderFrame per animation frame.
 *
 * The picture is delayed by VISUAL_DELAY so flashes land on notes. Delayed
 * positions come from a ring of snapshots recorded as the simulation advanced,
 * not from re-evaluating the current arrangement at an old time; otherwise an
 * edit would rewrite the recent past.
 */
export function createOrreryRuntime(store: OrreryStore) {
  const simulation = createSimulation(store.getState());
  let suppressedTotal = 0;
  const voice = createVoiceEngine({
    onSuppressed: (count) => {
      suppressedTotal += count;
    },
  });
  let simulationTime = 0;
  let pendingContacts: Contact[] = [];
  let snapshots: Snapshot[] = [{ time: 0, positions: simulation.positionsAt(0) }];

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    simulation.setState(state);
    voice.setState(state);
  });
  voice.setState(store.getState());

  function delayedPositions(shown: number): BodyPosition[] {
    // Newest snapshot at or before the shown time; snapshots are 1/240 s apart.
    let chosen = snapshots[0];
    for (const snapshot of snapshots) {
      if (snapshot.time <= shown) chosen = snapshot;
      else break;
    }
    const ids = new Set(store.getState().bodies.map((body) => body.id));
    return (chosen?.positions ?? []).filter((position) => ids.has(position.id));
  }

  function tick(dtSeconds: number): RenderFrame {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    const frames = simulation.advance(dt);
    const state = store.getState();
    const fresh: Contact[] = [];
    for (const frame of frames) {
      simulationTime = frame.time;
      fresh.push(...frame.contacts);
      snapshots.push({ time: frame.time, positions: frame.positions });
    }
    if (state.soundEnabled && state.activeView) {
      voice.scheduleContacts(fresh, state.activeView, simulationTime);
    }
    pendingContacts.push(...fresh);
    const shown = simulationTime - VISUAL_DELAY;
    const due = pendingContacts.filter((contact) => contact.time <= shown);
    pendingContacts = pendingContacts.filter((contact) => contact.time > shown);
    // Keep the newest snapshot at or before the shown time, and everything after it.
    let keepFrom = 0;
    for (let i = 0; i < snapshots.length; i++) {
      if ((snapshots[i]?.time ?? 0) <= shown) keepFrom = i;
      else break;
    }
    snapshots = snapshots.slice(keepFrom);
    return { time: shown, positions: delayedPositions(shown), contacts: due };
  }

  return {
    tick,
    enableSound: () => voice.enable(),
    disableSound: () => voice.disable(),
    dispose() {
      unsubscribe();
      voice.disable();
    },
    get suppressedTotal() {
      return suppressedTotal;
    },
    stateNow: (): InstrumentState => store.getState(),
  };
}

export type OrreryRuntime = ReturnType<typeof createOrreryRuntime>;
