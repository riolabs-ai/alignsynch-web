// template-ancestor: components/legal/legal-page.tsx   (variation: the glossary — a term index, then one definition per term with the schema comment it came from)

import type { PageCopy } from "@/content/pages";
import type { GlossaryDocument } from "@/lib/glossary";
import { fillLabel, pageItemOf, sectionBody, sectionOf } from "@/lib/page-copy";
import Markdown, { type Components } from "react-markdown";

/**
 * `/glossary`, the one view the route renders (#1289, register row WEB-07).
 *
 * **The terms arrive, they are not written here.** `document` is `docs/glossary.md` parsed by
 * `lib/glossary.ts`: the page module reads the committed file at request time and passes the
 * shaped result down, so this component holds no definition, no term name and no source path. A
 * definition edited in the site's own markup would be a second register beside the one
 * `scripts/gen-glossary.mjs` regenerates, and E23 holds the file to a budget of 0 literals for the
 * same reason — every word it prints is `data/pages/glossary.ts` or the document.
 *
 * **`null` is a state, not an absence.** When the document is missing or no longer parses, the
 * page passes `null` and this view draws the fixture's `document-unavailable` sentence instead of
 * an empty list: a glossary page with nothing on it reads as "this product has no vocabulary",
 * which is a claim nobody made. Nothing is invented to fill the space.
 *
 * **The index and the count are the same fact.** The count is `document.terms.length`; the index
 * is the same array, in the document's order, each row anchored on the id its section carries. A
 * reader on a long page gets the list of terms first and the definitions under it, and the two
 * cannot disagree about how many there are.
 *
 * The markup vocabulary of a definition is the document's own: paragraphs of prose with inline
 * code spans (`` `gapOf` ``, `` `strict()` ``). `react-markdown` renders exactly that — the same
 * reader `/admin/docs` uses — and the element map below keeps the type at the page's scale.
 */
export function GlossaryPage({
  copy,
  document,
}: {
  copy: PageCopy;
  /** The parsed register, or `null` when it could not be read — see `document-unavailable`. */
  document: GlossaryDocument | null;
}) {
  const count = sectionOf(copy, "term-count");
  const unavailable = sectionOf(copy, "document-unavailable");
  const indexHeading = pageItemOf(copy, "term-index").label;

  return (
    <div className="marketing-container max-w-3xl py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {copy.heading}
        </h1>
        {copy.subtitle !== undefined && (
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{copy.subtitle}</p>
        )}
        {document !== null && (
          <p className="mt-4 text-sm font-medium text-foreground/80">
            {fillLabel(sectionBody(count), { count: document.terms.length })}
          </p>
        )}
      </header>

      {document === null ? (
        <section id={unavailable.id} role="status" className="rounded-lg border border-border p-5">
          <Body text={sectionBody(unavailable)} />
        </section>
      ) : (
        <>
          {/*
            The index. It is a `<nav>` because that is what it is — a list of addresses on this
            page — and its name is the fixture's heading, so a screen reader announces a
            destination list rather than a second run of the definitions.
          */}
          <nav
            aria-labelledby="glossary-index"
            className="mb-12 rounded-lg border border-border p-5"
          >
            <h2
              id="glossary-index"
              className="text-sm font-semibold tracking-wide text-foreground uppercase"
            >
              {indexHeading}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {document.terms.map((term) => (
                <li key={term.anchor}>
                  <a
                    href={`#${term.anchor}`}
                    className="text-sm text-action underline-offset-2 hover:underline"
                  >
                    {term.term}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-10">
            {document.terms.map((term) => (
              <section key={term.anchor} id={term.anchor} className="scroll-mt-24">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {term.term}
                </h2>
                <div className="mt-3 space-y-3">
                  {term.paragraphs.map((paragraph) => (
                    <Markdown key={paragraph} components={DEFINITION}>
                      {paragraph}
                    </Markdown>
                  ))}
                </div>
                {/*
                  The attribution, structured rather than printed: the document's own line is a
                  markdown link into the checkout (`../content/record.ts`), which a public reader
                  cannot open, so the file and the declaration are drawn as code and the word in
                  front of them is the fixture's `source` item.
                */}
                <p className="mt-3 text-sm text-muted-foreground">
                  {pageItemOf(copy, "source").label}:{" "}
                  {term.sources.map((source, at) => (
                    <span key={`${source.file}:${source.declaration ?? ""}`}>
                      {at > 0 ? ", " : null}
                      <code className="font-mono text-[0.9em] text-foreground">{source.file}</code>
                      {source.declaration !== null && (
                        <>
                          {" — "}
                          <code className="font-mono text-[0.9em] text-foreground">
                            {source.declaration}
                          </code>
                        </>
                      )}
                    </span>
                  ))}
                </p>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The element map a definition is rendered through.
 *
 * A link is the one element that cannot be honoured: a definition's prose names files in the
 * checkout, and an `<a>` to `../content/…` would 404 for every reader. It renders as its text, so
 * the sentence still reads and the page carries no dead address.
 */
const DEFINITION: Components = {
  p: ({ children }) => <p className="text-base leading-relaxed text-foreground/90">{children}</p>,
  a: ({ children }) => <span className="text-foreground">{children}</span>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">
      {children}
    </code>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

/**
 * A fixture paragraph: blocks split on a blank line, and a block whose every line starts with
 * `- ` becomes a list. The same two shapes `components/legal/legal-page.tsx` renders — the message
 * this view prints when the document cannot be read is prose or a list, nothing richer.
 */
function Body({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
      {text.split("\n\n").map((block) => {
        const lines = block.split("\n");
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={block} className="list-disc space-y-1 pl-5">
              {lines.map((line) => (
                <li key={line}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={block}>{block}</p>;
      })}
    </div>
  );
}

/** Re-exported for the copy table's benefit: the route's fixture, named once. */
