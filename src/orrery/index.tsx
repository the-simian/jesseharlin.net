import { Console } from "./controls/console";
import { Flip } from "./controls/flip";
import { Mixer } from "./controls/mixer";
import { Presets } from "./controls/presets";
import { OrreryLayout } from "./layout";
import { sharedMix, useMix } from "./mix";
import { useOrrery } from "./use-orrery";
import { OrreryCanvas } from "./view/orrery-canvas";

const LINKS = [
  { label: "GitHub", href: "https://github.com/the-simian" },
  { label: "SoundCloud", href: "https://soundcloud.com/harlinjesse" },
  { label: "x4records", href: "https://x4records.bandcamp.com/" },
  { label: "simiancraft", href: "https://simiancraft.com/" },
  { label: "Talks", href: "https://slides.com/jesseharlin" },
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
          <h1 className="name">Jesse Harlin</h1>
          <p className="name-line">
            engineer, composer (as <em>the_simian</em>), and installation artist. Norman, Oklahoma.
          </p>
        </>
      }
      linksZone={LINKS.map((link) => (
        <a key={link.href} href={link.href} className="link">
          {link.label}
        </a>
      ))}
      flipZone={
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
          onPick={orrery.applyPreset}
        />
      }
      mixerZone={<Mixer mix={mix} onLevel={sharedMix.setLevel} />}
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
