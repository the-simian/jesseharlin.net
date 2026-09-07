# jesseharlin.net

Jesse Harlin's personal site. The page is an instrument.

Bodies orbit bodies at quantized speed ratios. The only sound is collision: when two
discs touch, both ring, and every note exists because a visitor put something in the
sky. Pitch offsets accumulate down the parent chain, so lowering the sun a fifth lowers
everything. The flip control shows the same arrangement two ways. As above: the
telescope looks down on an indigo sky with engraved orbit lines. So below: the pool
looks up from underneath, on paper, in ink, with every interval inverted around the
anchor. One simulation, two views.

Nothing here is a composition. The instrument starts as a lone sun, and one body cannot
collide with itself.

## Stack

Vite, React 19, TypeScript, Biome, and Babylon.js, built and tested with Bun. Deployed to
GitHub Pages from the `gh-pages` branch by the workflow in `.github/workflows/deploy.yml`.

```sh
bun install
bun run dev      # http://localhost:5173
bun run check    # biome + tsc
bun test         # simulation and voice engine
bun run build    # dist/
```

## Layout

- `src/orrery/model/`: the instrument's state, validation, pure commands, pitch, and the
  fixed-step simulation with swept disc contacts. Pure TypeScript; tested with `bun test`.
- `src/orrery/audio/`: the voice engine. Web Audio bell dyads scheduled against the
  audio clock with a short lookahead; the pool view mirrors pitch and damps highs.
- `src/orrery/view/`: the Babylon scene and its React wrapper. Two palettes, one scene.
- `src/orrery/controls/`: the console and the flip, in plain language.
- `src/orrery/runtime.ts`: connects store, simulation, voice engine, and view. The picture
  runs a tenth of a second behind the audio so flashes land on notes.
- `src/tower/`: a reading surface about Jesse, floors and books, reachable at `#tower`.
  Content lives in `src/tower/floors/floors.ts`; adding a fact is adding a book.

## Updating what the site says about Jesse

Edit `src/tower/floors/floors.ts`. A floor has a name, a caption, and books; a book has a
title, a year, a kind, a paragraph, and one link. The instrument page's link list is in
`src/orrery/index.tsx`.
