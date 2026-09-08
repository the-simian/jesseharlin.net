import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PointerEventTypes, type PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Layer } from "@babylonjs/core/Layers/layer";
import "@babylonjs/core/Shaders/layer.fragment";
import "@babylonjs/core/Shaders/layer.vertex";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointsCloudSystem } from "@babylonjs/core/Particles/pointsCloudSystem";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { Scene } from "@babylonjs/core/scene";
import type { IndicesArray } from "@babylonjs/core/types";
import { decayFor } from "../audio/voice";
import type { MixStore } from "../mix";
import { soundingPitch } from "../model/pitch";
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
 *
 * Bodies are lit from within: a translucent shell with a fresnel rim over a
 * painted surface, a halo sprite behind it, and the glow layer over both.
 * Behind the arrangement hangs a painted plate (public/sky) that slides a
 * little against the camera's drift, so the sky reads as depth, not wallpaper.
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
  halo: Mesh;
  haloMaterial: StandardMaterial;
  orbit: Mesh | null;
  orbitMaterial: StandardMaterial | null;
  depth: number;
  /** Index among siblings, for picking a surface. */
  ordinal: number;
  /** Seconds since this body's last contact, for the halo's pulse. */
  struck: number;
  /** The colour of this body's light, from its pitch; see tintFor(). */
  light: Color3;
  /** 0 low to 1 high, from the sounding pitch. */
  register: number;
  /** The body quivers while its note rings; see ring(). */
  ring: Ringing | null;
  /** The last few seconds of travel, so the figure a body draws can be seen. */
  trail: LinesMesh | null;
  trailPoints: Vector3[];
  /** Unit-sphere positions and index buffer, kept so the quiver can be undone. */
  rest: Float32Array;
  indices: IndicesArray;
};

/**
 * A struck body's shape rings down with its note: amplitude from the contact's
 * intensity, ripple count from the sounding pitch, decay from the voice's own
 * decay curve, so the quiver lasts as long as the bell.
 */
type Ringing = {
  amplitude: number;
  ripples: number;
  decaySeconds: number;
  age: number;
  phase: number;
};

type Flash = {
  mesh: LinesMesh;
  born: number;
  radius: number;
};

type Burst = {
  mesh: Mesh;
  material: StandardMaterial;
  born: number;
  radius: number;
  intensity: number;
};

const CIRCLE_SEGMENTS = 96;
/** Trail length in samples at a decay multiplier of 1; one sample per rendered frame. */
const TRAIL_SAMPLES = 80;
const FLASH_LIFE = 0.55;
const BURST_LIFE = 0.9;
const CAMERA_BETA_ABOVE = 0.92;
const STAR_COUNT = 1600;
/** One slow circuit of the sky, in seconds; the eye should only just notice. */
const CIRCUIT_SECONDS = 240;
const DRIFT_BETA = 0.22;

/** Painted surfaces, by depth, served from public/planets. Planets alternate. */
const SURFACES = {
  planet: ["/planets/crystal.jpg", "/planets/bands.jpg"],
  moon: ["/planets/moon.jpg"],
};

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

function bodyColor(palette: Palette, depth: number): Color3 {
  if (depth === 0) return palette.sun;
  if (depth === 1) return palette.planet;
  return palette.moon;
}

function glowColor(palette: Palette, depth: number): Color3 {
  if (depth === 0) return palette.sunGlow;
  if (depth === 1) return palette.planetGlow;
  return palette.moonGlow;
}

