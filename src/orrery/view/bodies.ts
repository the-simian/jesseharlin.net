import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import type { Scene } from "@babylonjs/core/scene";
import type { MixStore } from "../mix";
import { decayCurve } from "../model/decay";
import { defaultPatchOf, PATCH_COLORS, patchOf } from "../model/patches";
import { soundingPitch } from "../model/pitch";
import { depthOf } from "../model/tree";
import type { Body, BodyId, BodyPosition, InstrumentState, ViewName } from "../model/types";
import type { Dust } from "./dust";
import type { Palette } from "./palette";
import { createShadowWedge, createSoftDisc, createSurfaceCache } from "./textures";

/**
 * The bodies as drawn. Each is a translucent shell with a fresnel rim over a
 * painted surface, a halo sprite behind it, an orbit guide around its parent,
 * and a trail. Geometry is found or created by body id and updated in place;
 * nothing is rebuilt on a state change.
 *
 * A body wears its note: register sets the temperature of its light, pitch
 * class turns the hue a little, and a struck body quivers for as long as the
 * note rings. Low notes throw a wide dim halo; high notes a small bright one.
 *
 * Each orbiting body owns its shadow: a long streak on the plane pointing away
 * from the sun, starting inside the body so it meets the body's sides, cut out
 * of the lit dust in the dust pass and nothing else. No light is traced; the
 * body carries the shadow with it. The composer can switch the shadows off on
 * a slow device.
 */

/** Painted surfaces, by depth, served from public/planets. Planets alternate. */
const SURFACES = {
  planet: ["/planets/crystal.jpg", "/planets/bands.jpg"],
  moon: ["/planets/moon.jpg"],
};
/** Trail length in samples at a ring multiplier of one; one sample per rendered frame. */
const TRAIL_SAMPLES = 80;
/** How much of the lit dust a streak takes at rest; a struck body's streak flickers around it. */
const SHADOW_DARKNESS = 0.85;
/** The penumbra: wider, and much fainter. */
const PENUMBRA_DARKNESS = 0.3;
const PENUMBRA_WIDTH = 1.45;

/** A struck body's shape rings down with its note. */
type Ringing = {
  amplitude: number;
  ripples: number;
  decaySeconds: number;
  age: number;
  phase: number;
};

type Trail = {
  mesh: LinesMesh;
  /** A ring buffer of positions; head is the oldest sample. */
  buffer: Float32Array;
  /** The ring unrolled oldest to newest, uploaded each frame. */
  ordered: Float32Array;
  head: number;
  length: number;
};

export type BodyVisual = {
  mesh: Mesh;
  material: StandardMaterial;
  halo: Mesh;
  haloMaterial: StandardMaterial;
  orbit: Mesh | null;
  orbitMaterial: StandardMaterial | null;
  shadow: Mesh | null;
  shadowMaterial: StandardMaterial | null;
  penumbra: Mesh | null;
  depth: number;
  /** The colour of this body's light, from its pitch. */
  light: Color3;
  /** 0 low to 1 high, from the sounding pitch. */
  register: number;
  /** Seconds since this body's last contact, for the halo's pulse. */
  struck: number;
  ring: Ringing | null;
  trail: Trail | null;
  /** Unit-sphere positions, kept so the quiver can be undone. */
  rest: Float32Array;
  scratch: Float32Array;
};

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

export type BodiesOptions = {
  scene: Scene;
  root: TransformNode;
  glow: GlowLayer;
  mixStore: MixStore;
  dust: Dust;
  reducedMotion: () => boolean;
  /** Called when the sun's mesh is created, so the composer can hang the rays on it. */
  onSun: (mesh: Mesh) => VolumetricLightScatteringPostProcess | null;
};

