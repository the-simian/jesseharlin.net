import type { ReactNode } from "react";

type TowerLayoutProps = {
  /** The Babylon canvas, fixed behind everything. */
  sceneZone: ReactNode;
  /** The stacked floors, top to bottom. */
  floorsZone: ReactNode;
  /** Up and down, always visible. */
  stairsZone: ReactNode;
};

export function TowerLayout({ sceneZone, floorsZone, stairsZone }: TowerLayoutProps) {
  return (
    <div className="tower">
      <div className="tower-scene" aria-hidden="true">
        {sceneZone}
      </div>
      <main className="tower-floors">{floorsZone}</main>
      <nav className="tower-stairs" aria-label="stairs">
        {stairsZone}
      </nav>
    </div>
  );
}
