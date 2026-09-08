import { innermostRing } from "../model/commands";
import type { Body, Drift, Ratio } from "../model/types";
import { LIMITS } from "../model/types";

/** Three rings per parent: near, middle, far. Bodies on one ring meet; bodies on different rings do not. */
export function ringsFor(parent: Body, child: Body): number[] {
  const inner = innermostRing(parent, child.discRadius) + 0.6;
  return [inner, inner + 1.1, inner + 2.2].map((value) => Math.round(value * 100) / 100);
}
const RING_LABEL = ["near", "middle", "far"];

const RATIO_LABEL = (ratio: Ratio) =>
  ratio.denominator === 1 ? `${ratio.numerator}×` : `${ratio.numerator}/${ratio.denominator}×`;

const OFFSET_LABEL: Record<number, string> = {
  [-12]: "octave down",
  [-10]: "seventh down",
  [-7]: "fifth down",
  [-5]: "fourth down",
  [-4]: "major third down",
  [-3]: "minor third down",
  [-2]: "whole step down",
  [-1]: "half step down",
  0: "same pitch",
  1: "half step up",
  2: "whole step up",
  3: "minor third up",
  4: "major third up",
  5: "fourth up",
  7: "fifth up",
  10: "seventh up",
  12: "octave up",
};

type ConsoleProps = {
  selected: Body | null;
  /** The planet a new moon would orbit, or null when no planet is selected. */
  moonTarget: Body | null;
  canAddPlanet: boolean;
  canAddMoon: boolean;
  bodyCount: number;
  onAddPlanet: () => void;
  onAddMoon: () => void;
  onRemove: () => void;
  onSpeed: (ratio: Ratio) => void;
  onPitch: (offset: number) => void;
  onDrift: (drift: Drift) => void;
  onRing: (orbitRadius: number) => void;
  onSelect: (id: string | null) => void;
  soundOn: boolean;
  /** All bodies, so the editor can find a body's parent. */
  bodies: Body[];
};

function bodyName(body: Body, bodies: Body[]): string {
  if (body.parentId === null) return "the sun";
  const parent = bodies.find((candidate) => candidate.id === body.parentId);
  const siblings = bodies.filter((candidate) => candidate.parentId === body.parentId);
  const index = siblings.findIndex((candidate) => candidate.id === body.id) + 1;
  return parent?.parentId === null
    ? `planet ${index}`
    : `moon ${index} of ${bodyName(parent as Body, bodies)}`;
}

