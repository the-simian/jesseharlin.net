import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Layer } from "@babylonjs/core/Layers/layer";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

/**
 * The dust: what the sun lights on the orbital plane, and what the bodies
 * shade from it. The haze and the streaks are drawn into their own
 * half-resolution pass, the streaks cut out of the glow, and the pass is added
 * over the sky. A shadow here takes away lit dust and nothing else: the stars
 * and the painted plate behind it are never darkened. The half resolution is
 * a free softness.
 */

/** Meshes on this layer are seen only by the dust pass. */
const DUST_LAYER = 0x10000000;

export function createDust(scene: Scene, follow: ArcRotateCamera) {
  const camera = new ArcRotateCamera(
    "dust-camera",
    follow.alpha,
    follow.beta,
    follow.radius,
    follow.target.clone(),
    scene,
  );
  camera.layerMask = DUST_LAYER;
  camera.minZ = follow.minZ;
  camera.maxZ = follow.maxZ;
  const pass = new RenderTargetTexture("dust", { ratio: 0.5 }, scene, {
    generateMipMaps: false,
    samplingMode: Texture.BILINEAR_SAMPLINGMODE,
  });
  pass.activeCamera = camera;
  pass.clearColor = new Color4(0, 0, 0, 0);
  pass.renderList = [];
  scene.customRenderTargets.push(pass);
  const layer = new Layer("dust-layer", null, scene, false);
  layer.texture = pass;
  // Source plus destination, ignoring alpha: the pass writes colour, not coverage.
  layer.alphaBlendingMode = Engine.ALPHA_ONEONE;

  return {
    /** Draw this mesh in the dust pass and nowhere else. */
    add(mesh: AbstractMesh) {
      mesh.layerMask = DUST_LAYER;
      pass.renderList?.push(mesh);
    },
    remove(mesh: AbstractMesh) {
      const list = pass.renderList;
      if (!list) return;
      const index = list.indexOf(mesh);
      if (index >= 0) list.splice(index, 1);
    },
    /** The dust is seen from exactly where the eye is. */
    tick() {
      camera.alpha = follow.alpha;
      camera.beta = follow.beta;
      camera.radius = follow.radius;
      camera.fov = follow.fov;
      camera.target.copyFrom(follow.target);
    },
    dispose() {
      const index = scene.customRenderTargets.indexOf(pass);
      if (index >= 0) scene.customRenderTargets.splice(index, 1);
      layer.dispose();
      pass.dispose();
      camera.dispose();
    },
  };
}

export type Dust = ReturnType<typeof createDust>;
