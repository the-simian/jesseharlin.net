import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { ViewName } from "../model/types";

/**
 * Two palettes, one instrument. Above: the night through the telescope, indigo
 * void, copper nebula, brass sun, bodies lit from within. Below: the same sky
 * seen in still water, colder and greener, everything a little drowned. Hex
 * values are the site's tokens; keep them in step with src/styles.css.
 */
export type Palette = {
  clear: Color4;
  /** Painted plate behind everything, served from public/sky. */
  plate: string;
  orbit: Color3;
  orbitAlpha: number;
  sun: Color3;
  sunGlow: Color3;
  planet: Color3;
  planetGlow: Color3;
  moon: Color3;
  moonGlow: Color3;
  selection: Color3;
  flash: Color3;
  ambientUp: Color3;
  ambientDown: Color3;
  star: Color3;
  /** Strength of the glow layer. */
  glow: number;
  /** Light of the lowest and highest registers; a body's light sits between them. */
  warm: Color3;
  cool: Color3;
  /** The haze on the orbital plane that the shadows are cut from. */
  haze: Color3;
  /** How thick the fog is, per unit of distance. */
  fog: number;
};

const hex = (value: string) => Color3.FromHexString(value);

export const PALETTES: Record<ViewName, Palette> = {
  telescope: {
    clear: Color4.FromHexString("#0b0a12ff"),
    plate: "/sky/above.jpg",
    orbit: hex("#f2d9a6"),
    orbitAlpha: 0.55,
    sun: hex("#f0b53a"),
    sunGlow: hex("#d9a520"),
    planet: hex("#c9a98a"),
    planetGlow: hex("#e0863f"),
    moon: hex("#dfe6f2"),
    moonGlow: hex("#9fb6e0"),
    selection: hex("#d9a520"),
    flash: hex("#fff1cf"),
    ambientUp: hex("#5a4f7a"),
    ambientDown: hex("#0f0e14"),
    star: hex("#efe6d3"),
    glow: 0.9,
    warm: hex("#ff7a2a"),
    cool: hex("#bfe0ff"),
    haze: hex("#7a5a2c"),
    fog: 0.012,
  },
  pool: {
    clear: Color4.FromHexString("#050c0eff"),
    plate: "/sky/below.jpg",
    orbit: hex("#9fd6cf"),
    orbitAlpha: 0.45,
    sun: hex("#9fb07a"),
    sunGlow: hex("#7f9a62"),
    planet: hex("#9fbcb8"),
    planetGlow: hex("#3fb59f"),
    moon: hex("#cfe8e6"),
    moonGlow: hex("#6fc7d6"),
    selection: hex("#f0b53a"),
    flash: hex("#d6fff7"),
    ambientUp: hex("#123a3a"),
    ambientDown: hex("#03080a"),
    star: hex("#bfe3dd"),
    glow: 1.1,
    warm: hex("#c9a25a"),
    cool: hex("#8ff0ff"),
    haze: hex("#1f4a44"),
    fog: 0.016,
  },
};
