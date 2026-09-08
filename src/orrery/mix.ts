import { useSyncExternalStore } from "react";

/**
 * The mix: how loud each part of the instrument is, and how long notes ring.
 * Not part of the arrangement (a preset does not carry it), so it lives in its
 * own store, remembered per visitor. The view reads decay too: a body's trail
 * is as long as its note.
 */
export type Mix = {
  /** Bells, the struck voices. 0 to 1. */
  bells: number;
  /** The sun's drone. 0 to 1. */
  drone: number;
  /** Reverb wet amount. 0 to 1. */
  reverb: number;
  /** Multiplier on every note's decay. 0.25 to 4. */
  decay: number;
};

export const DEFAULT_MIX: Mix = { bells: 0.9, drone: 0.5, reverb: 0.4, decay: 1.5 };
export const MIX_RANGE: Record<keyof Mix, { min: number; max: number; step: number }> = {
  bells: { min: 0, max: 1, step: 0.01 },
  drone: { min: 0, max: 1, step: 0.01 },
  reverb: { min: 0, max: 1, step: 0.01 },
  decay: { min: 0.25, max: 4, step: 0.05 },
};

const STORAGE_KEY = "orrery-mix";

function load(): Mix {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MIX;
    const parsed = JSON.parse(raw) as Partial<Mix>;
    const mix = { ...DEFAULT_MIX };
    for (const key of Object.keys(MIX_RANGE) as (keyof Mix)[]) {
      const value = parsed[key];
      const range = MIX_RANGE[key];
      if (typeof value === "number" && Number.isFinite(value))
        mix[key] = Math.min(range.max, Math.max(range.min, value));
    }
    return mix;
  } catch {
    return DEFAULT_MIX;
  }
}

export function createMixStore() {
  let mix = load();
  const listeners = new Set<() => void>();
  return {
    getMix: () => mix,
    setLevel(key: keyof Mix, value: number) {
      const range = MIX_RANGE[key];
      mix = { ...mix, [key]: Math.min(range.max, Math.max(range.min, value)) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mix));
      } catch {
        // Storage may be unavailable; the mix still applies for this visit.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type MixStore = ReturnType<typeof createMixStore>;

/** One mix for the page; the voice engine and the scene both read it. */
export const sharedMix: MixStore = createMixStore();

export function useMix(store: MixStore): Mix {
  return useSyncExternalStore(store.subscribe, store.getMix, store.getMix);
}
