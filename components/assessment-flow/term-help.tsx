"use client";

// template-ancestor: components/assessment-flow/alignment-view.tsx   (variation: the How to Read disclosure reduced to one term — opened by a button and a popover instead of a native details element, so it can sit inside a legend and a table heading)

/**
 * `TermHelp` — the small help affordance beside a key term (#1270, `spec(APP-11)`).
 *
 * **Clicked, not hovered.** The requirement is that a reader reaches a definition from the
 * keyboard and from a touch screen, and the repo already carries the receipt for the alternative:
 * `aspect-list.tsx` explains why its reorder is not pointer-only — a tooltip nobody can hover on a
 * phone is not a definition. So the trigger is a real `<button>`, the surface is
 * `components/ui/popover.tsx`, and Radix supplies the rest of the contract for free: **Enter and
 * Space** open it because it is a button, **Escape** closes it and returns focus to the trigger,
 * and a tap is a click.
 *
 * **The words are the record's.** `content/terms.ts` authors each gloss once, and both the button's
 * accessible name (`TERM_HELP_NAMES`) and the definition read from it — this file holds no prose,
 * so "the UI and the record agree" is a property of the import, not a sentence in two places.
 * `tests/term-definitions.test.ts` renders the six and asserts the text is the record's.
 *
 * **No copy in the markup (E23).** The route budgets on every surface that mounts this are zero,
 * and the extractor counts JSX text and non-technical attributes: every string here is an
 * expression over `content/`, a `className`, or an `aria-`/`data-` attribute. The `term` prop is
 * passed as an expression (`term={"gap"}`) for the same reason `answer-sheet.tsx` names its chip
 * states in constants — an id is a handle, not copy, and a bare `term="gap"` would be counted as a
 * leaf literal against a budget that may only go down. Keep it that way: a heading typed into the
 * popover is a red build.
 */
import { HelpCircle } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TERM_DEFINITIONS, TERM_HELP_NAMES, TERM_LABELS, type TermId } from "@/content/terms";
import { cn } from "@/lib/utils";

export interface TermHelpProps {
  /** Which term this glosses — a key of the one record in `content/terms.ts`. */
  readonly term: TermId;
  /** The trigger's tone, for a legend that sits on a dark band. */
  readonly className?: string;
}

export function TermHelp({ term, className }: TermHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The icon is `aria-hidden`, so this is the whole of the control's name.
          aria-label={TERM_HELP_NAMES[term]}
          data-term-help={term}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            className,
          )}
        >
          <HelpCircle className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={TERM_HELP_NAMES[term]}
        // 16rem, not the primitive's 18: a gloss is two sentences and reads badly at a wide line.
        className="w-64 space-y-1 text-sm"
      >
        <p className="font-semibold text-foreground">{TERM_LABELS[term]}</p>
        <p className="text-muted-foreground">{TERM_DEFINITIONS[term]}</p>
      </PopoverContent>
    </Popover>
  );
}
