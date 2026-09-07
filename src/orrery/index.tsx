import { Console } from "./controls/console";
import { Flip } from "./controls/flip";
import { OrreryLayout } from "./layout";
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
          />
        ) : null
      }
      nameZone={
        <>
          <h1 className="name">Jesse Harlin</h1>
          <p className="name-line">
            engineer, composer as <em>the_simian</em>, installation artist. Norman, Oklahoma.
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
          bodies={orrery.state.bodies}
        />
      }
    />
  );
}
