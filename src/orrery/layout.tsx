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
  /** The instrument's controls, bottom. */
  consoleZone: ReactNode;
  /** Above or below, and sound. */
  flipZone: ReactNode;
};

export function OrreryLayout({
  view,
  skyZone,
  nameZone,
  linksZone,
  consoleZone,
  flipZone,
}: OrreryLayoutProps) {
  return (
    <div className="orrery" data-view={view}>
      <div className="orrery-sky">{skyZone}</div>
      <header className="orrery-name">{nameZone}</header>
      <nav className="orrery-links" aria-label="links">
        {linksZone}
      </nav>
      <div className="orrery-flip">{flipZone}</div>
      <section className="orrery-console" aria-label="instrument controls">
        {consoleZone}
      </section>
    </div>
  );
}
