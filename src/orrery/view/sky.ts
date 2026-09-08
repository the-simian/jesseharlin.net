import type { Engine } from "@babylonjs/core/Engines/engine";
import { Layer } from "@babylonjs/core/Layers/layer";
import "@babylonjs/core/Shaders/layer.fragment";
import "@babylonjs/core/Shaders/layer.vertex";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PointsCloudSystem } from "@babylonjs/core/Particles/pointsCloudSystem";
import type { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import type { Scene } from "@babylonjs/core/scene";
import type { ViewName } from "../model/types";
import { PALETTES } from "./palette";

/**
 * The sky behind the arrangement: one painted plate per view, and a seeded
 * shell of stars in front of it so the plate has grain. The plate slides a
 * little against the camera so it reads as far away rather than pasted on.
 */

const STAR_COUNT = 1600;

/** Deterministic star placement so the sky is the same every visit. */
function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createSky(scene: Scene, engine: Engine) {
  let disposed = false;
  const plates: Record<ViewName, Layer> = {
    telescope: new Layer("plate-above", PALETTES.telescope.plate, scene, true),
    pool: new Layer("plate-below", PALETTES.pool.plate, scene, true),
  };
  for (const plate of Object.values(plates)) {
    plate.scale.set(1.12, 1.12);
    plate.isEnabled = false;
  }
  let current: ViewName = "telescope";
  let rays: VolumetricLightScatteringPostProcess | null = null;

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
        rays?.excludedMeshes.push(mesh);
        starMeshes.push(mesh);
      })
      .catch(() => undefined);
  };
  buildStars(STAR_COUNT, 1.1, 0.75);
  buildStars(Math.round(STAR_COUNT / 8), 2.4, 1);

  return {
    setView(view: ViewName) {
      current = view;
      for (const [name, plate] of Object.entries(plates)) plate.isEnabled = name === view;
    },
    /** Slide the current plate; the composer feeds it the camera's drift. */
    parallax(x: number, y: number) {
      plates[current].offset.set(x, y);
    },
    /** Stars must not occlude the sun's rays; register the post-process once it exists. */
    setRays(next: VolumetricLightScatteringPostProcess | null) {
      rays = next;
      if (rays) for (const mesh of starMeshes) rays.excludedMeshes.push(mesh);
    },
    dispose() {
      disposed = true;
      for (const mesh of starMeshes) mesh.dispose();
      for (const plate of Object.values(plates)) plate.dispose();
    },
  };
}

export type Sky = ReturnType<typeof createSky>;
