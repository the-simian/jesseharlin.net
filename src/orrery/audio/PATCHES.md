# DX7 patches behind the voices

The instrument's voices are modelled on DX7 patches from patches.fm. Each
patch has a JSON form at `https://patches.fm/patches/dx7/<first two hex>/<signature>.json`.

## In use

- **SpaceVox** (`dcc0e48c1eb32be22cc8bb02db22ed66cfcda5c0`): the moons' voice
  patch. Algorithm 26, feedback 5. A ratio-1 stack with feedback for the vowel,
  a late octave carrier at ratio 1.01, and a fixed 2.4 kHz breath.
- **OB GENVIV1** (`2181f2d44b09c796918471ff3d8f98d113854d17`): the sun's pad.
  Algorithm 6, three parallel pairs, every carrier on the fundamental detuned
  -6, +5 (fine 1), and -5, modulators at ratios 1, 2, and 2 with sustained
  indices, slow attack, pitch scoop from below.

## Queued

- **JX3P STRGS** (`f9b4312c8202441109c4e142b2e4ee708193a42e`): an alternative
  drone. Algorithm 2, feedback 7, sine LFO speed 34 with pitch depth 15
  (a light vibrato). Carriers: op 1 at ratio 2 detune -6, op 3 at ratio 1
  detune +6 (modulated by op 4 ratio 1 detune +7, with ops 5 and 6 above at
  ratios 1.01 and 4, feedback on 6). Op 2 at ratio 1 detune -6 modulates op 1.
  Slow attacks (rates 55 to 56), long sustains. Intended use: the drone patch
  becomes a per-ensemble choice, picked when the sun is selected.
- **PLUCKTHARP** (`e853124a7386d9f7dd339ddb0cbc39ae2229ffd9`): an alternative
  moon. Algorithm 12, feedback 7, sine LFO speed 40 with amplitude depth 63.
  Carrier op 1 at ratio 1 detune +7 with a fast pluck envelope; op 2 (ratio 2)
  and op 3 (ratio 3) modulate it and decay quickly; ops 4 and 5 at ratio 1 hold
  a slow-swelling body under it; op 6 at ratio 9 gives the pick.
- **GLASSHARP3** (`de3b6cdaaeb275e15abf5876b54be61f7b8a4c73`): an alternative
  moon. Algorithm 12, no feedback, sample-and-hold LFO at speed 89 with
  amplitude depth 99. Carrier op 1 at ratio 2 detune +3; op 3 at ratio 8.01
  decays fast for the glass; ops 2, 4, 5, and 6 sit at ratios 7, 18, 21, and 23,
  high and quiet, for the shimmer.
- **1/2OffRhod** by Pete Franz (`705ee3d7b3b2a239713f6f8a7e3a9498c2cb8d63`):
  an alternative moon. Algorithm 32 (six carriers, additive), no feedback.
  Carriers at ratios 1.26, 0.5, 1, 2 (detune +3), 2.26, and 8 (detune -4); the
  upper three start near silent and rise, so the tone brightens as it rings.
  A pitch envelope dips a quarter tone under the note and returns: the
  "half off" of the name, a Rhodes struck slightly out of tune.

Intended use for the moon alternatives: a moon's colour names its patch, so a
colour of moon becomes swappable and the map from colour to patch is the
instrument's palette.

- **FLUTIE** (`b23bece781d25a9fde1c94a3e76210a05281ec6f`): an alternative
  planet. Algorithm 16 (one carrier, op 1, fed by a branching stack), feedback
  5, triangle LFO speed 33 delayed, light amplitude and pitch depth for breath.
  Ops 3 and 6 modulate the carrier (ratio 1 detune +4 with a fast-settling
  index, and ratio 1.53 with a bright decaying edge); op 4 at ratio 1.53 sits
  under op 3 quietly; ops 2 and 5 are silent. Attack rate 66 gives a soft
  blown onset, and a pitch envelope dips a hair under the note at the start.
  Intended use: a planet patch alongside the harp pluck, chosen per ensemble.

- **PANFLUTE1** (`9ba7f1cdd43bbf80563763bfe071bb5de69b5440`): an alternative
  moon or planet. Algorithm 7, feedback 7, triangle LFO speed 46 delayed with
  pitch depth 21 (a vibrato that arrives late). Carriers op 1 and op 3 both at
  ratio 3 (detune -4 and +7, a chorused pair) and op 5 at ratio 0.5 under
  them; op 2 (ratio 3) modulates op 1, op 4 is a fixed breath near 5.5 Hz that
  decays as chiff, op 6 at ratio 4.62 with feedback modulates op 5. Transpose
  17. A pitch envelope scoops from a little under. The chiff and the late
  vibrato are the pan flute; it would suit either a slow moon or a planet.

- **GLASSFLUTE** (`fe2c46e9f81f988f9cf7351604e363da5a500854`): an alternative
  drone, moon, or planet. Algorithm 3 (two three-operator stacks), feedback 7,
  sine LFO speed 34 delayed with no depth set. Carriers op 1 and op 4 both at
  ratio 2 with slow attacks (rate 55) and long sustains; op 2 (ratio 1) and
  op 3 (ratio 8, sustain falling to 50) modulate op 1 for the glass; op 5 is a
  fixed high breath and op 6 at ratio 19 with feedback, velocity-sensitive and
  falling to 15, gives the flute's edge on the onset. Held, it is a drone;
  struck, a glassy flute.
- **PANFLUTE3** (`0027d3ce2652b5d848c84b10b0a309d420e3694a`): the same
  operators as PANFLUTE1, with the vibrato slower (LFO speed 27) and arriving
  much later (delay 99). A moon or planet; the stiller of the two pan flutes.
