import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

/** A soft radial disc, white in the centre and clear at the edge, for halos and bursts. */
export function createSoftDisc(scene: Scene, name: string, hardness: number): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture(name, size, scene, true);
  const context = texture.getContext();
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(hardness, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}

/** Painted surfaces are loaded once and shared between bodies. */
export function createSurfaceCache(scene: Scene) {
  const surfaces = new Map<string, Texture>();
  return (url: string): Texture => {
    let texture = surfaces.get(url);
    if (!texture) {
      texture = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      surfaces.set(url, texture);
    }
    return texture;
  };
}