/** The instrument's controls. Big targets; nothing hidden behind a gesture. */
export function Console(props: ConsoleProps) {
  const { selected, moonTarget } = props;
  const moonNote = moonTarget
    ? `around ${bodyName(moonTarget, props.bodies)}`
    : "select a planet first";
  const editor = selected ? <BodyEditor {...props} body={selected} /> : null;
  const guidance = <Guidance bodies={props.bodies} soundOn={props.soundOn} />;
  return (
    <div className="console">
      <div className="console-row console-actions">
        <button
          type="button"
          className="knob knob-primary"
          onClick={props.onAddPlanet}
          disabled={!props.canAddPlanet}
        >
          <span className="knob-glyph">+</span>
          <span className="knob-label">
            Add a planet <small>around the sun</small>
          </span>
        </button>
        <button
          type="button"
          className="knob"
          onClick={props.onAddMoon}
          disabled={!props.canAddMoon}
        >
          <span className="knob-glyph">+</span>
          <span className="knob-label">
            Add a moon <small>{moonNote}</small>
          </span>
        </button>
        <button
          type="button"
          className="knob"
          onClick={props.onRemove}
          disabled={!selected || selected.parentId === null}
        >
          <span className="knob-glyph">−</span>
          <span className="knob-label">Remove</span>
        </button>
        <label className="field field-inline">
          <span className="field-label">
            Body{" "}
            <small>
              {props.bodyCount} of {LIMITS.maxBodies}
            </small>
          </span>
          <span className="field-select">
            <select
              className="field-input"
              value={selected?.id ?? ""}
              onChange={(event) => props.onSelect(event.target.value || null)}
            >
              <option value="">none selected</option>
              {props.bodies.map((body) => (
                <option key={body.id} value={body.id}>
                  {bodyName(body, props.bodies)}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      {guidance}
      {editor}
    </div>
  );
}

/** Says the next thing that makes a sound, and goes quiet once two bodies can meet. */
function Guidance({ bodies, soundOn }: { bodies: Body[]; soundOn: boolean }) {
  const rings = new Map<string, number>();
  for (const body of bodies) {
    if (body.parentId === null) continue;
    const key = `${body.parentId}:${body.orbitRadius}`;
    rings.set(key, (rings.get(key) ?? 0) + 1);
  }
  const canCollide = [...rings.values()].some((count) => count >= 2);
  const text = !canCollide
    ? "Nothing sounds until two bodies on the same ring touch. Add two planets."
    : !soundOn
      ? "Two bodies share a ring. Enable sound to hear them meet."
      : "Tap or click a body to change its ring, speed, or pitch. Lower the sun and everything follows.";
  return <p className="console-hint">{text}</p>;
}

function BodyEditor({
  body,
  bodies,
  onSpeed,
  onPitch,
  onDrift,
  onRing,
}: ConsoleProps & { body: Body }) {
  const isSun = body.parentId === null;
  const parent = bodies.find((candidate) => candidate.id === body.parentId);
  const rings = parent ? ringsFor(parent, body) : [];
  const ringValue = rings.reduce(
    (best, ring) =>
      Math.abs(ring - body.orbitRadius) < Math.abs(best - body.orbitRadius) ? ring : best,
    rings[0] ?? body.orbitRadius,
  );
  const ring = isSun ? null : (
    <label className="field">
      <span className="field-label">Ring</span>
      <span className="field-select">
        <select
          className="field-input"
          value={ringValue}
          onChange={(event) => onRing(Number(event.target.value))}
        >
          {rings.map((value, index) => (
            <option key={value} value={value}>
              {RING_LABEL[index]}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
  const ratioValue = `${body.speedRatio.numerator}/${body.speedRatio.denominator}`;
  const driftValue = body.drift.mode;
  const speed = isSun ? null : (
    <label className="field">
      <span className="field-label">Speed</span>
      <span className="field-select">
        <select
          className="field-input"
          value={ratioValue}
          onChange={(event) => {
            const [n, d] = event.target.value.split("/").map(Number);
            if (n !== undefined && d !== undefined) onSpeed({ numerator: n, denominator: d });
          }}
        >
          {LIMITS.allowedRatios.map((ratio) => (
            <option key={RATIO_LABEL(ratio)} value={`${ratio.numerator}/${ratio.denominator}`}>
              {RATIO_LABEL(ratio)}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
  const drift = isSun ? null : (
    <label className="field">
      <span className="field-label">Drift</span>
      <span className="field-select">
        <select
          className="field-input"
          value={driftValue}
          onChange={(event) => onDrift(driftFor(event.target.value))}
        >
          <option value="still">still</option>
          <option value="stair">in steps</option>
          <option value="sine">in waves</option>
        </select>
      </span>
    </label>
  );
  return (
    <div className="console-row console-editor">
      <span className="editor-title">{isSun ? "The sun" : "Selected body"}</span>
      {ring}
      {speed}
      <label className="field">
        <span className="field-label">
          {isSun ? "Pitch of everything" : "Pitch"}
          <small>{isSun ? " mirrored below" : " vs its parent, mirrored below"}</small>
        </span>
        <span className="field-select">
          <select
            className="field-input"
            value={body.pitchOffsetSemitones}
            onChange={(event) => onPitch(Number(event.target.value))}
          >
            {LIMITS.allowedOffsets.map((offset) => (
              <option key={offset} value={offset}>
                {OFFSET_LABEL[offset] ?? `${offset} semitones`}
              </option>
            ))}
          </select>
        </span>
      </label>
      {drift}
    </div>
  );
}

function driftFor(mode: string): Drift {
  if (mode === "stair")
    return { mode: "stair", target: "speed", amplitude: 0.35, periodSeconds: 24 };
  if (mode === "sine")
    return { mode: "sine", target: "orbitRadius", amplitude: 0.15, periodSeconds: 18 };
  return { mode: "still" };
}
