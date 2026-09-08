import { Console } from "./controls/console";
import { Flip } from "./controls/flip";
import { Mixer } from "./controls/mixer";
import { Presets } from "./controls/presets";
import { Sounds } from "./controls/sounds";
import { OrreryLayout } from "./layout";
import { sharedMix, useMix } from "./mix";
import { PRESETS } from "./model/presets";
import { useOrrery } from "./use-orrery";
import { OrreryCanvas } from "./view/orrery-canvas";

/** The places the work lives. The first row is where it lives now; the second is the rest. */
const LINKS = [
  { label: "simiancraft", href: "https://simiancraft.com/" },
  { label: "SoundCloud", href: "https://soundcloud.com/harlinjesse" },
  { label: "GitHub", href: "https://github.com/the-simian" },
  { label: "Talks", href: "https://slides.com/jesseharlin" },
];
const MORE_LINKS = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/jesseharlin/" },
  { label: "Instagram", href: "https://www.instagram.com/the_simian/" },
  { label: "X", href: "https://x.com/5imian" },
  { label: "CodePen", href: "https://codepen.io/JesseHarlin" },
  { label: "ModDB", href: "https://www.moddb.com/members/the-simian" },
  { label: "x4records", href: "https://x4records.bandcamp.com/" },
  { label: "OKCjs", href: "http://okcjs.com/" },
  { label: "Techlahoma", href: "https://www.techlahoma.org/our-board-and-staff/" },
];

export function OrreryScreen() {
  const orrery = useOrrery();
  const mix = useMix(sharedMix);
  return (
    <OrreryLayout
      view={orrery.state.activeView ?? "telescope"}
      skyZone={
        orrery.runtime ? (
          <OrreryCanvas
            store={orrery.store}
            runtime={orrery.runtime}
            reducedMotion={orrery.reducedMotion}
            onPick={orrery.pick}
            mixStore={sharedMix}
          />
        ) : null
      }
      nameZone={
        <>
          <h1 className="name">
            Jesse Harlin, <span className="name-alias">the_simian</span>
          </h1>
          <p className="name-line">
            engineer, composer, and installation artist. Norman, Oklahoma.
          </p>
        </>
      }
      linksZone={
        <>
          <div className="links-row">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} className="link">
                {link.label}
              </a>
            ))}
          </div>
          <div className="links-row links-more">
            {MORE_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="link link-small">
                {link.label}
              </a>
            ))}
          </div>
        </>
      }
      primaryZone={
        <Flip
          view={orrery.state.activeView ?? "telescope"}
          soundOn={orrery.state.soundEnabled}
          onView={orrery.setView}
          onSound={orrery.toggleSound}
        />
      }
      presetsZone={
        <Presets
          presets={orrery.presets}
          activeId={orrery.activePresetId}
          onPick={(id) => {
            orrery.applyPreset(id);
            const preset = PRESETS.find((candidate) => candidate.id === id);
            if (preset) sharedMix.setMix(preset.mix);
          }}
        />
      }
      soundsZone={
        <Sounds
          bodies={orrery.state.bodies}
          presetId={orrery.activePresetId}
          onPatch={orrery.setPatch}
        />
      }
      mixerZone={<Mixer mix={mix} presetId={orrery.activePresetId} onLevel={sharedMix.setLevel} />}
      consoleZone={
        <Console
          selected={orrery.selected}
          moonTarget={orrery.moonTarget}
          canAddPlanet={orrery.canAddPlanet}
          canAddMoon={orrery.canAddMoon}
          bodyCount={orrery.state.bodies.length}
          onAddPlanet={orrery.addPlanet}
          onAddMoon={orrery.addMoon}
          onRemove={orrery.removeSelected}
          onSpeed={orrery.setSpeed}
          onPitch={orrery.setPitch}
          onDrift={orrery.setDriftMode}
          onRing={orrery.setRing}
          onSelect={orrery.pick}
          soundOn={orrery.state.soundEnabled}
          bodies={orrery.state.bodies}
        />
      }
    />
  );
}
