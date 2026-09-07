import type { ViewName } from "../model/types";

type FlipProps = {
  view: ViewName;
  soundOn: boolean;
  onView: (view: ViewName) => void;
  onSound: () => void;
};

/** Above or below, and whether it makes a sound. */
export function Flip({ view, soundOn, onView, onSound }: FlipProps) {
  return (
    <div className="flip">
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
      <button type="button" className="knob knob-sound" aria-pressed={soundOn} onClick={onSound}>
        <span className="knob-glyph">{soundOn ? "◉" : "○"}</span>
        <span className="knob-label">{soundOn ? "Sound on" : "Sound off"}</span>
      </button>
    </div>
  );
}
