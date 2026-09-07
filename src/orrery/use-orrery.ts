import { useState } from "react";
import {
  addBody,
  clearSelection,
  removeBody,
  selectBody,
  setActiveView,
  setDrift,
  setOffset,
  setRatio,
  setSoundEnabled,
} from "./model/commands";
import type { Body, Drift, InstrumentState, Ratio, ViewName } from "./model/types";
import { createOrreryRuntime, type OrreryRuntime } from "./runtime";
import { createOrreryStore, type OrreryStore, useOrreryState } from "./store";

/**
 * Orchestration for the instrument page. Creates the store and runtime once,
 * exposes the arrangement to React, and turns UI intent into commands.
 */
export function useOrrery() {
  const [store] = useState<OrreryStore>(() => createOrreryStore());
  const [runtime] = useState<OrreryRuntime>(() => {
    const created = createOrreryRuntime(store);
    store.dispatch((state) => setActiveView(state, "telescope"));
    return created;
  });
  const state = useOrreryState(store);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const selectedId = state.selectedBodyIds[0] ?? null;
  const selected = state.bodies.find((body) => body.id === selectedId) ?? null;
  const sun = state.bodies.find((body) => body.parentId === null) as Body;
  // A moon cannot have moons; adding while one is selected adds a sibling around its planet.
  const addTarget = resolveAddTarget(selected ?? sun, state);
  const canAdd = state.bodies.length < 8;

  return {
    store,
    runtime,
    state,
    reducedMotion,
    selected,
    sun,
    canAdd,
    addTarget,
    pick(id: string | null) {
      store.dispatch((s) => (id === null ? clearSelection(s) : selectBody(s, id)));
    },
    addMoon() {
      const parent = addTarget;
      store.dispatch((s) => {
        const next = addBody(s, parent.id);
        const created = next.bodies.find((body) => !s.bodies.includes(body));
        return created ? selectBody(next, created.id) : next;
      });
    },
    removeSelected() {
      if (!selected || selected.parentId === null) return;
      store.dispatch((s) => removeBody(s, selected.id));
    },
    setSpeed(ratio: Ratio) {
      if (selected) store.dispatch((s) => setRatio(s, selected.id, ratio));
    },
    setPitch(offset: number) {
      if (selected) store.dispatch((s) => setOffset(s, selected.id, offset));
    },
    setDriftMode(drift: Drift) {
      if (selected) store.dispatch((s) => setDrift(s, selected.id, drift));
    },
    setView(view: ViewName) {
      store.dispatch((s) => setActiveView(s, view));
    },
    async toggleSound() {
      if (state.soundEnabled) {
        runtime.disableSound();
        store.dispatch((s) => setSoundEnabled(s, false));
        return;
      }
      await runtime.enableSound();
      store.dispatch((s) => setSoundEnabled(s, true));
    },
  };
}

function resolveAddTarget(body: Body, state: InstrumentState): Body {
  if (depthOf(body, state) < 2) return body;
  const parent = state.bodies.find((candidate) => candidate.id === body.parentId);
  return parent ?? body;
}

export function depthOf(body: Body, state: InstrumentState): number {
  let depth = 0;
  let parent = body.parentId;
  while (parent !== null) {
    depth++;
    parent = state.bodies.find((candidate) => candidate.id === parent)?.parentId ?? null;
  }
  return depth;
}
