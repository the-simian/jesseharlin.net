import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PointerEventTypes, type PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointsCloudSystem } from "@babylonjs/core/Particles/pointsCloudSystem";
import { Scene } from "@babylonjs/core/scene";
import type { Body, BodyId, InstrumentState, ViewName } from "../model/types";
import type { OrreryRuntime, RenderFrame } from "../runtime";
import type { OrreryStore } from "../store";
import { PALETTES, type Palette } from "./palette";

/**
 * The orrery drawn in Babylon. One scene, one arrangement, two views: the
 * telescope looks down on the plane from above; the pool looks up at it from
 * below, so everything reads mirrored. Geometry is found or created by body
 * id and updated in place; nothing is rebuilt on a state change.
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

type BodyVisual = {
  mesh: Mesh;
  material: StandardMaterial;
  orbit: LinesMesh | null;
  depth: number;
};

type Flash = {
  mesh: LinesMesh;
  born: number;
  radius: number;
};

const CIRCLE_SEGMENTS = 96;
const FLASH_LIFE = 0.55;
const CAMERA_BETA_ABOVE = 0.92;
const STAR_COUNT = 420;

function unitCircle(y = 0): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle), y, Math.sin(angle)));
  }
  return points;
}

function depthOf(body: Body, byId: Map<BodyId, Body>): number {
  let depth = 0;
  let parent = body.parentId;
  while (parent !== null) {
    depth++;
    parent = byId.get(parent)?.parentId ?? null;
  }
  return depth;
}

/** Lines ignore alpha reliably, so fade the orbit toward the background instead. */
function orbitColor(palette: Palette): Color3 {
  const background = new Color3(palette.clear.r, palette.clear.g, palette.clear.b);
  return Color3.Lerp(background, palette.orbit, palette.orbitAlpha);
}

function bodyColor(palette: Palette, depth: number): Color3 {
  if (depth === 0) return palette.sun;
  if (depth === 1) return palette.planet;
  return palette.moon;
}

