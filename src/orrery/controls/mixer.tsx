import { type MouseEvent, useEffect, useState } from "react";
import { describeMix, MIX_RANGE, type Mix } from "../mix";

const LABELS: Record<keyof Mix, { name: string; note: string }> = {
  bells: { name: "Planets", note: "the bells of space" },
  drone: { name: "Sun", note: "drone of eternity" },
  reverb: { name: "Cosmos", note: "the size of eternity" },
  decay: { name: "Tail", note: "the decay of motion" },
};

function readout(key: keyof Mix, value: number): string {
  return key === "decay" ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`;
}

/** Four sliders: the mix. Big enough to grab, with a readout, and a copy of the levels to share. */
export function Mixer({
  mix,
  presetId,
  onLevel,
}: {
  mix: Mix;
  presetId: string | null;
  onLevel: (key: keyof Mix, value: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async (event: MouseEvent) => {
    // The button sits inside the summary; it must not fold the panel.
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(describeMix(mix, presetId));
      setCopied(true);
    } catch {
      // No clipboard; nothing to do.
    }
  };
  return (
    <details className="mixer">
      <summary className="mixer-summary">
        Mix
        <button
          type="button"
          className="mixer-copy"
          onClick={copy}
          title="Copy the mix as JSON"
          aria-label="Copy the mix as JSON"
        >
          {copied ? "copied" : "copy"}
        </button>
      </summary>
      {(Object.keys(LABELS) as (keyof Mix)[]).map((key) => (
        <label key={key} className="mixer-field">
          <span className="mixer-label">
            <span className="mixer-name">
              {LABELS[key].name}
              <output className="mixer-readout">{readout(key, mix[key])}</output>
            </span>
            <small>{LABELS[key].note}</small>
          </span>
          <input
            type="range"
            className="mixer-input"
            min={MIX_RANGE[key].min}
            max={MIX_RANGE[key].max}
            step={MIX_RANGE[key].step}
            value={mix[key]}
            aria-valuetext={readout(key, mix[key])}
            onChange={(event) => onLevel(key, Number(event.target.value))}
          />
        </label>
      ))}
    </details>
  );
}
