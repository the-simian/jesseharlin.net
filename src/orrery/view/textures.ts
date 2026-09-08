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

/**
 * A body's shadow, seen from above, as a darkness mask: white where the streak
 * is darkest, black where there is none. The streak is as wide as the body,
 * narrows only a little along its length, is soft at the edges, and fades as
 * it goes. The near end is at u = 0. In the dust pass the mask is an opacity:
 * where it is white the lit dust is taken away.
 */
export function createShadowWedge(scene: Scene, penumbra = false): DynamicTexture {
  const width = 256;
  const height = 64;
  const texture = new DynamicTexture(
    penumbra ? "penumbra-wedge" : "shadow-wedge",
    { width, height },
    scene,
    true,
  );
  const context = texture.getContext() as CanvasRenderingContext2D;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const v = Math.abs((y + 0.5) / height - 0.5) * 2;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      // The umbra starts at the body's width and converges; the penumbra starts
      // at the body's width too and spreads to the full quad over its first half.
      const halfWidth = penumbra ? 0.6 + 0.4 * Math.min(1, u / 0.5) : 0.92 - 0.7 * u;
      const edge = Math.max(0, Math.min(1, (halfWidth - v) / (penumbra ? 0.45 : 0.16)));
      const fadeIn = penumbra ? Math.min(1, u / 0.06) : 1;
      const mask = edge * edge * (3 - 2 * edge) * (1 - u) ** 0.8 * fadeIn;
      const offset = (y * width + x) * 4;
      const value = Math.round(mask * 255);
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  texture.update();
  texture.hasAlpha = true;
  texture.getAlphaFromRGB = true;
  return texture;
}

/**
 * The haze on the orbital plane: a wide soft glow, brightest at the sun and
 * thinning far out, the zodiacal light the shadows are cut from.
 */
export function createHaze(scene: Scene): DynamicTexture {
  const size = 512;
  const texture = new DynamicTexture("haze", size, scene, true);
  const context = texture.getContext();
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,0.6)");
  gradient.addColorStop(0.08, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.32)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}