/** The farthest any body can reach from the sun: the sum of orbit radii along its chain plus its disc. */
function reach(state: InstrumentState): number {
  const byId = new Map(state.bodies.map((body) => [body.id, body]));
  let extent = 0;
  for (const body of state.bodies) {
    let distance = body.discRadius;
    let cursor: Body | undefined = body;
    while (cursor) {
      distance += cursor.orbitRadius;
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    extent = Math.max(extent, distance);
  }
  return extent;
}

/** Deterministic star placement so the sky is the same every visit. */
function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createOrreryScene(
  canvas: HTMLCanvasElement,
  store: OrreryStore,
  runtime: OrreryRuntime,
  options: SceneOptions,
): SceneHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
  const applyScaling = () =>
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  applyScaling();
  const scene = new Scene(engine);
  let disposed = false;

  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    CAMERA_BETA_ABOVE,
    8,
    Vector3.Zero(),
    scene,
  );
  camera.minZ = 0.1;
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 40;
  camera.wheelDeltaPercentage = 0.02;
  camera.panningSensibility = 0;
  camera.attachControl(canvas, true);
  // Rotation is the flip's job, not the mouse's; keep the camera on its rail.
  camera.lowerAlphaLimit = camera.alpha;
  camera.upperAlphaLimit = camera.alpha;
  camera.lowerBetaLimit = camera.beta;
  camera.upperBetaLimit = camera.beta;
  let framingRadius = camera.radius;
  let framing = true;
  canvas.addEventListener("wheel", () => {
    framing = false;
  });

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.65;
  hemi.specular = Color3.Black();
  const key = new DirectionalLight("key", new Vector3(-0.6, -1, 0.4), scene);
  key.intensity = 0.45;
  key.specular = Color3.Black();

  const root = new TransformNode("orrery", scene);
  const visuals = new Map<BodyId, BodyVisual>();
  const flashes: Flash[] = [];
  const flashPool: LinesMesh[] = [];

  const selectionRing: LinesMesh = CreateLines(
    "selection",
    { points: unitCircle(0.01), updatable: false },
    scene,
  );
  selectionRing.isPickable = false;
  selectionRing.isVisible = false;

  let currentView: ViewName = "telescope";
  let palette = PALETTES[currentView];

  // Stars: a sparse, seeded cloud on a far shell beneath the plane, where the
  // telescope's sky is. Only shown above.
  const random = seeded(20260906);
  const stars = new PointsCloudSystem("stars", 1.25 / engine.getHardwareScalingLevel(), scene, {
    updatable: false,
  });
  stars.addPoints(
    STAR_COUNT,
    (particle: {
      position: Vector3;
      color: { set: (r: number, g: number, b: number, a: number) => void };
    }) => {
      const theta = 2 * Math.PI * random();
      const phi = Math.acos(2 * random() - 1);
      const r = 60;
      particle.position = new Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        -Math.abs(r * Math.cos(phi)) - 2,
        r * Math.sin(phi) * Math.sin(theta),
      );
      const tint = 0.35 + random() * 0.45;
      particle.color.set(tint, tint, tint * 0.96, 1);
    },
  );
  let starMesh: Mesh | null = null;
  stars
    .buildMeshAsync()
    .then((mesh) => {
      if (disposed) {
        mesh.material?.dispose();
        mesh.dispose();
        return;
      }
      starMesh = mesh;
      mesh.isPickable = false;
      mesh.isVisible = currentView === "telescope";
    })
    .catch(() => undefined);

  function applyPalette() {
    palette = PALETTES[currentView];
    scene.clearColor = palette.clear;
    hemi.diffuse = palette.ambientUp;
    hemi.groundColor = palette.ambientDown;
    for (const visual of visuals.values()) {
      visual.material.diffuseColor = bodyColor(palette, visual.depth);
      visual.material.emissiveColor = visual.depth === 0 ? palette.sunEmissive : Color3.Black();
      if (visual.orbit) visual.orbit.color = orbitColor(palette);
    }
    selectionRing.color = palette.selection;
    if (starMesh) starMesh.isVisible = currentView === "telescope";
  }

  function setView(view: ViewName) {
    if (view === currentView) return;
    currentView = view;
    // Below the plane, looking up: the same orrery, mirrored. The light flips with the eye.
    const above = view === "telescope";
    const beta = above ? CAMERA_BETA_ABOVE : Math.PI - CAMERA_BETA_ABOVE;
    camera.lowerBetaLimit = beta;
    camera.upperBetaLimit = beta;
    camera.beta = beta;
    hemi.direction = new Vector3(0, above ? 1 : -1, 0);
    key.direction = new Vector3(-0.6, above ? -1 : 1, 0.4);
    applyPalette();
  }

  function syncBodies(state: InstrumentState) {
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    for (const body of state.bodies) {
      const depth = depthOf(body, byId);
      let visual = visuals.get(body.id);
      if (!visual) {
        const mesh = CreateSphere(body.id, { diameter: 1, segments: 24 }, scene);
        mesh.parent = root;
        const material = new StandardMaterial(`${body.id}-material`, scene);
        material.specularColor = Color3.Black();
        mesh.material = material;
        mesh.metadata = { bodyId: body.id };
        visual = { mesh, material, orbit: null, depth };
        visuals.set(body.id, visual);
      }
      visual.depth = depth;
      visual.mesh.scaling.setAll(body.discRadius * 2);
      visual.material.diffuseColor = bodyColor(palette, depth);
      visual.material.emissiveColor = depth === 0 ? palette.sunEmissive : Color3.Black();
      if (body.parentId !== null && !visual.orbit) {
        const orbit = CreateLines(
          `${body.id}-orbit`,
          { points: unitCircle(), updatable: false },
          scene,
        );
        orbit.parent = root;
        orbit.isPickable = false;
        orbit.color = orbitColor(palette);
        visual.orbit = orbit;
      }
      if (visual.orbit) visual.orbit.scaling.set(body.orbitRadius, 1, body.orbitRadius);
    }
    for (const [id, visual] of visuals) {
      if (byId.has(id)) continue;
      visual.mesh.dispose();
      visual.material.dispose();
      visual.orbit?.dispose();
      visuals.delete(id);
    }
    framingRadius = Math.max(7, reach(state) * 3.1);
    framing = true;
  }

  function spawnFlash(x: number, z: number, radius: number, born: number) {
    let mesh = flashPool.pop();
    if (!mesh) {
      mesh = CreateLines("flash", { points: unitCircle(0.005), updatable: false }, scene);
      mesh.isPickable = false;
    }
    mesh.isVisible = false;
    mesh.color = palette.flash;
    mesh.position.set(x, 0, z);
    mesh.scaling.setAll(radius);
    flashes.push({ mesh, born, radius });
  }

  function updateFlashes(time: number) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i];
      if (!flash) continue;
      const age = (time - flash.born) / FLASH_LIFE;
      if (age < 0) {
        flash.mesh.isVisible = false;
        continue;
      }
      if (age >= 1) {
        flash.mesh.isVisible = false;
        flashPool.push(flash.mesh);
        flashes.splice(i, 1);
        continue;
      }
      flash.mesh.isVisible = true;
      const eased = 1 - (1 - age) * (1 - age);
      const grow = options.reducedMotion ? 1.6 : 1 + eased * 2.2;
      flash.mesh.scaling.setAll(flash.radius * grow);
      flash.mesh.color = Color3.Lerp(
        new Color3(palette.clear.r, palette.clear.g, palette.clear.b),
        palette.flash,
        (1 - age) * 0.9,
      );
    }
  }

  function applyFrame(frame: RenderFrame, state: InstrumentState) {
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    const positions = new Map(frame.positions.map((position) => [position.id, position]));
    for (const [id, visual] of visuals) {
      const position = positions.get(id);
      const body = byId.get(id);
      if (!position || !body) continue;
      visual.mesh.position.set(position.x, 0, position.y);
      if (visual.orbit && body.parentId !== null) {
        const parent = positions.get(body.parentId);
        if (parent) visual.orbit.position.set(parent.x, 0, parent.y);
      }
    }
    for (const contact of frame.contacts) {
      const a = positions.get(contact.a);
      const b = positions.get(contact.b);
      const bodyA = byId.get(contact.a);
      const bodyB = byId.get(contact.b);
      if (!a || !b || !bodyA || !bodyB) continue;
      const radius = Math.max(bodyA.discRadius, bodyB.discRadius);
      const x = (a.x + b.x) / 2;
      const z = (a.y + b.y) / 2;
      spawnFlash(x, z, radius, frame.time);
      if (currentView === "pool" && !options.reducedMotion) {
        // Ripples: two more rings, staggered, as if the surface were struck.
        spawnFlash(x, z, radius * 0.6, frame.time + 0.12);
        spawnFlash(x, z, radius * 0.3, frame.time + 0.24);
      }
    }
    updateFlashes(frame.time);

    const selected = state.selectedBodyIds[0];
    const selectedBody = selected ? byId.get(selected) : undefined;
    const selectedPosition = selected ? positions.get(selected) : undefined;
    if (selectedBody && selectedPosition) {
      selectionRing.isVisible = true;
      selectionRing.position.set(selectedPosition.x, 0, selectedPosition.y);
      selectionRing.scaling.setAll(selectedBody.discRadius * 1.6);
    } else {
      selectionRing.isVisible = false;
    }

    // Frame the arrangement until the visitor takes the wheel.
    if (framing) {
      const step = options.reducedMotion ? 1 : 0.05;
      camera.radius += (framingRadius - camera.radius) * step;
      if (Math.abs(framingRadius - camera.radius) < 0.01) framing = false;
    }
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

  let lastState = store.getState();
  syncBodies(lastState);
  camera.radius = framingRadius;
  applyPalette();

  let lastNow = performance.now();
  function renderFrame() {
    const now = performance.now();
    const dt = (now - lastNow) / 1000;
    lastNow = now;
    const state = store.getState();
    if (state !== lastState) {
      syncBodies(state);
      lastState = state;
    }
    const view = state.activeView ?? "telescope";
    if (view !== currentView) setView(view);
    applyFrame(runtime.tick(dt), state);
    scene.render();
  }
  engine.runRenderLoop(renderFrame);

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
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
