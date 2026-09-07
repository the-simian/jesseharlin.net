import type { Book } from "./floors";

const KIND_LABEL: Record<Book["kind"], string> = {
  code: "code",
  music: "music",
  art: "art",
  community: "community",
  talk: "talk",
  life: "life",
};

/** A book on a shelf. Closed it shows a spine; open it shows a spread. Works without JavaScript. */
export function BookItem({ book }: { book: Book }) {
  return (
    <details className={`book book-${book.kind}`}>
      <summary className="book-spine">
        <span className="book-title">{book.title}</span>
        <span className="book-year">{book.year}</span>
      </summary>
      <div className="book-spread">
        <p className="book-kind">{KIND_LABEL[book.kind]}</p>
        <p className="book-text">{book.text}</p>
        <a className="book-link" href={book.link.href} rel="noopener">
          {book.link.label} &rarr;
        </a>
      </div>
    </details>
  );
}
