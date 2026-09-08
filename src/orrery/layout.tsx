import type { ReactNode } from "react";

type OrreryLayoutProps = {
  /** Palette hook for the chrome: "telescope" or "pool". */
  view: "telescope" | "pool";
  /** The Babylon canvas. Fills the viewport. */
  skyZone: ReactNode;
  /** Name and one line, top left. */
  nameZone: ReactNode;
  /** Outbound links, top right. */
  linksZone: ReactNode;
  /** Sound and the view, under the name: the first two things to touch. */
  primaryZone: ReactNode;
  /** The ensembles to start from, above the console. */
  presetsZone: ReactNode;
  /** Which world each body sounds, above the flip. */
  soundsZone: ReactNode;
  /** Levels and ring time, beside the flip. */
  mixerZone: ReactNode;
  /** The instrument's controls, bottom. */
  consoleZone: ReactNode;
};

export function OrreryLayout({
  view,
  skyZone,
  nameZone,
  linksZone,
  primaryZone,
  presetsZone,
  soundsZone,
  mixerZone,
  consoleZone,
}: OrreryLayoutProps) {
  return (
    <div className="orrery" data-view={view}>
      <div className="orrery-sky">{skyZone}</div>
      <header className="orrery-name">{nameZone}</header>
      <nav className="orrery-links" aria-label="links">
        {linksZone}
      </nav>
      <div className="orrery-veil" aria-hidden="true" />
      <div className="orrery-primary">{primaryZone}</div>
      <section className="orrery-console" aria-label="instrument controls">
        <div className="orrery-presets">{presetsZone}</div>
        {consoleZone}
      </section>
      <aside className="orrery-panels" aria-label="sounds and mix">
        <div className="orrery-sounds">{soundsZone}</div>
        <div className="orrery-mixer">{mixerZone}</div>
      </aside>
    </div>
  );
}
