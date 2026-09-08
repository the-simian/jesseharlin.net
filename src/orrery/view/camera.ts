import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { ViewName } from "../model/types";

/**
 * The eye sits on a rail. It never takes the mouse: the flip turns it over,
 * the wheel zooms, and otherwise it wanders on its own, circling the sun
 * over minutes, rising and falling, breathing in and out, so the sky is
 * never quite still and the sun stays at the centre of the frame.
 */

const BETA_ABOVE = 0.92;
/** One slow circuit of the sky, in seconds; the eye should only just notice. */
const CIRCUIT_SECONDS = 240;
const DRIFT_BETA = 0.22;
const ZOOM_MIN = 3;
const ZOOM_MAX = 60;

export function createRail(
  scene: Scene,
  engine: Engine,
  canvas: HTMLCanvasElement,
  reducedMotion: () => boolean,
) {
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, BETA_ABOVE, 8, Vector3.Zero(), scene);
  camera.minZ = 0.1;
  camera.inputs.clear();
  let view: ViewName = "telescope";
  let framingRadius = camera.radius;
  let zoom = camera.radius;
  let framing = true;
  let visitorZoomed = false;
  let drift = 0;
  let parallax = { x: 0, y: 0 };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    framing = false;
    visitorZoomed = true;
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (1 + Math.sign(event.deltaY) * 0.08)));
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  /**
   * On a landscape canvas the controls overlay the bottom, so the target is
   * pulled toward the eye and the orrery rides high. Seen from below the
   * screen direction reverses, so the sign follows the view. On a portrait
   * canvas the controls sit under the sky and no offset is needed.
   */
  function targetOffset(): number {
    const landscape = engine.getRenderWidth() > engine.getRenderHeight();
    if (!landscape) return 0;
    return view === "telescope" ? -framingRadius * 0.2 : framingRadius * 0.08;
  }

  return {
    camera,
    setView(next: ViewName) {
      view = next;
      if (!visitorZoomed) framing = true;
    },
    /** The farthest the ensemble reaches; comets are not counted, they leave the screen. */
    setReach(extent: number) {
      framingRadius = Math.max(7, extent * 2.6);
      if (!visitorZoomed) framing = true;
    },
    /** How far the plate has slid this frame, for the sky's parallax. */
    get parallax() {
      return parallax;
    },
    tick(dt: number) {
      if (framing) {
        const step = reducedMotion() ? 1 : 0.05;
        zoom += (framingRadius - zoom) * step;
        const wantedZ = targetOffset();
        camera.target.z += (wantedZ - camera.target.z) * step;
        const settled =
          Math.abs(framingRadius - zoom) < 0.01 && Math.abs(wantedZ - camera.target.z) < 0.01;
        if (settled) framing = false;
      } else {
        camera.target.x += (0 - camera.target.x) * 0.01;
        camera.target.z += (targetOffset() - camera.target.z) * 0.01;
      }
      if (!reducedMotion()) drift += dt;
      const above = view === "telescope";
      const alpha = -Math.PI / 2 + (drift / CIRCUIT_SECONDS) * Math.PI * 2;
      const betaBase = above ? BETA_ABOVE : Math.PI - BETA_ABOVE;
      const beta = betaBase + Math.sin(drift / 97) * DRIFT_BETA * (above ? 1 : -1);
      const breathe = 1 + Math.sin(drift / 131) * 0.14;
      camera.alpha = alpha;
      camera.beta = beta;
      camera.radius = zoom * breathe;
      parallax = { x: Math.sin(alpha + Math.PI / 2) * 0.04, y: (beta - betaBase) * 0.1 };
    },
    dispose() {
      canvas.removeEventListener("wheel", onWheel);
      camera.dispose();
    },
  };
}

export type Rail = ReturnType<typeof createRail>;
