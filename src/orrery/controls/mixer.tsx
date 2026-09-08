import { MIX_RANGE, type Mix } from "../mix";

const LABELS: Record<keyof Mix, { name: string; note: string }> = {
  bells: { name: "Bells", note: "the struck voices" },
  drone: { name: "Drone", note: "the sun's hum" },
  reverb: { name: "Room", note: "how much the hall answers" },
  decay: { name: "Ring", note: "how long a note and its trail last" },
};

/** Four sliders: the mix. Big enough to grab; labelled in plain words. */
export function Mixer({
  mix,
  onLevel,
}: {
  mix: Mix;
  onLevel: (key: keyof Mix, value: number) => void;
}) {
  return (
    <details className="mixer">
      <summary className="mixer-summary">Mix</summary>
      {(Object.keys(LABELS) as (keyof Mix)[]).map((key) => (
        <label key={key} className="mixer-field">
          <span className="mixer-label">
            {LABELS[key].name} <small>{LABELS[key].note}</small>
          </span>
          <input
            type="range"
            className="mixer-input"
            min={MIX_RANGE[key].min}
            max={MIX_RANGE[key].max}
            step={MIX_RANGE[key].step}
            value={mix[key]}
            onChange={(event) => onLevel(key, Number(event.target.value))}
          />
        </label>
      ))}
    </details>
  );
}
