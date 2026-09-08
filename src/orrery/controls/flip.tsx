import type { ViewName } from "../model/types";

type FlipProps = {
  view: ViewName;
  soundOn: boolean;
  onView: (view: ViewName) => void;
  onSound: () => void;
};

/** The glyphs of the flip: a rayed sun above, its crescent below. */
function Sun() {
  const rays = Array.from({ length: 8 }, (_, index) => index * 45);
  return (
    <svg className="segment-glyph" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="13" />
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
        {rays.map((angle) => (
          <line key={angle} x1="32" y1="4" x2="32" y2="12" transform={`rotate(${angle} 32 32)`} />
        ))}
      </g>
    </svg>
  );
}

function Crescent() {
  return (
    <svg className="segment-glyph" viewBox="0 0 64 64" aria-hidden="true">
      <path d="m64 31.7c0 17.7-14.3 32-32 32s-32-14.3-32-32c0-15.7 11.3-28.8 26.3-31.4-9.3 4.1-15.8 13.5-15.8 24.3 0 14.8 12 26.7 26.7 26.7 13.6 0 24.9-10.2 26.5-23.4.2 1.3.3 2.6.3 3.8z" />
    </svg>
  );
}

/** Sound first, then above or below: the two things a visitor must find. */
export function Flip({ view, soundOn, onView, onSound }: FlipProps) {
  return (
    <div className="flip">
      <div className="flip-controls">
        <button type="button" className="knob knob-sound" data-on={soundOn} onClick={onSound}>
          <span className="knob-glyph" aria-hidden="true">
            {soundOn ? "◉" : "○"}
          </span>
          <span className="knob-label">{soundOn ? "Mute sound" : "Enable sound"}</span>
        </button>
        <fieldset className="segmented">
          <legend className="visually-hidden">view</legend>
          <button
            type="button"
            className="segment"
            aria-pressed={view === "telescope"}
            onClick={() => onView("telescope")}
          >
            <Sun />
            As above
          </button>
          <button
            type="button"
            className="segment"
            aria-pressed={view === "pool"}
            onClick={() => onView("pool")}
          >
            <Crescent />
            So below
          </button>
        </fieldset>
      </div>
    </div>
  );
}
