import type { ReactNode } from "react";
import { BookItem } from "./book";
import type { Floor } from "./floors";

type FloorSectionProps = {
  floor: Floor;
  /** What sits in the room besides the shelf: the door's window, the telescope, the pool. */
  roomZone?: ReactNode;
};

export function FloorSection({ floor, roomZone }: FloorSectionProps) {
  const shelf = floor.books.length > 0 ? <Shelf floor={floor} /> : null;
  return (
    <section id={floor.id} className={`floor floor-level-${floor.level}`} data-level={floor.level}>
      <header className="floor-header">
        <p className="floor-level">{levelLabel(floor.level)}</p>
        <h2 className="floor-name">{floor.name}</h2>
        <p className="floor-caption">{floor.caption}</p>
      </header>
      {roomZone}
      {shelf}
    </section>
  );
}

function Shelf({ floor }: { floor: Floor }) {
  return (
    <ul className="shelf">
      {floor.books.map((book) => (
        <li key={book.title}>
          <BookItem book={book} />
        </li>
      ))}
    </ul>
  );
}

function levelLabel(level: number): string {
  if (level === 0) return "ground floor";
  if (level > 0) return `${level} up`;
  return `${-level} down`;
}
