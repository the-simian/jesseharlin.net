import { Engine } from "@babylonjs/core/Engines/engine";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import type { Scene } from "@babylonjs/core/scene";
import type { Palette } from "./palette";
import { createSoftDisc } from "./textures";

/**
 * What a contact looks like: an expanding ring (a flash) and a soft additive
 * disc that blooms and fades (a burst). Both are pooled; nothing is allocated
 * once the pools are warm.
 */

const CIRCLE_SEGMENTS = 96;
const FLASH_LIFE = 0.55;
const BURST_LIFE = 0.9;

export function unitCircle(y = 0): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle), y, Math.sin(angle)));
  }
  return points;
}

type Flash = { mesh: LinesMesh; born: number; radius: number };
type Burst = {
  mesh: Mesh;
  material: StandardMaterial;
  born: number;
  radius: number;
  intensity: number;
};

export function createEffects(scene: Scene, glow: GlowLayer, reducedMotion: () => boolean) {
  const flashes: Flash[] = [];
  const flashPool: LinesMesh[] = [];
  const bursts: Burst[] = [];
  const burstPool: Burst[] = [];
  const burstTexture = createSoftDisc(scene, "burst", 0.5);
  const background = new Color3(0, 0, 0);
  const flashColor = new Color3(0, 0, 0);
  let rays: VolumetricLightScatteringPostProcess | null = null;

  function flash(x: number, z: number, radius: number, born: number, palette: Palette) {
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

  function burst(
    x: number,
    z: number,
    radius: number,
    born: number,
    intensity: number,
    palette: Palette,
  ) {
    let item = burstPool.pop();
    if (!item) {
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
      rays?.excludedMeshes.push(mesh);
      item = { mesh, material, born, radius, intensity };
    }
    item.born = born;
    item.radius = radius;
    item.intensity = intensity;
    item.material.emissiveColor = palette.flash;
    item.mesh.position.set(x, 0, z);
    item.mesh.isVisible = false;
    bursts.push(item);
  }

  function update(time: number, palette: Palette) {
    background.set(palette.clear.r, palette.clear.g, palette.clear.b);
    for (let i = flashes.length - 1; i >= 0; i--) {
      const item = flashes[i];
      if (!item) continue;
      const age = (time - item.born) / FLASH_LIFE;
      if (age < 0) {
        item.mesh.isVisible = false;
        continue;
      }
      if (age >= 1) {
        item.mesh.isVisible = false;
        flashPool.push(item.mesh);
        flashes.splice(i, 1);
        continue;
      }
      item.mesh.isVisible = true;
      const eased = 1 - (1 - age) * (1 - age);
      const grow = reducedMotion() ? 1.6 : 1 + eased * 2.6;
      item.mesh.scaling.setAll(item.radius * grow);
      Color3.LerpToRef(background, palette.flash, (1 - age) * 0.95, flashColor);
      item.mesh.color = flashColor;
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const item = bursts[i];
      if (!item) continue;
      const age = (time - item.born) / BURST_LIFE;
      if (age < 0) {
        item.mesh.isVisible = false;
        continue;
      }
      if (age >= 1) {
        item.mesh.isVisible = false;
        bursts.splice(i, 1);
        burstPool.push(item);
        continue;
      }
      item.mesh.isVisible = true;
      const fade = (1 - age) ** 2;
      const size = item.radius * (2.2 + age * 3.5) * (0.6 + item.intensity);
      item.mesh.scaling.setAll(reducedMotion() ? item.radius * 3 : size);
      item.material.alpha = fade * (0.35 + 0.65 * item.intensity);
    }
  }

  return {
    flash,
    burst,
    update,
    /** Bursts must not occlude the sun's rays; register the post-process once it exists. */
    setRays(next: VolumetricLightScatteringPostProcess | null) {
      rays = next;
      if (rays) for (const item of [...bursts, ...burstPool]) rays.excludedMeshes.push(item.mesh);
    },
  };
}

export type Effects = ReturnType<typeof createEffects>;
