import { useEffect, useState } from "react";
import { FLOORS, type Floor } from "./floors/floors";

/**
 * Orchestration for the tower. The page is one tall document: observatory at
 * the top, pool at the bottom, the door in the middle. The visitor arrives at
 * the door, and the floor nearest the middle of the viewport is "current".
 */
export function useTower() {
  const [currentFloorId, setCurrentFloorId] = useState<string>("door");

  useEffect(() => {
    const door = document.getElementById("door");
    if (door && window.location.hash === "") {
      door.scrollIntoView({ block: "center", behavior: "instant" });
    }

    const sections = FLOORS.map((floor) => document.getElementById(floor.id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setCurrentFloorId(visible.target.id);
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const currentFloor = FLOORS.find((floor) => floor.id === currentFloorId) ?? FLOORS[0];
  return { floors: FLOORS, currentFloor: currentFloor as Floor };
}
