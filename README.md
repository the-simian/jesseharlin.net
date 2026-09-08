# jesseharlin.net

Jesse Harlin's personal site, live at https://jesseharlin.net/. The page is an instrument.

Bodies orbit bodies on Kepler ellipses at quantized speed ratios. The only sound is
collision: when two discs touch, both ring. Pitch offsets accumulate down the parent
chain and snap to the ensemble's scale, so a carrier planet transposes every moon it
holds. The flip shows the same arrangement two ways. As above: the telescope looks down
on a painted sky. So below: the pool looks up from under dark water, every interval
inverted around the anchor. One simulation, two views.

## The rules that make it music

- **Contact is the only sound.** Two bodies meet; both sound a note. Intensity comes from
  closing speed, weight from disc size, and shade from whether another body stands between
  the sun and the impact. Shade closes the filter, so a strike in shadow sounds covered.
- **Contact is the only memory.** When two moons meet they trade pitch offsets. The notes
  on a ring are conserved; who carries which permutes, so the same orbits stop producing
  the same score.
- **The comet is a step sequencer.** A body that strikes its parent sets the parent's root
  to the next step of its own road. A comet on a long oval grazes the sun once a turn and
  walks the ensemble through a chord progression; several comets can strike, and the last
  one wins.
- **Ovals cross.** Sibling rings share a semi-major axis and eccentricity but not an
  orientation, so their paths intersect at uneven speeds. Retrograde bodies meet head-on.
- **A body wears its note.** Register sets the color temperature and the halo; a struck
  body quivers for exactly as long as its note rings; trails are as long as the mix's ring.
- **A body plays its weight.** Heavy slow bodies are gongs, middle bodies are pedaled
  strings, small quick bodies are bright plinks, and the sun hums a drone an octave under
  its note.

## Stack

Vite, React 19, TypeScript, Biome, and Babylon.js, built and tested with Bun. Deployed to
GitHub Pages from the `gh-pages` branch by the workflow in `.github/workflows/deploy.yml`.

```sh
bun install
bun run dev      # http://localhost:5173
bun run check    # biome + tsc
bun test         # simulation, presets, and voice engine
bun run build    # dist/
```

## Reading the music without ears

```sh
bun scripts/score.ts lily-pads 120            # telescope view, two minutes
bun scripts/score.ts lily-pads 120 pool       # mirrored
```

The script runs the simulation offline, writes `scores/<id>-<view>.mid` (opens in
Ableton), and prints a piano roll plus contacts per minute, gap histogram, dyad
intervals, pitch classes per quarter, and the busiest bodies. Presets were composed
against that roll.

## Layout

- `src/orrery/model/`: state, validation, pure commands, pitch resolution, the decay
  curve, the presets, and the fixed-step simulation with swept disc contacts. Pure
  TypeScript; `bun test`.
- `src/orrery/audio/`: the voice engine. Web Audio voices scheduled against the audio
  clock with a short lookahead, a synthetic convolution reverb, and the drone.
- `src/orrery/view/`: the Babylon scene and its React wrapper. `orrery-scene.ts` composes
  `sky.ts` (painted plates and stars), `bodies.ts` (shells, halos, guides, trails, the
  quiver), `effects.ts` (flashes and bursts), and `camera.ts` (the drifting rail), and owns
  the lights, the glow, and the rays from the sun.
- `src/orrery/controls/`: presets, the console, the flip, and the mixer, in plain words.
- `src/orrery/mix.ts`: levels and ring time, remembered per visitor, read by audio and view.
- `src/orrery/runtime.ts`: connects store, simulation, voice engine, and view. The picture
  runs a tenth of a second behind the audio so flashes land on notes.
- `scripts/score.ts`: the offline renderer described above.
- `src/tower/`: the bio, shelved as floors of a tower; reachable at `#tower`.

## Composing a preset

Add a builder in `src/orrery/model/presets.ts` and an entry in `PRESETS`. Carriers on
their own rings never meet; their moons do. Put big slow discs on far rings for pedals and
small fast ones near for ornaments; give a comet `strikesParent` and `strikeSteps` for a
progression. Keep every offset in `LIMITS.allowedOffsets` and on the preset's scale, then
render it with `scripts/score.ts` and read the roll before believing it.

## Updating what the site says about Jesse

The link list is in `src/orrery/index.tsx`, the bio line beside the name in the same
file, and the structured data in `index.html`. The tower's content lives in
`src/tower/floors/floors.ts`; adding a fact is adding a book.
