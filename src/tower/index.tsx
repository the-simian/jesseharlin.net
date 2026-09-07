import { FloorSection } from "./floors/floor";
import { TowerLayout } from "./layout";
import { useTower } from "./use-tower";

export function TowerScreen() {
  const { floors, currentFloor } = useTower();
  return <Tower floors={floors} currentFloorId={currentFloor.id} />;
}

type TowerProps = { floors: ReturnType<typeof useTower>["floors"]; currentFloorId: string };

function Tower({ floors, currentFloorId }: TowerProps) {
  const index = floors.findIndex((floor) => floor.id === currentFloorId);
  const above = floors[index - 1];
  const below = floors[index + 1];
  return (
    <TowerLayout
      sceneZone={null}
      floorsZone={floors.map((floor) => <FloorSection key={floor.id} floor={floor} />)}
      stairsZone={
        <>
          <StairLink target={above} direction="up" />
          <StairLink target={below} direction="down" />
        </>
      }
    />
  );
}

type StairLinkProps = {
  target: TowerProps["floors"][number] | undefined;
  direction: "up" | "down";
};

function StairLink({ target, direction }: StairLinkProps) {
  if (!target) return <span className={`stair stair-${direction} stair-end`} />;
  const arrow = direction === "up" ? "↑" : "↓";
  return (
    <a className={`stair stair-${direction}`} href={`#${target.id}`}>
      <span className="stair-arrow">{arrow}</span>
      <span className="stair-label">
        {direction} to {target.name}
      </span>
    </a>
  );
}
