import type { Preset } from "../model/presets";

export function Presets({
  presets,
  activeId,
  onPick,
}: {
  presets: readonly Preset[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  const active = presets.find((preset) => preset.id === activeId);
  return (
    <div className="presets">
      <fieldset className="presets-row">
        <legend className="presets-legend">Ensembles</legend>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset"
            aria-pressed={preset.id === activeId}
            title={preset.caption}
            onClick={() => onPick(preset.id)}
          >
            {preset.name}
          </button>
        ))}
      </fieldset>
      <p className="presets-caption" aria-live="polite">
        {active?.caption ?? "Your own arrangement."}
      </p>
    </div>
  );
}
