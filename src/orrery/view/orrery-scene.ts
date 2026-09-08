import { Engine } from "@babylonjs/core/Engines/engine";
import { PointerEventTypes, type PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { Scene } from "@babylonjs/core/scene";
import type { MixStore } from "../mix";
import type { Body, BodyId, BodyPosition, InstrumentState, ViewName } from "../model/types";
import type { OrreryRuntime, RenderFrame } from "../runtime";
import type { OrreryStore } from "../store";
import { createBodies } from "./bodies";
import { createRail } from "./camera";
import { createDust } from "./dust";
import { createEffects, unitCircle } from "./effects";
import { PALETTES, type Palette } from "./palette";
import { createSky } from "./sky";

/**
 * The orrery drawn in Babylon: one scene, one arrangement, two views. The
 * telescope looks down on the plane from above; the pool looks up at it from
 * below, so everything reads mirrored. This file composes the parts (sky,
 * bodies, effects, the camera rail) and owns the lights, the glow, the rays
 * from the sun, picking, and the render loop. It reads RenderFrame and the
 * store; it owns no instrument state.
 *
 * The orrery plane is XZ. Simulation (x, y) maps to world (x, 0, y).
 */

export type SceneHandle = {
  dispose: () => void;
  resize: () => void;
};

export type SceneOptions = {
  /** Mutable so a preference change does not rebuild the engine. */
  reducedMotion: boolean;
  onPick: (id: BodyId | null) => void;
};

/** The farthest the ensemble reaches from the sun. Comets are not counted; they leave the screen. */
function reach(state: InstrumentState): number {
  const byId = new Map(state.bodies.map((body) => [body.id, body]));
  let extent = 0;
  for (const body of state.bodies) {
    let distance = body.discRadius;
    let cursor: Body | undefined = body;
    let comet = false;
    while (cursor) {
      if (cursor.strikesParent) comet = true;
      distance += cursor.orbitRadius;
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    if (!comet) extent = Math.max(extent, distance);
  }
  return extent;
}

export function createOrreryScene(
  canvas: HTMLCanvasElement,
  store: OrreryStore,
  runtime: OrreryRuntime,
  options: SceneOptions,
  mixStore: MixStore,
): SceneHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
  const applyScaling = () =>
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  applyScaling();
  const scene = new Scene(engine);
  const reducedMotion = () => options.reducedMotion;

  const rail = createRail(scene, engine, canvas, reducedMotion);

  // The sun is the light; the rest is fill so the far side of a body is not black.
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.35;
  const key = new DirectionalLight("key", new Vector3(-0.6, -1, 0.4), scene);
  key.intensity = 0.2;
  const sunLight = new PointLight("sunlight", Vector3.Zero(), scene);
  sunLight.intensity = 1.6;
  sunLight.range = 80;
  for (const light of [hemi, key, sunLight]) light.specular.set(0, 0, 0);

  const glow = new GlowLayer("glow", scene, { blurKernelSize: 32, mainTextureRatio: 0.5 });
  const sky = createSky(scene, engine);
  // After the sky: the dust's layer sits over the plate.
  const dust = createDust(scene, engine, rail.camera);
  const effects = createEffects(scene, glow, reducedMotion);
  const root = new TransformNode("orrery", scene);
  let rays: VolumetricLightScatteringPostProcess | null = null;
  const bodies = createBodies({
    scene,
    root,
    glow,
    mixStore,
    dust,
    reducedMotion,
    onSun(mesh) {
      // The sun is the source of the rays; everything else stands in them.
      rays?.dispose(rail.camera);
      rays = new VolumetricLightScatteringPostProcess("rays", 1, rail.camera, mesh, 60);
      rays.exposure = 0.16;
      rays.decay = 0.965;
      rays.weight = 0.5;
      rays.density = 0.9;
      effects.setRays(rays);
      sky.setRays(rays);
      return rays;
    },
  });

  const selectionRing: LinesMesh = CreateLines(
    "selection",
    { points: unitCircle(0.01), updatable: false },
    scene,
  );
  selectionRing.isPickable = false;
  selectionRing.isVisible = false;
  selectionRing.renderingGroupId = 0;

  let view: ViewName = "telescope";
  let palette: Palette = PALETTES[view];
  let lastState = store.getState();
  let lastReach = -1;

  function applyPalette() {
    palette = PALETTES[view];
    scene.clearColor = palette.clear;
    // A whisper of fog: the far ends of the streaks and the outer planets sink a little.
    scene.fogMode = Scene.FOGMODE_EXP;
    scene.fogDensity = palette.fog;
    scene.fogColor.set(palette.clear.r, palette.clear.g, palette.clear.b);
    hemi.diffuse = palette.ambientUp;
    hemi.groundColor = palette.ambientDown;
    sunLight.diffuse = palette.sunGlow;
    glow.intensity = palette.glow;
    selectionRing.color = palette.selection;
    bodies.retint(lastState, palette, view);
    sky.setView(view);
    dust.setView(view);
  }

  function setView(next: ViewName) {
    if (next === view) return;
    view = next;
    // Below the plane, looking up: the same orrery, mirrored. The light flips with the eye.
    const above = view === "telescope";
    hemi.direction = new Vector3(0, above ? 1 : -1, 0);
    key.direction = new Vector3(-0.6, above ? -1 : 1, 0.4);
    rail.setView(view);
    applyPalette();
  }

  function sync(state: InstrumentState) {
    bodies.sync(state, palette, view);
    const extent = reach(state);
    if (extent !== lastReach) {
      lastReach = extent;
      rail.setReach(extent);
      dust.setReach(extent);
    }
  }

  function applyFrame(frame: RenderFrame, state: InstrumentState, dt: number) {
    const positions = new Map<BodyId, BodyPosition>();
    for (const position of frame.positions) positions.set(position.id, position);
    bodies.place(positions, dt);

    const mirror = view === "pool" ? -1 : 1;
    const anchor = state.anchorMidi;
    for (const contact of frame.contacts) {
      const a = positions.get(contact.a);
      const b = positions.get(contact.b);
      const bodyA = bodies.body(contact.a);
      const bodyB = bodies.body(contact.b);
      if (!a || !b || !bodyA || !bodyB) continue;
      const radius = Math.max(bodyA.discRadius, bodyB.discRadius);
      const x = (a.x + b.x) / 2;
      const z = (a.y + b.y) / 2;
      // Heavy contacts throw a wider ring; shaded ones a dimmer bloom.
      effects.flash(x, z, radius * (1 + contact.weight * 0.6), frame.time, palette);
      effects.burst(
        x,
        z,
        radius,
        frame.time,
        contact.intensity * (1 - contact.shade * 0.6),
        palette,
      );
      const pitchA = anchor + mirror * (contact.pitchA - anchor);
      const pitchB = anchor + mirror * (contact.pitchB - anchor);
      bodies.strike(contact.a, pitchA, contact.intensity, anchor);
      bodies.strike(contact.b, pitchB, contact.intensity, anchor);
      if (view === "pool" && !options.reducedMotion) {
        // Ripples: two more rings, staggered, as if the surface were struck.
        effects.flash(x, z, radius * 0.6, frame.time + 0.12, palette);
        effects.flash(x, z, radius * 0.3, frame.time + 0.24, palette);
      }
    }
    effects.update(frame.time, palette);

    const selected = state.selectedBodyIds[0];
    const selectedBody = selected ? bodies.body(selected) : undefined;
    const selectedPosition = selected ? positions.get(selected) : undefined;
    if (selectedBody && selectedPosition) {
      selectionRing.isVisible = true;
      selectionRing.position.set(selectedPosition.x, 0, selectedPosition.y);
      selectionRing.scaling.setAll(selectedBody.discRadius * 1.6);
    } else {
      selectionRing.isVisible = false;
    }

    rail.tick(dt);
    dust.tick();
    sky.parallax(rail.parallax.x, rail.parallax.y);
  }

  // Picking: click a body to select it, click the sky to clear.
  const pickable = (mesh: AbstractMesh) => mesh.isPickable && !!mesh.metadata?.bodyId;
  scene.onPointerObservable.add((info: PointerInfo) => {
    if (info.type === PointerEventTypes.POINTERMOVE) {
      const hit = scene.pick(scene.pointerX, scene.pointerY, pickable);
      canvas.style.cursor = hit?.pickedMesh ? "pointer" : "default";
      return;
    }
    if (info.type !== PointerEventTypes.POINTERTAP) return;
    const hit = scene.pick(scene.pointerX, scene.pointerY, pickable);
    options.onPick(hit?.pickedMesh ? (hit.pickedMesh.metadata.bodyId as BodyId) : null);
  });

  sync(lastState);
  applyPalette();

  /**
   * The frame budget. A device that cannot hold the frame rate for a few seconds
   * running loses the shadows for the rest of the visit; they are the first
   * thing that can go without the picture losing its sense.
   */
  const SLOW_FPS = 40;
  const SLOW_SECONDS = 4;
  let slowFor = 0;
  let shadows = true;
  function watchBudget(dt: number) {
    if (!shadows) return;
    slowFor = engine.getFps() < SLOW_FPS ? slowFor + dt : 0;
    if (slowFor >= SLOW_SECONDS) {
      shadows = false;
      bodies.setShadows(false);
    }
  }

  let lastNow = performance.now();
  function renderFrame() {
    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    watchBudget(dt);
    const state = store.getState();
    if (state !== lastState) {
      lastState = state;
      sync(state);
    }
    setView(state.activeView ?? "telescope");
    applyFrame(runtime.tick(dt), state, dt);
    scene.render();
  }
  engine.runRenderLoop(renderFrame);
  if (import.meta.env.DEV) {
    (window as unknown as { __orrery: unknown }).__orrery = {
      scene,
      camera: rail.camera,
      engine,
      visuals: bodies.visuals,
      store,
    };
  }

  const onVisibility = () => {
    if (document.hidden) {
      engine.stopRenderLoop();
      return;
    }
    lastNow = performance.now();
    engine.runRenderLoop(renderFrame);
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    resize: () => {
      applyScaling();
      engine.resize();
    },
    dispose() {
      document.removeEventListener("visibilitychange", onVisibility);
      engine.stopRenderLoop();
      sky.dispose();
      bodies.dispose();
      dust.dispose();
      rail.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
