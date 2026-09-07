import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { ViewName } from "../model/types";

/**
 * Two palettes, one instrument. Above: indigo sky, engraved cream orbits,
 * matte red-earth bodies, a brass sun. Below: cream paper, the same bodies in
 * ink, mirrored. Hex values are the site's tokens; keep them in step with
 * src/styles.css.
 */
export type Palette = {
  clear: Color4;
  orbit: Color3;
  orbitAlpha: number;
  sun: Color3;
  sunEmissive: Color3;
  planet: Color3;
  moon: Color3;
  selection: Color3;
  flash: Color3;
  ambientUp: Color3;
  ambientDown: Color3;
  star: Color3;
};

const hex = (value: string) => Color3.FromHexString(value);

export const PALETTES: Record<ViewName, Palette> = {
  telescope: {
    clear: Color4.FromHexString("#0f0e14ff"),
    orbit: hex("#efe6d3"),
    orbitAlpha: 0.28,
    sun: hex("#d9a520"),
    sunEmissive: hex("#4a3708"),
    planet: hex("#a84a32"),
    moon: hex("#cfc3a8"),
    selection: hex("#d9a520"),
    flash: hex("#efe6d3"),
    ambientUp: hex("#3a3550"),
    ambientDown: hex("#0f0e14"),
    star: hex("#efe6d3"),
  },
  pool: {
    clear: Color4.FromHexString("#efe6d3ff"),
    orbit: hex("#23211d"),
    orbitAlpha: 0.45,
    sun: hex("#b8891a"),
    sunEmissive: hex("#000000"),
    planet: hex("#23211d"),
    moon: hex("#5a554b"),
    selection: hex("#a84a32"),
    flash: hex("#23211d"),
    ambientUp: hex("#efe6d3"),
    ambientDown: hex("#cfc3a8"),
    star: hex("#efe6d3"),
  },
};
