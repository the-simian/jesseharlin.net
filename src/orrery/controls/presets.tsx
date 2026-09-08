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
    </div>
  );
}