/** The farthest any body can reach from the sun: the sum of orbit radii along its chain plus its disc. */
function reach(state: InstrumentState): number {
  const byId = new Map(state.bodies.map((body) => [body.id, body]));
  let extent = 0;
  for (const body of state.bodies) {
    let distance = body.discRadius;
    let cursor: Body | undefined = body;
    let comet = false;
    while (cursor) {
      // Comets and their moons range far outside the ensemble and may leave the screen.
      if (cursor.strikesParent) comet = true;
      distance += cursor.orbitRadius;
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    if (!comet) extent = Math.max(extent, distance);
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

/** A soft radial disc, white in the centre and clear at the edge, for halos and bursts. */
function createHaloTexture(scene: Scene, name: string, hardness: number): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture(name, size, scene, true);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(hardness, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.update();
  texture.hasAlpha = true;
  return texture;
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
  let disposed = false;

  // The camera sits on a rail. It never takes the mouse; the flip turns it over,
  // and it drifts on its own so the sky is never quite still. The wheel zooms.
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2,
    CAMERA_BETA_ABOVE,
    8,
    Vector3.Zero(),
    scene,
  );
  camera.minZ = 0.1;
  camera.inputs.clear();
  let framingRadius = camera.radius;
  let zoom = camera.radius;
  let framing = true;
  let visitorZoomed = false;
  const ZOOM_MIN = 3;
  const ZOOM_MAX = 60;
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      framing = false;
      visitorZoomed = true;
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (1 + Math.sign(event.deltaY) * 0.08)));
    },
    { passive: false },
  );
  let lastReach = -1;
  let drift = 0;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.35;
  hemi.specular = Color3.Black();
  const key = new DirectionalLight("key", new Vector3(-0.6, -1, 0.4), scene);
  key.intensity = 0.2;
  key.specular = Color3.Black();
  // The sun is the light. Bodies stand in each other's light and cast it away from the centre.
  const sunLight = new PointLight("sunlight", Vector3.Zero(), scene);
  sunLight.intensity = 1.6;
  sunLight.range = 80;
  sunLight.specular = Color3.Black();
  const shadows = new ShadowGenerator(1024, sunLight);
  shadows.usePercentageCloserFiltering = true;
  shadows.darkness = 0.35;

  const glow = new GlowLayer("glow", scene, { blurKernelSize: 64, mainTextureRatio: 0.5 });
  glow.intensity = 0.9;
  let rays: VolumetricLightScatteringPostProcess | null = null;

  const root = new TransformNode("orrery", scene);
  const visuals = new Map<BodyId, BodyVisual>();
  const flashes: Flash[] = [];
  const flashPool: LinesMesh[] = [];
  const bursts: Burst[] = [];
  const burstPool: Burst[] = [];
  const haloTexture = createHaloTexture(scene, "halo", 0.18);
  const burstTexture = createHaloTexture(scene, "burst", 0.5);
  const surfaces = new Map<string, Texture>();
  const surface = (url: string) => {
    let texture = surfaces.get(url);
    if (!texture) {
      texture = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      surfaces.set(url, texture);
    }
    return texture;
  };

  const selectionRing: LinesMesh = CreateLines(
    "selection",
    { points: unitCircle(0.01), updatable: false },
    scene,
  );
  selectionRing.isPickable = false;
  selectionRing.isVisible = false;

  let currentView: ViewName = "telescope";
  let palette = PALETTES[currentView];

  // The painted plate, one per view, behind everything.
  const plates: Record<ViewName, Layer> = {
    telescope: new Layer("plate-above", PALETTES.telescope.plate, scene, true),
    pool: new Layer("plate-below", PALETTES.pool.plate, scene, true),
  };
  for (const plate of Object.values(plates)) {
    plate.scale.set(1.12, 1.12);
    plate.isEnabled = false;
  }

  // Stars: a seeded shell all round, two sizes, so the plate has grain in front of it.
  const random = seeded(20260906);
  const starMeshes: Mesh[] = [];
  const buildStars = (count: number, size: number, brightness: number) => {
    const stars = new PointsCloudSystem(
      `stars-${size}`,
      size / engine.getHardwareScalingLevel(),
      scene,
      { updatable: false },
    );
    stars.addPoints(
      count,
      (particle: {
        position: Vector3;
        color: { set: (r: number, g: number, b: number, a: number) => void };
      }) => {
        const theta = 2 * Math.PI * random();
        const phi = Math.acos(2 * random() - 1);
        const r = 70 + random() * 20;
        particle.position = new Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta),
        );
        const tint = brightness * (0.4 + random() * 0.6);
        const warm = random() < 0.2;
        particle.color.set(tint, tint * (warm ? 0.85 : 0.97), tint * (warm ? 0.7 : 1), 1);
      },
    );
    stars
      .buildMeshAsync()
      .then((mesh) => {
        if (disposed) {
          mesh.material?.dispose();
          mesh.dispose();
          return;
        }
        mesh.isPickable = false;
        starMeshes.push(mesh);
      })
      .catch(() => undefined);
  };
  buildStars(STAR_COUNT, 1.1, 0.75);
  buildStars(Math.round(STAR_COUNT / 8), 2.4, 1);

  /**
   * A body wears its pitch. Register sets the temperature of its light: low
   * notes burn warm and wide, high notes cold and tight. Pitch class sets a
   * small hue turn around that, so a fifth apart reads as a different body.
   */
  function tintFor(visual: BodyVisual, state: InstrumentState, id: BodyId): void {
    const base = bodyColor(palette, visual.depth);
    const rim = glowColor(palette, visual.depth);
    const midi = soundingPitch(state, id, currentView);
    const register = Math.max(0, Math.min(1, (midi - 40) / 40));
    const pitchClass = ((midi % 12) + 12) % 12;
    const hueTurn = Color3.FromHSV((pitchClass / 12) * 360, 0.55, 1);
    const warmth = Color3.Lerp(palette.warm, palette.cool, register);
    const light = Color3.Lerp(
      rim,
      Color3.Lerp(warmth, hueTurn, 0.35),
      visual.depth === 0 ? 0.15 : 0.6,
    );
    visual.light = light;
    visual.register = register;
    visual.material.diffuseColor = base;
    visual.material.emissiveColor = visual.depth === 0 ? light.scale(0.55) : light.scale(0.3);
    const fresnel = visual.material.emissiveFresnelParameters;
    if (fresnel) {
      fresnel.leftColor = light;
      fresnel.rightColor = visual.depth === 0 ? light.scale(0.35) : Color3.Black();
    }
    visual.haloMaterial.emissiveColor = light;
    if (visual.orbitMaterial) {
      visual.orbitMaterial.emissiveColor = Color3.Lerp(palette.orbit, light, 0.35);
      visual.orbitMaterial.alpha = palette.orbitAlpha * (0.55 + 0.45 * (1 - register));
    }
  }

  function applyPalette() {
    palette = PALETTES[currentView];
    scene.clearColor = palette.clear;
    hemi.diffuse = palette.ambientUp;
    hemi.groundColor = palette.ambientDown;
    glow.intensity = palette.glow;
    for (const [id, visual] of visuals) tintFor(visual, lastState, id);
    selectionRing.color = palette.selection;
    sunLight.diffuse = palette.sunGlow;
    for (const [view, plate] of Object.entries(plates)) plate.isEnabled = view === currentView;
  }

  function setView(view: ViewName) {
    if (view === currentView) return;
    currentView = view;
    // Below the plane, looking up: the same orrery, mirrored. The light flips with the eye.
    const above = view === "telescope";
    hemi.direction = new Vector3(0, above ? 1 : -1, 0);
    key.direction = new Vector3(-0.6, above ? -1 : 1, 0.4);
    if (!visitorZoomed) framing = true;
    applyPalette();
  }

  function createVisual(body: Body, depth: number, ordinal: number): BodyVisual {
    const mesh = CreateSphere(body.id, { diameter: 1, segments: 28, updatable: true }, scene);
    mesh.parent = root;
    const material = new StandardMaterial(`${body.id}-material`, scene);
    material.specularColor = Color3.Black();
    material.alpha = depth === 0 ? 0.95 : 0.78;
    material.emissiveFresnelParameters = new FresnelParameters({
      bias: 0.25,
      power: 2.2,
      leftColor: Color3.White(),
      rightColor: Color3.Black(),
    });
    material.opacityFresnelParameters = new FresnelParameters({
      bias: 0.55,
      power: 1.5,
      leftColor: Color3.White(),
      rightColor: Color3.Black(),
    });
    const skins = depth === 1 ? SURFACES.planet : depth === 2 ? SURFACES.moon : [];
    const skin = skins[ordinal % Math.max(1, skins.length)];
    if (skin) {
      material.diffuseTexture = surface(skin);
      material.emissiveTexture = surface(skin);
    }
    mesh.material = material;
    mesh.metadata = { bodyId: body.id };
    if (depth === 0) {
      // The sun is the source of the rays; everything else stands in them.
      rays?.dispose(camera);
      rays = new VolumetricLightScatteringPostProcess("rays", 1, camera, mesh, 60);
      rays.exposure = 0.16;
      rays.decay = 0.965;
      rays.weight = 0.5;
      rays.density = 0.9;
    } else {
      shadows.addShadowCaster(mesh);
      mesh.receiveShadows = true;
    }

    const halo = CreatePlane(`${body.id}-halo`, { size: 1 }, scene);
    halo.parent = root;
    halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
    halo.isPickable = false;
    const haloMaterial = new StandardMaterial(`${body.id}-halo-material`, scene);
    haloMaterial.diffuseColor = Color3.Black();
    haloMaterial.specularColor = Color3.Black();
    haloMaterial.opacityTexture = haloTexture;
    haloMaterial.emissiveTexture = haloTexture;
    haloMaterial.alphaMode = Engine.ALPHA_ADD;
    haloMaterial.disableLighting = true;
    haloMaterial.alpha = 0.7;
    halo.material = haloMaterial;
    glow.addExcludedMesh(halo);
    rays?.excludedMeshes.push(halo);

    return {
      mesh,
      material,
      halo,
      haloMaterial,
      orbit: null,
      orbitMaterial: null,
      depth,
      ordinal,
      struck: 99,
      light: Color3.White(),
      register: 0.5,
      ring: null,
      trail: null,
      trailPoints: [],
      rest: new Float32Array(mesh.getVerticesData(VertexBuffer.PositionKind) ?? []),
      indices: mesh.getIndices() ?? [],
    };
  }

  function strike(visual: BodyVisual, midi: number, intensity: number) {
    visual.struck = 0;
    visual.ring = {
      amplitude: 0.05 + 0.13 * intensity,
      ripples: 4 + ((Math.max(46, Math.min(70, midi)) - 46) / 24) * 9,
      decaySeconds: decayFor(midi, intensity),
      age: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  /** Displace the sphere along its radius by a travelling ripple, then let it settle. */
  function quiver(visual: BodyVisual, dt: number) {
    const ring = visual.ring;
    if (!ring) return;
    ring.age += dt;
    const envelope = ring.amplitude * Math.exp((-3 * ring.age) / ring.decaySeconds);
    const rest = visual.rest;
    const positions = new Float32Array(rest.length);
    if (envelope < 0.002) {
      positions.set(rest);
      visual.ring = null;
    } else {
      const wave = ring.age * 18 + ring.phase;
      for (let i = 0; i < rest.length; i += 3) {
        const x = rest[i] ?? 0;
        const y = rest[i + 1] ?? 0;
        const z = rest[i + 2] ?? 0;
        const swell =
          1 +
          envelope *
            (Math.sin(y * ring.ripples + wave) * 0.7 +
              Math.sin(x * ring.ripples * 0.6 - wave) * 0.3);
        positions[i] = x * swell;
        positions[i + 1] = y * swell;
        positions[i + 2] = z * swell;
      }
    }
    visual.mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, visual.indices, normals);
    visual.mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }

  function createOrbit(body: Body, visual: BodyVisual) {
    const orbit = CreateTorus(
      `${body.id}-orbit`,
      { diameter: 2, thickness: 0.012, tessellation: 160 },
      scene,
    );
    orbit.parent = root;
    orbit.isPickable = false;
    const material = new StandardMaterial(`${body.id}-orbit-material`, scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    orbit.material = material;
    visual.orbit = orbit;
    visual.orbitMaterial = material;
  }

  function syncBodies(state: InstrumentState) {
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    const ordinals = new Map<BodyId | null, number>();
    for (const body of state.bodies) {
      const depth = depthOf(body, byId);
      const ordinal = ordinals.get(body.parentId) ?? 0;
      ordinals.set(body.parentId, ordinal + 1);
      let visual = visuals.get(body.id);
      if (!visual) {
        visual = createVisual(body, depth, ordinal);
        visuals.set(body.id, visual);
      }
      visual.depth = depth;
      // The sun's contact disc is large so it can be struck; on screen it is drawn
      // smaller inside its halo, so orbits read as clearing it.
      visual.mesh.scaling.setAll(body.discRadius * (depth === 0 ? 1.2 : 2));
      visual.halo.scaling.setAll(body.discRadius * (depth === 0 ? 7 : 4.5));
      if (body.parentId !== null && !visual.orbit) createOrbit(body, visual);
      if (visual.orbit)
        visual.orbit.scaling.set(
          body.orbitRadius,
          1,
          body.orbitRadius * Math.sqrt(1 - body.eccentricity ** 2),
        );
      tintFor(visual, state, body.id);
    }
    for (const [id, visual] of visuals) {
      if (byId.has(id)) continue;
      visual.mesh.dispose();
      visual.material.dispose();
      visual.halo.dispose();
      visual.haloMaterial.dispose();
      visual.orbit?.dispose();
      visual.orbitMaterial?.dispose();
      visual.trail?.dispose();
      visuals.delete(id);
    }
    const extent = reach(state);
    if (extent !== lastReach) {
      lastReach = extent;
      framingRadius = Math.max(7, extent * 2.6);
      if (!visitorZoomed) framing = true;
    }
  }

  /**
   * Each orbiting body leaves a short thread behind it. Moons of moons draw
   * epicycles; the thread is what makes the spirograph legible.
   */
  function trace(visual: BodyVisual, x: number, z: number) {
    if (options.reducedMotion) return;
    const points = visual.trailPoints;
    // The trail is as long as the note rings: the mix's decay sets its length.
    const wanted = Math.max(12, Math.round(TRAIL_SAMPLES * mixStore.getMix().decay));
    if (visual.trail && points.length !== wanted) {
      visual.trail.dispose();
      visual.trail = null;
      points.length = 0;
    }
    if (points.length === 0) {
      for (let i = 0; i < wanted; i++) points.push(new Vector3(x, 0, z));
    } else {
      const recycled = points.shift() as Vector3;
      recycled.set(x, 0, z);
      points.push(recycled);
    }
    if (!visual.trail) {
      const colors = points.map((_, i) => {
        const t = i / (wanted - 1);
        return new Color4(1, 1, 1, t * t * 0.55);
      });
      const trail = CreateLines(
        `${visual.mesh.name}-trail`,
        { points, colors, updatable: true, useVertexAlpha: true },
        scene,
      );
      trail.isPickable = false;
      trail.alpha = 0.8;
      glow.addExcludedMesh(trail);
      rays?.excludedMeshes.push(trail);
      visual.trail = trail;
    } else {
      CreateLines(visual.trail.name, { points, instance: visual.trail }, scene);
    }
    visual.trail.color = visual.light;
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

  function spawnBurst(x: number, z: number, radius: number, born: number, intensity: number) {
    let burst = burstPool.pop();
    if (!burst) {
      const mesh = CreatePlane("burst", { size: 1 }, scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      const material = new StandardMaterial("burst-material", scene);
      material.disableLighting = true;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.opacityTexture = burstTexture;
      material.emissiveTexture = burstTexture;
      material.alphaMode = Engine.ALPHA_ADD;
      mesh.material = material;
      glow.addExcludedMesh(mesh);
      burst = { mesh, material, born, radius, intensity };
    }
    burst.born = born;
    burst.radius = radius;
    burst.intensity = intensity;
    burst.material.emissiveColor = palette.flash;
    burst.mesh.position.set(x, 0, z);
    burst.mesh.isVisible = false;
    bursts.push(burst);
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
      const grow = options.reducedMotion ? 1.6 : 1 + eased * 2.6;
      flash.mesh.scaling.setAll(flash.radius * grow);
      flash.mesh.color = Color3.Lerp(
        new Color3(palette.clear.r, palette.clear.g, palette.clear.b),
        palette.flash,
        (1 - age) * 0.95,
      );
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i];
      if (!burst) continue;
      const age = (time - burst.born) / BURST_LIFE;
      if (age < 0) {
        burst.mesh.isVisible = false;
        continue;
      }
      if (age >= 1) {
        burst.mesh.isVisible = false;
        bursts.splice(i, 1);
        burstPool.push(burst);
        continue;
      }
      burst.mesh.isVisible = true;
      const fade = (1 - age) ** 2;
      const size = burst.radius * (2.2 + age * 3.5) * (0.6 + burst.intensity);
      burst.mesh.scaling.setAll(options.reducedMotion ? burst.radius * 3 : size);
      burst.material.alpha = fade * (0.35 + 0.65 * burst.intensity);
    }
  }

  /**
   * On a landscape canvas the controls overlay the bottom, so the target is
   * pulled toward the eye and the orrery rides high. Seen from below the
   * screen direction reverses, so the sign follows the view. On a portrait
   * canvas the controls sit under the sky and no offset is needed.
   */
  function targetOffset(): number {
    const landscape = engine.getRenderWidth() > engine.getRenderHeight();
    if (!landscape) return 0;
    return currentView === "telescope" ? -framingRadius * 0.2 : framingRadius * 0.08;
  }

  function applyFrame(frame: RenderFrame, state: InstrumentState, dt: number) {
    const byId = new Map(state.bodies.map((body) => [body.id, body]));
    const positions = new Map(frame.positions.map((position) => [position.id, position]));
    for (const [id, visual] of visuals) {
      const position = positions.get(id);
      const body = byId.get(id);
      if (!position || !body) continue;
      visual.mesh.position.set(position.x, 0, position.y);
      visual.halo.position.set(position.x, 0, position.y);
      if (body.parentId !== null) trace(visual, position.x, position.y);
      visual.struck += dt;
      // The halo swells when the body is struck and settles over about a second.
      const pulse = Math.exp(-visual.struck * 3);
      // Low notes throw a wide dim halo; high notes a small bright one.
      const spread = visual.depth === 0 ? 5 : 3 + (1 - visual.register) * 3;
      const base = body.discRadius * spread;
      visual.halo.scaling.setAll(base * (1 + pulse * 0.6));
      visual.haloMaterial.alpha =
        (visual.depth === 0 ? 0.3 : 0.35 + 0.3 * visual.register) + pulse * 0.45;
      if (!options.reducedMotion) {
        visual.mesh.rotation.y += dt * (visual.depth === 0 ? 0.05 : 0.2);
        quiver(visual, dt);
      }
      if (visual.orbit && body.parentId !== null) {
        const parent = positions.get(body.parentId);
        if (parent) {
          // The parent sits at one focus. The guide is the unit ring stretched to the
          // ellipse, turned to the periapsis, and slid back along it by a times e.
          const a = body.orbitRadius;
          const e = body.eccentricity;
          const b = a * Math.sqrt(1 - e * e);
          const cos = Math.cos(body.periapsisRadians);
          const sin = Math.sin(body.periapsisRadians);
          visual.orbit.position.set(parent.x - cos * a * e, 0, parent.y - sin * a * e);
          visual.orbit.scaling.set(a, 1, b);
          visual.orbit.rotation.y = -body.periapsisRadians;
        }
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
      // Heavy contacts throw a wider burst; shaded ones a dimmer one.
      spawnFlash(x, z, radius * (1 + contact.weight * 0.6), frame.time);
      spawnBurst(x, z, radius, frame.time, contact.intensity * (1 - contact.shade * 0.6));
      const va = visuals.get(contact.a);
      const vb = visuals.get(contact.b);
      const mirror = currentView === "pool" ? -1 : 1;
      const anchor = state.anchorMidi;
      if (va) strike(va, anchor + mirror * (contact.pitchA - anchor), contact.intensity);
      if (vb) strike(vb, anchor + mirror * (contact.pitchB - anchor), contact.intensity);
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
      zoom += (framingRadius - zoom) * step;
      const wantedZ = targetOffset();
      camera.target.z += (wantedZ - camera.target.z) * step;
      const settled =
        Math.abs(framingRadius - zoom) < 0.01 && Math.abs(wantedZ - camera.target.z) < 0.01;
      if (settled) framing = false;
    }

    // The drift: a slow figure the eye barely notices, mirrored below. The sun
    // stays at the centre of the frame while the eye circles it.
    if (!options.reducedMotion) drift += dt;
    if (!framing) {
      camera.target.x += (0 - camera.target.x) * 0.01;
      camera.target.z += (targetOffset() - camera.target.z) * 0.01;
    }
    const above = currentView === "telescope";
    // A full circuit takes minutes; the pitch of the eye rises and falls slower still.
    const alpha = -Math.PI / 2 + (drift / CIRCUIT_SECONDS) * Math.PI * 2;
    const betaBase = above ? CAMERA_BETA_ABOVE : Math.PI - CAMERA_BETA_ABOVE;
    const beta = betaBase + Math.sin(drift / 97) * DRIFT_BETA * (above ? 1 : -1);
    const breathe = 1 + Math.sin(drift / 131) * 0.14;
    camera.alpha = alpha;
    camera.beta = beta;
    camera.radius = zoom * breathe;
    // The plate slides against the drift so it reads as far away.
    const plate = plates[currentView];
    plate.offset.set(Math.sin(alpha + Math.PI / 2) * 0.04, (beta - betaBase) * 0.1);
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
  zoom = framingRadius;
  camera.radius = zoom;
  camera.target.z = targetOffset();
  applyPalette();

  let lastNow = performance.now();
  function renderFrame() {
    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    const state = store.getState();
    if (state !== lastState) {
      syncBodies(state);
      lastState = state;
    }
    const view = state.activeView ?? "telescope";
    if (view !== currentView) setView(view);
    applyFrame(runtime.tick(dt), state, dt);
    scene.render();
  }
  engine.runRenderLoop(renderFrame);
  if (import.meta.env.DEV) {
    (window as unknown as { __orrery: unknown }).__orrery = {
      scene,
      camera,
      engine,
      visuals,
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
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      engine.stopRenderLoop();
      for (const mesh of starMeshes) mesh.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
