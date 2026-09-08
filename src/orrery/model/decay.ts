/**
 * How long a note rings, in seconds, before any mix scaling.
 *
 * Register shapes it: low notes ring for seconds, the anchor for a couple, high
 * notes for a fraction. Mass lengthens it (a gong keeps ringing) and closing
 * speed shortens it (a hard hit chokes). The audio engine and the view both
 * read this so a body quivers exactly as long as it sounds.
 */
export function decayCurve(
  midi: number,
  velocity: number,
  weight?: number,
  closing = 0,
  anchorMidi = 58,
): number {
  const register = Math.max(46, Math.min(70, midi - anchorMidi + 58));
  const base =
    register <= 58
      ? 5 * (2.2 / 5) ** ((register - 46) / 12)
      : 2.2 * (0.5 / 2.2) ** ((register - 58) / 12);
  const registerDecay = base * (1 + 0.25 * clamp(velocity));
  if (weight === undefined) return registerDecay;
  return Math.max(
    0.4,
    Math.min(10, (registerDecay + 5 * clamp(weight) ** 3) / (1 + 0.08 * Math.max(0, closing))),
  );
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
