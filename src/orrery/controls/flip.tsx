import type { ViewName } from "../model/types";

type FlipProps = {
  view: ViewName;
  soundOn: boolean;
  onView: (view: ViewName) => void;
  onSound: () => void;
};

/** Above or below, and whether it makes a sound. */
export function Flip({ view, soundOn, onView, onSound }: FlipProps) {
  const note =
    view === "pool"
      ? "Below mirrors the arrangement and turns every interval upside down."
      : "Above is the sky as arranged. Below mirrors it, intervals inverted.";
  return (
    <div className="flip">
      <p className="flip-note">{note}</p>
      <div className="flip-controls">
        <fieldset className="segmented">
          <legend className="visually-hidden">view</legend>
          <button
            type="button"
            className="segment"
            aria-pressed={view === "telescope"}
            onClick={() => onView("telescope")}
          >
            As above
          </button>
          <button
            type="button"
            className="segment"
            aria-pressed={view === "pool"}
            onClick={() => onView("pool")}
          >
            So below
          </button>
        </fieldset>
        <button type="button" className="knob knob-sound" data-on={soundOn} onClick={onSound}>
          <span className="knob-glyph" aria-hidden="true">
            {soundOn ? "◉" : "○"}
          </span>
          <span className="knob-label">{soundOn ? "Mute sound" : "Enable sound"}</span>
        </button>
      </div>
    </div>
  );
}
