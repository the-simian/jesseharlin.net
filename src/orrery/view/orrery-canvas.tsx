import { useEffect, useRef } from "react";
import type { MixStore } from "../mix";
import type { OrreryRuntime } from "../runtime";
import type { OrreryStore } from "../store";
import { createOrreryScene, type SceneHandle, type SceneOptions } from "./orrery-scene";

type OrreryCanvasProps = {
  store: OrreryStore;
  runtime: OrreryRuntime;
  reducedMotion: boolean;
  onPick: (id: string | null) => void;
  mixStore: MixStore;
};

/** Mounts the Babylon engine exactly once. State reaches the scene through the store, never through props. */
export function OrreryCanvas({
  store,
  runtime,
  reducedMotion,
  onPick,
  mixStore,
}: OrreryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef<SceneOptions>({ reducedMotion, onPick });
  optionsRef.current.reducedMotion = reducedMotion;
  optionsRef.current.onPick = onPick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle: SceneHandle = createOrreryScene(
      canvas,
      store,
      runtime,
      optionsRef.current,
      mixStore,
    );
    const observer = new ResizeObserver(() => handle.resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      handle.dispose();
    };
  }, [store, runtime, mixStore]);

  return <canvas ref={canvasRef} className="orrery-canvas" role="img" aria-label="the orrery" />;
}
