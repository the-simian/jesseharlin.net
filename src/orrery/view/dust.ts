import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Layer } from "@babylonjs/core/Layers/layer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ViewName } from "../model/types";
import { PALETTES } from "./palette";
import { createHaze } from "./textures";

/**
 * The dust: a haze on the orbital plane that the sun lights, and what the
 * bodies shade from it. The haze and the bodies' streaks are drawn into their
 * own half-resolution pass, the streaks cut out of the glow, and the pass is
 * added over the painted plate and under everything else. A shadow here takes
 * away lit dust and nothing else: the plate behind it is never darkened, and
 * the bodies draw over their own streaks. The half resolution is a free
 * softness.
 */

/** Meshes on this layer are seen only by the dust pass. */
const DUST_LAYER = 0x10000000;
const RATIO = 0.5;

export function createDust(scene: Scene, engine: Engine, follow: ArcRotateCamera) {
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
  // Sized by hand: a ratio would be rounded to a power of two, and the pass
  // must keep the eye's exact aspect or the streaks land beside their bodies.
  const size = () => ({
    width: Math.max(2, Math.floor(engine.getRenderWidth() * RATIO)),
    height: Math.max(2, Math.floor(engine.getRenderHeight() * RATIO)),
  });
  const pass = new RenderTargetTexture("dust", size(), scene, {
    generateMipMaps: false,
    samplingMode: Texture.BILINEAR_SAMPLINGMODE,
  });
  pass.activeCamera = camera;
  pass.clearColor = new Color4(0, 0, 0, 0);
  pass.renderList = [];
  scene.customRenderTargets.push(pass);
  const resize = engine.onResizeObservable.add(() => pass.resize(size()));
  // Behind the scene, in front of the plate: the layer is added where it is created.
  const layer = new Layer("dust-layer", null, scene, true);
  layer.texture = pass;
  // Source plus destination, ignoring alpha: the pass writes colour, not coverage.
  layer.alphaBlendingMode = Engine.ALPHA_ONEONE;

  const hazeTexture = createHaze(scene);
  const hazeMaterial = new StandardMaterial("haze-material", scene);
  hazeMaterial.disableLighting = true;
  hazeMaterial.diffuseColor = Color3.Black();
  hazeMaterial.specularColor = Color3.Black();
  hazeMaterial.emissiveTexture = hazeTexture;
  // The gradient is both the colour and the opacity: squared, the glow keeps to the sun.
  hazeMaterial.opacityTexture = hazeTexture;
  hazeMaterial.alphaMode = Engine.ALPHA_ADD;
  hazeMaterial.backFaceCulling = false;
  hazeMaterial.disableDepthWrite = true;
  hazeMaterial.fogEnabled = false;
  hazeMaterial.alpha = 0.45;
  const haze = CreateGround("haze", { width: 1, height: 1 }, scene);
  haze.material = hazeMaterial;
  haze.isPickable = false;
  haze.position.y = -0.002;
  // First in the pass, so the shadows are cut from it.
  haze.alphaIndex = -2;

  function add(mesh: AbstractMesh) {
    mesh.layerMask = DUST_LAYER;
    pass.renderList?.push(mesh);
  }
  add(haze);

  return {
    add,
    remove(mesh: AbstractMesh) {
      const list = pass.renderList;
      if (!list) return;
      const index = list.indexOf(mesh);
      if (index >= 0) list.splice(index, 1);
    },
    setView(view: ViewName) {
      hazeMaterial.emissiveColor = PALETTES[view].haze;
    },
    /** The haze reaches well past the farthest orbit. */
    setReach(extent: number) {
      const diameter = Math.max(24, extent * 3.2);
      haze.scaling.set(diameter, 1, diameter);
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
      engine.onResizeObservable.remove(resize);
      const index = scene.customRenderTargets.indexOf(pass);
      if (index >= 0) scene.customRenderTargets.splice(index, 1);
      haze.dispose();
      hazeMaterial.dispose();
      hazeTexture.dispose();
      layer.dispose();
      pass.dispose();
      camera.dispose();
    },
  };
}

export type Dust = ReturnType<typeof createDust>;