export function createBodies(options: BodiesOptions) {
  const { scene, root, glow, mixStore, dust } = options;
  const visuals = new Map<BodyId, BodyVisual>();
  const haloTexture = createSoftDisc(scene, "halo", 0.18);
  const wedgeTexture = createShadowWedge(scene);
  const penumbraTexture = createShadowWedge(scene, true);
  /**
   * A streak is black laid over the lit dust with the wedge as its opacity; in
   * the dust pass that takes the dust away and touches nothing else. One
   * painted wedge is shared by every streak; each umbra has its own material so
   * it can flicker alone. Built, not cloned: a cloned dynamic texture is blank.
   */
  function createShadowMaterial(
    name: string,
    darkness: number,
    mask: DynamicTexture = wedgeTexture,
  ): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = Color3.Black();
    material.opacityTexture = mask;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.fogEnabled = false;
    material.alpha = darkness;
    return material;
  }
  const penumbraMaterial = createShadowMaterial(
    "penumbra-material",
    PENUMBRA_DARKNESS,
    penumbraTexture,
  );
  let shadowsOn = true;
  const surface = createSurfaceCache(scene);
  let rays: VolumetricLightScatteringPostProcess | null = null;
  let byId = new Map<BodyId, Body>();

  function createVisual(body: Body, depth: number, ordinal: number): BodyVisual {
    const mesh = CreateSphere(body.id, { diameter: 1, segments: 28, updatable: true }, scene);
    mesh.parent = root;
    const material = new StandardMaterial(`${body.id}-material`, scene);
    material.specularColor = Color3.Black();
    // Bodies are near opaque so their shadows meet their sides; the rim keeps the glass.
    material.alpha = depth === 0 ? 0.95 : 0.94;
    material.emissiveFresnelParameters = new FresnelParameters({
      bias: 0.25,
      power: 2.2,
      leftColor: Color3.White(),
      rightColor: Color3.Black(),
    });
    material.opacityFresnelParameters = new FresnelParameters({
      bias: 0.85,
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
    if (depth === 0) rays = options.onSun(mesh);

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

    const rest = new Float32Array(mesh.getVerticesData(VertexBuffer.PositionKind) ?? []);
    return {
      mesh,
      material,
      halo,
      haloMaterial,
      orbit: null,
      orbitMaterial: null,
      shadow: null,
      shadowMaterial: null,
      penumbra: null,
      depth,
      light: Color3.White(),
      register: 0.5,
      struck: 99,
      ring: null,
      trail: null,
      rest,
      scratch: new Float32Array(rest.length),
    };
  }

  function createOrbit(body: Body, visual: BodyVisual) {
    const orbit = CreateTorus(
      `${body.id}-orbit`,
      { diameter: 2, thickness: 0.012, tessellation: 160 },
      scene,
    );
    orbit.parent = root;
    orbit.isPickable = false;
    // Guides are thin; in the half-resolution ray pass they would read as dashes.
    rays?.excludedMeshes.push(orbit);
    const material = new StandardMaterial(`${body.id}-orbit-material`, scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    orbit.material = material;
    visual.orbit = orbit;
    visual.orbitMaterial = material;
  }

  function createShadow(body: Body, visual: BodyVisual) {
    const shadow = CreateGround(`${body.id}-shadow`, { width: 1, height: 1 }, scene);
    shadow.parent = root;
    shadow.isPickable = false;
    const material = createShadowMaterial(`${body.id}-shadow-material`, SHADOW_DARKNESS);
    shadow.material = material;
    visual.shadowMaterial = material;
    shadow.isVisible = shadowsOn;
    // After the haze in the dust pass, so it is cut from it.
    shadow.alphaIndex = 0;
    dust.add(shadow);
    visual.shadow = shadow;
    const penumbra = CreateGround(`${body.id}-penumbra`, { width: 1, height: 1 }, scene);
    penumbra.parent = root;
    penumbra.isPickable = false;
    penumbra.material = penumbraMaterial;
    penumbra.isVisible = shadowsOn;
    penumbra.alphaIndex = -1;
    dust.add(penumbra);
    visual.penumbra = penumbra;
  }

  /**
   * Point the streak away from the sun. Its length grows with the umbra, a body
   * of radius r at distance d from a sun of radius R throwing a cone d r / (R - r)
   * long, but it is drawn far longer than the cone, the way a streak of shadow
   * reads across a floor. It starts a radius behind the body's centre, so it
   * is exactly as wide as the body where it meets the body's sides.
   *
   * The streak never moves with a strike, but it flickers: its alpha rises and
   * falls at the same period as the ripple running over the body, and settles
   * as the note dies.
   */
  function castShadow(visual: BodyVisual, x: number, z: number, sunRadius: number) {
    const shadow = visual.shadow;
    const penumbra = visual.penumbra;
    if (!shadow || !penumbra) return;
    const distance = Math.hypot(x, z);
    const radius = visual.mesh.scaling.x / 2;
    if (distance < 1e-6 || radius <= 0) {
      shadow.isVisible = false;
      penumbra.isVisible = false;
      return;
    }
    shadow.isVisible = shadowsOn;
    penumbra.isVisible = shadowsOn;
    const umbra =
      sunRadius > radius ? (distance * radius) / (sunRadius - radius) : Number.POSITIVE_INFINITY;
    const length = Math.max(radius * 72, Math.min(150, umbra * 18));
    const dx = x / distance;
    const dz = z / distance;
    // The streak begins at the centroid: begun any further back, its near
    // corners show past the silhouette on the sun's side.
    const along = length / 2;
    // Through the equator: the streak crosses the body at its widest.
    const heading = -Math.atan2(dz, dx);
    shadow.position.set(x + dx * along, 0, z + dz * along);
    shadow.rotation.y = heading;
    // A touch under the diameter: the soft edge must end inside the silhouette.
    shadow.scaling.set(length, 1, radius * 1.9);
    penumbra.position.set(x + dx * along, 0, z + dz * along);
    penumbra.rotation.y = heading;
    penumbra.scaling.set(length, 1, radius * 1.9 * PENUMBRA_WIDTH);
    const ring = visual.ring;
    if (visual.shadowMaterial) {
      const envelope = ring ? ring.amplitude * Math.exp((-3 * ring.age) / ring.decaySeconds) : 0;
      const wave = ring ? Math.sin(ring.age * 18 + ring.phase) : 0;
      visual.shadowMaterial.alpha = Math.max(
        0.3,
        Math.min(1, SHADOW_DARKNESS + envelope * 2 * wave),
      );
    }
  }

  function tint(
    visual: BodyVisual,
    id: BodyId,
    state: InstrumentState,
    palette: Palette,
    view: ViewName,
  ) {
    const base = bodyColor(palette, visual.depth);
    const rim = glowColor(palette, visual.depth);
    const midi = soundingPitch(state, id, view);
    const register = Math.max(0, Math.min(1, (midi - 40) / 40));
    const pitchClass = ((midi % 12) + 12) % 12;
    const hueTurn = Color3.FromHSV((pitchClass / 12) * 360, 0.55, 1);
    const warmth = Color3.Lerp(palette.warm, palette.cool, register);
    let light = Color3.Lerp(
      rim,
      Color3.Lerp(warmth, hueTurn, 0.35),
      visual.depth === 0 ? 0.15 : 0.6,
    );
    // A body's colour says what it is cast to; a body on its role's default
    // patch keeps the palette's own colour.
    const body = state.bodies.find((candidate) => candidate.id === id);
    if (body && visual.depth > 0) {
      const sound = patchOf(body, state.bodies);
      if (sound !== defaultPatchOf(body, state.bodies)) {
        const [r, g, b] = PATCH_COLORS[sound];
        light = Color3.Lerp(light, new Color3(r, g, b), 0.5);
      }
    }
    visual.light = light;
    visual.register = register;
    visual.material.diffuseColor = base;
    visual.material.emissiveColor = light.scale(visual.depth === 0 ? 0.55 : 0.3);
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

  function strike(visual: BodyVisual, midi: number, intensity: number, anchorMidi: number) {
    visual.struck = 0;
    visual.ring = {
      amplitude: 0.05 + 0.13 * intensity,
      ripples: 4 + ((Math.max(46, Math.min(70, midi)) - 46) / 24) * 9,
      decaySeconds:
        decayCurve(midi, intensity, undefined, 0, anchorMidi) * 1.6 * mixStore.getMix().decay,
      age: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  /**
   * Displace the sphere along its radius by a travelling ripple, then let it
   * settle. Normals are left at rest: the swell is under a fifth of the radius
   * and the fresnel rim hides the difference.
   */
  function quiver(visual: BodyVisual, dt: number) {
    const ring = visual.ring;
    if (!ring) return;
    ring.age += dt;
    const envelope = ring.amplitude * Math.exp((-3 * ring.age) / ring.decaySeconds);
    const rest = visual.rest;
    const positions = visual.scratch;
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
  }

  /**
   * Each orbiting body leaves a short thread behind it, as long as its note
   * rings. Moons of moons draw epicycles; the thread makes the spirograph legible.
   */
  function trace(visual: BodyVisual, x: number, z: number) {
    const wanted = Math.max(12, Math.round(TRAIL_SAMPLES * mixStore.getMix().decay));
    let trail = visual.trail;
    if (trail && trail.length !== wanted) {
      trail.mesh.dispose();
      trail = null;
    }
    if (!trail) {
      const points: Vector3[] = [];
      const colors: Color4[] = [];
      for (let i = 0; i < wanted; i++) {
        points.push(new Vector3(x, 0, z));
        const t = i / (wanted - 1);
        colors.push(new Color4(1, 1, 1, t * t * 0.55));
      }
      const mesh = CreateLines(
        `${visual.mesh.name}-trail`,
        { points, colors, updatable: true, useVertexAlpha: true },
        scene,
      );
      mesh.isPickable = false;
      mesh.alpha = 0.8;
      glow.addExcludedMesh(mesh);
      rays?.excludedMeshes.push(mesh);
      const buffer = new Float32Array(wanted * 3);
      for (let i = 0; i < wanted; i++) buffer.set([x, 0, z], i * 3);
      trail = { mesh, buffer, ordered: new Float32Array(wanted * 3), head: 0, length: wanted };
      visual.trail = trail;
    }
    // Overwrite the oldest sample, then unroll the ring so the newest is last.
    const { buffer, ordered, length } = trail;
    buffer[trail.head * 3] = x;
    buffer[trail.head * 3 + 1] = 0;
    buffer[trail.head * 3 + 2] = z;
    trail.head = (trail.head + 1) % length;
    const tail = buffer.subarray(trail.head * 3);
    ordered.set(tail, 0);
    ordered.set(buffer.subarray(0, trail.head * 3), tail.length);
    trail.mesh.updateVerticesData(VertexBuffer.PositionKind, ordered);
    trail.mesh.color = visual.light;
  }

  function dispose(visual: BodyVisual) {
    visual.mesh.dispose();
    visual.material.dispose();
    visual.halo.dispose();
    visual.haloMaterial.dispose();
    visual.orbit?.dispose();
    visual.orbitMaterial?.dispose();
    if (visual.shadow) dust.remove(visual.shadow);
    if (visual.penumbra) dust.remove(visual.penumbra);
    visual.shadow?.dispose();
    visual.shadowMaterial?.dispose();
    visual.penumbra?.dispose();
    visual.trail?.mesh.dispose();
  }

  return {
    visuals,
    /** Create, update, or remove visuals to match the arrangement. */
    sync(state: InstrumentState, palette: Palette, view: ViewName) {
      byId = new Map(state.bodies.map((body) => [body.id, body]));
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
        if (body.parentId !== null && !visual.orbit) createOrbit(body, visual);
        if (body.parentId !== null && !visual.shadow) createShadow(body, visual);
        tint(visual, body.id, state, palette, view);
      }
      for (const [id, visual] of visuals) {
        if (byId.has(id)) continue;
        dispose(visual);
        visuals.delete(id);
      }
    },
    /** Re-tint every body; the palette or the view changed. */
    retint(state: InstrumentState, palette: Palette, view: ViewName) {
      for (const [id, visual] of visuals) tint(visual, id, state, palette, view);
    },
    /** Move every body to its delayed position and let struck bodies ring. */
    place(positions: Map<BodyId, BodyPosition>, dt: number) {
      const moving = !options.reducedMotion();
      let sunRadius = 0;
      for (const visual of visuals.values())
        if (visual.depth === 0) sunRadius = visual.mesh.scaling.x / 2;
      for (const [id, visual] of visuals) {
        const position = positions.get(id);
        const body = byId.get(id);
        if (!position || !body) continue;
        visual.mesh.position.set(position.x, 0, position.y);
        visual.halo.position.set(position.x, 0, position.y);
        if (visual.shadow) castShadow(visual, position.x, position.y, sunRadius);
        if (moving && body.parentId !== null) trace(visual, position.x, position.y);
        visual.struck += dt;
        const pulse = Math.exp(-visual.struck * 3);
        const spread = visual.depth === 0 ? 5 : 3 + (1 - visual.register) * 3;
        visual.halo.scaling.setAll(body.discRadius * spread * (1 + pulse * 0.6));
        visual.haloMaterial.alpha =
          (visual.depth === 0 ? 0.3 : 0.35 + 0.3 * visual.register) + pulse * 0.45;
        if (moving) {
          visual.mesh.rotation.y += dt * (visual.depth === 0 ? 0.05 : 0.2);
          quiver(visual, dt);
        }
        if (visual.orbit && body.parentId !== null) {
          const parent = positions.get(body.parentId);
          if (parent) {
            // The parent sits at one focus: the unit ring is stretched to the ellipse,
            // turned to the periapsis, and slid back along it by a times e.
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
    },
    strike(id: BodyId, midi: number, intensity: number, anchorMidi: number) {
      const visual = visuals.get(id);
      if (visual) strike(visual, midi, intensity, anchorMidi);
    },
    body: (id: BodyId) => byId.get(id),
    /** Shadows are the first thing to go on a slow device. */
    setShadows(on: boolean) {
      shadowsOn = on;
      for (const visual of visuals.values()) {
        if (visual.shadow) visual.shadow.isVisible = on;
        if (visual.penumbra) visual.penumbra.isVisible = on;
      }
    },
    dispose() {
      for (const visual of visuals.values()) dispose(visual);
      visuals.clear();
      penumbraMaterial.dispose();
      wedgeTexture.dispose();
      penumbraTexture.dispose();
    },
  };
}

export type Bodies = ReturnType<typeof createBodies>;
