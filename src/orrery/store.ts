import { useSyncExternalStore } from "react";
import { createInitialState } from "./model/commands";
import type { InstrumentState } from "./model/types";

/**
 * The instrument's arrangement, as a tiny external store. React reads it with
 * useOrreryState; the runtime subscribes and forwards every change to the
 * simulation and the voice engine. Commands are the pure functions in
 * model/commands.ts, applied through dispatch.
 */
export type Command = (state: InstrumentState) => InstrumentState;

export function createOrreryStore(initial: InstrumentState = createInitialState()) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(command: Command) {
      const next = command(state);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
  };
}

export type OrreryStore = ReturnType<typeof createOrreryStore>;

export function useOrreryState(store: OrreryStore): InstrumentState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
