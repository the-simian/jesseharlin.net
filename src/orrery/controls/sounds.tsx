import { type CSSProperties, type MouseEvent, useEffect, useState } from "react";
import {
  PATCH_COLORS,
  PATCH_NAMES,
  PATCH_NOTES,
  PATCHES_FOR_ROLE,
  patchOf,
  placeOf,
  roleOf,
} from "../model/patches";
import { depthOf } from "../model/tree";
import type { Body, PatchName } from "../model/types";

export function swatchColor(patch: PatchName): string {
  const [r, g, b] = PATCH_COLORS[patch];
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

/** The cast as it would be written into an ensemble, for sharing. */
export function describeCast(bodies: readonly Body[], presetId: string | null): string {
  const cast = Object.fromEntries(
    bodies.map((body) => [placeOf(body, bodies), patchOf(body, bodies)]),
  );
  return JSON.stringify({ preset: presetId, cast }, null, 2);
}

/**
 * The sounds: one row per body in play, one circle per patch its role can
 * play. A radio row, nothing more; the chosen circle is filled and named.
 */
export function Sounds({
  bodies,
  presetId,
  onPatch,
}: {
  bodies: Body[];
  presetId: string | null;
  onPatch: (id: string, patch: PatchName) => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(describeCast(bodies, presetId));
      setCopied(true);
    } catch {
      // No clipboard; nothing to do.
    }
  };
  const byId = new Map(bodies.map((body) => [body.id, body]));
  return (
    <details className="sounds">
      <summary className="sounds-summary">
        Sounds
        <button
          type="button"
          className="mixer-copy"
          onClick={copy}
          title="Copy the cast as JSON"
          aria-label="Copy the cast as JSON"
        >
          {copied ? "copied" : "copy"}
        </button>
      </summary>
      <div className="sounds-rows">
        {bodies.map((body) => (
          <CastRow
            key={body.id}
            body={body}
            bodies={bodies}
            role={roleOf(depthOf(body, byId))}
            onPatch={onPatch}
          />
        ))}
      </div>
    </details>
  );
}

function CastRow({
  body,
  bodies,
  role,
  onPatch,
}: {
  body: Body;
  bodies: Body[];
  role: "sun" | "planet" | "moon";
  onPatch: (id: string, patch: PatchName) => void;
}) {
  const chosen = patchOf(body, bodies);
  const place = placeOf(body, bodies);
  return (
    <fieldset className="cast-row">
      <legend className="cast-place">{place}</legend>
      <span className="cast-circles">
        {PATCHES_FOR_ROLE[role].map((patch) => (
          <label
            key={patch}
            className="cast-circle"
            title={`${PATCH_NAMES[patch]}: ${PATCH_NOTES[patch]}`}
            style={{ "--swatch": swatchColor(patch) } as CSSProperties}
          >
            <input
              type="radio"
              name={`cast-${body.id}`}
              value={patch}
              checked={patch === chosen}
              onChange={() => onPatch(body.id, patch)}
            />
            <span className="cast-dot" aria-hidden="true" />
            <span className="visually-hidden">{PATCH_NAMES[patch]}</span>
          </label>
        ))}
      </span>
      <span className="cast-name">{PATCH_NAMES[chosen]}</span>
    </fieldset>
  );
}
