/**
 * The flow's six key terms, glossed once (#1270, `spec(APP-11)`).
 *
 * A reader meets the product's own vocabulary — Mode, Setting, Aspect, Opinion, Gap, Round — on
 * the screen that asks them to act on it, and the glossary page (`docs/glossary.md`) is not where
 * they are: that page is generated from the schema comments and read by whoever goes looking. So
 * each term carries a **short** definition at the point of use, and this module is the one place
 * those sentences are authored.
 *
 * **Nothing here restates a source it already has.** A short line that the model already carries
 * is *composed from it* at module load, never retyped: the two Setting sentences are
 * `SETTING_DEFINITIONS`, the four Opinion clauses are `OPINION_LABELS` beside
 * `OPINION_DEFINITIONS`, and the band, the mode names and the labels are the model's own
 * constants. That is what makes "the same words" a fact a test can check rather than a promise two
 * files keep until one is edited — `tests/term-definitions.test.ts` asserts the composed
 * definitions contain the model's strings verbatim.
 *
 * Only the four terms with no authored short line — Aspect, Gap and Round are documented in a
 * schema comment and never rendered as prose before this — are new sentences, and they are one
 * line each: a gloss, not the glossary's paragraph. The long explanations stay where they are.
 *
 * A definition is a **reader-visible string in a content module**, not page copy: it is the model's
 * vocabulary, so it belongs beside the enum it explains and not in `data/pages/*.ts`, where it
 * would be one route's opinion of a word every route uses. `TERM_HELP_NAMES` is here for the same
 * reason — the affordance's accessible name is copy, and no component may hold it (E23).
 */
import { z } from "zod";
import {
  MODE_LABELS,
  OPINION_DEFINITIONS,
  OPINION_LABELS,
  SETTING_DEFINITIONS,
  SETTING_LABELS,
} from "./assessment";
import { SCORE_MAX, SCORE_MIN } from "./record";

/**
 * The six terms the create-and-complete flow shows on screen. The list is the issue's own
 * (`spec(APP-11)`), and it is closed on purpose: a term is added here when a surface renders it,
 * because a definition nothing draws is a paragraph waiting to drift from the screens that do.
 */
export const zTermId = z.enum(["mode", "setting", "aspect", "opinion", "gap", "round"]);

export type TermId = z.infer<typeof zTermId>;

export const TERM_IDS = zTermId.options;

/** The word as the screen prints it — the glossary's capitalisation, not a lower-cased key. */
export const TERM_LABELS: Record<TermId, string> = {
  mode: "Mode",
  setting: "Setting",
  aspect: "Aspect",
  opinion: "Opinion",
  gap: "Gap",
  round: "Round",
};

/** The 1..5 band, spelled from the score's own bounds so "1–5" cannot outlive them. */
const BAND = `${SCORE_MIN}–${SCORE_MAX}`;

const { feel, wish, think, guess } = OPINION_LABELS;

/**
 * One short gloss per term — what a reader needs to read the control in front of them, and no
 * more. Each is two sentences at most; the glossary page carries the argument.
 */
export const TERM_DEFINITIONS: Record<TermId, string> = {
  mode: `${MODE_LABELS.basic} asks ${feel} and ${wish} on every ${TERM_LABELS.aspect}; ${MODE_LABELS.advanced} asks all four. A relationship plays one Mode, fixed when it is created.`,
  setting: `How closely the parties must match — a lens over the ${TERM_LABELS.gap}s, never a question. ${SETTING_LABELS.soft}: ${SETTING_DEFINITIONS.soft} ${SETTING_LABELS.full}: ${SETTING_DEFINITIONS.full}`,
  aspect: `A characteristic of the relationship worth ${TERM_LABELS.opinion}s. Both parties answer it on the ${BAND} band, whose ends are the two Values.`,
  opinion: `One party's answer on one ${TERM_LABELS.aspect}, scored ${SCORE_MIN} to ${SCORE_MAX} — ${feel}: ${OPINION_DEFINITIONS.feel}; ${wish}: ${OPINION_DEFINITIONS.wish}; ${think}: ${OPINION_DEFINITIONS.think}; ${guess}: ${OPINION_DEFINITIONS.guess}.`,
  gap: `The difference between two ${TERM_LABELS.opinion}s on the same ${TERM_LABELS.aspect} — computed from the scores and never stored. A ${TERM_LABELS.gap} of 0 is In Synch.`,
  round: `One pass through the ${TERM_LABELS.aspect}s by both parties. ${TERM_LABELS.round} 1 is the first; a later ${TERM_LABELS.round} is a new session over the same ${TERM_LABELS.aspect}s.`,
};

/**
 * What the affordance is called aloud — the button's accessible name, and the sentence a screen
 * reader announces in place of the icon. Copy, so it lives here and not in a component.
 */
export const TERM_HELP_NAMES: Record<TermId, string> = {
  mode: `What is ${TERM_LABELS.mode}?`,
  setting: `What is the ${TERM_LABELS.setting}?`,
  aspect: `What is an ${TERM_LABELS.aspect}?`,
  opinion: `What is an ${TERM_LABELS.opinion}?`,
  gap: `What is a ${TERM_LABELS.gap}?`,
  round: `What is a ${TERM_LABELS.round}?`,
};

/** The popover's own heading: the term, then its definition under it. */
export function termDefinition(id: TermId): string {
  return TERM_DEFINITIONS[id];
}

/** The button's accessible name for one term. */
export function termHelpName(id: TermId): string {
  return TERM_HELP_NAMES[id];
}
