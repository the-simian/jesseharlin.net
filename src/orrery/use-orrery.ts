import { useEffect, useState } from "react";
import {
  addBody,
  applyPreset,
  clearSelection,
  removeBody,
  selectBody,
  setActiveView,
  setDrift,
  setOffset,
  setOrbitRadius,
  setPatch,
  setRatio,
  setSoundEnabled,
} from "./model/commands";
import { getPresetId, PRESETS } from "./model/presets";
import { depthOf } from "./model/tree";
import {
  type Body,
  type Drift,
  type InstrumentState,
  LIMITS,
  type PatchName,
  type Ratio,
  type ViewName,
} from "./model/types";
import { createOrreryRuntime, type OrreryRuntime } from "./runtime";
import { createOrreryStore, type OrreryStore, useOrreryState } from "./store";

/**
 * Orchestration for the instrument page. Creates the store and runtime once,
 * exposes the arrangement to React, and turns UI intent into commands.
 */
export function useOrrery() {
  const [store] = useState<OrreryStore>(() => createOrreryStore());
  const [runtime, setRuntime] = useState<OrreryRuntime | null>(null);
  // Engine lifecycle: the runtime subscribes to the store, so it is connected and
  // disconnected here rather than in a state initializer (StrictMode mounts twice).
  useEffect(() => {
    const created = createOrreryRuntime(store);
    store.dispatch((state) => setActiveView(state, "telescope"));
    setRuntime(created);
    return () => {
      created.dispose();
      setRuntime(null);
    };
  }, [store]);
  const state = useOrreryState(store);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const selectedId = state.selectedBodyIds[0] ?? null;
  const selected = state.bodies.find((body) => body.id === selectedId) ?? null;
  const sun = state.bodies.find((body) => body.parentId === null) as Body;
  // Add around the selection, or its parent when the depth limit is reached.
  const moonTarget =
    selected && selected.parentId !== null ? resolveAddTarget(selected, state) : null;
  const room = state.bodies.length < LIMITS.maxBodies;
  const canAddPlanet = room;
  const canAddMoon = room && moonTarget !== null;

  return {
    store,
    runtime,
    state,
    reducedMotion,
    selected,
    sun,
    canAddPlanet,
    canAddMoon,
    moonTarget,
    presets: PRESETS,
    activePresetId: getPresetId(state),
    applyPreset(id: string) {
      store.dispatch((s) => applyPreset(s, id));
    },
    pick(id: string | null) {
      store.dispatch((s) => (id === null ? clearSelection(s) : selectBody(s, id)));
    },
    addPlanet() {
      store.dispatch((s) => addAndSelect(s, sun.id));
    },
    addMoon() {
      if (moonTarget) store.dispatch((s) => addAndSelect(s, moonTarget.id));
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
    setRing(orbitRadius: number) {
      if (selected) store.dispatch((s) => setOrbitRadius(s, selected.id, orbitRadius));
    },
    setPatch(id: string, patch: PatchName) {
      store.dispatch((s) => setPatch(s, id, patch));
    },
    setDriftMode(drift: Drift) {
      if (selected) store.dispatch((s) => setDrift(s, selected.id, drift));
    },
    setView(view: ViewName) {
      store.dispatch((s) => setActiveView(s, view));
    },
    async toggleSound() {
      if (!runtime) return;
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

function addAndSelect(state: InstrumentState, parentId: string): InstrumentState {
  const next = addBody(state, parentId);
  const created = next.bodies.find((body) => !state.bodies.includes(body));
  return created ? selectBody(next, created.id) : next;
}

function resolveAddTarget(body: Body, state: InstrumentState): Body {
  const byId = new Map(state.bodies.map((candidate) => [candidate.id, candidate]));
  if (depthOf(body, byId) < LIMITS.maxDepth) return body;
  const parent = body.parentId === null ? undefined : byId.get(body.parentId);
  return parent ?? body;
}
