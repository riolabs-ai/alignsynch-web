/**
 * Is this local branch ready to run, and if not, what is missing? (#1401)
 *
 * `pnpm dev:ready` must be cheap on the common path — a branch seeded an hour ago starts the dev
 * server in under a second — and thorough on the sad path, where the demo branch has been
 * re-created and every account the local login needs is gone. The difference is this decision, and
 * it lives here rather than in the script so `tests/dev-ready.test.ts` drives every branch without
 * a database or a `process.env`.
 *
 * **Why a census at all instead of always seeding.** `pnpm db:seed` takes the fleet-wide `algn/1`
 * advisory lock on the shared demo branch. A `predev` seed therefore parks a *second* worktree's
 * `pnpm dev` behind `SEED_LOCK_WAIT_SECONDS` (300 s) for no reason, while the first worktree is
 * perfectly seeded. Reading three counts costs one round trip and takes no lock.
 *
 * **Why not `pnpm db:seed:check`.** `--check` (#865) is lock-free too, but it answers a different
 * question: `inspectDrift` lists *relationships* that are not in the committed bundle, and a bare
 * branch — zero relationships, which is exactly the branch that needs a seed — reports `converged`
 * and exits 0. It counts no `demo_account` row and no `ADMIN_NN` seat, so it cannot decide this.
 * `scripts/dev-ready.mjs` keeps the census it needs; see its `census()` for the two reads.
 *
 * **Two different admin variables, and only one of them creates anything.** `ADMIN_EMAILS` is an
 * allowlist: it grants `admin` to an address *at sign-in* and can only promote an account that
 * already exists. `ADMIN_NN_EMAIL` + `ADMIN_NN_PASS` is a **seat** — the pair `db:seed` signs up
 * when it is absent and reconciles when it is present. A seat with half a pair is skipped by the
 * seed with a warning, so this decision reports it as a note instead of promising a seat that
 * cannot be created.
 *
 * Pure: no `pg`, no `node:fs`, no `process.env`. The reads are `scripts/dev-ready.mjs`.
 */

/** How many PIN demo accounts `/demo` needs: the three `DEMO_ROLES` buttons. */
export const DEMO_ACCOUNT_TARGET = 3;

/**
 * The one line a branch with no database prints before starting.
 *
 * QuizHub runs on fixtures with no `.env.local` by design, so this is not an error and must not
 * become one: it is also the right answer for a reviewer who has never run `neon env pull`.
 */
export const NO_DATABASE_LINE =
  "dev:ready — no DATABASE_URL (fixtures-only branch), starting the server as-is";

/** One `ADMIN_NN_*` pair, as the seed sees it. */
export interface AdminSeat {
  /** `"01"`, `"02"`, … — the suffix the seed reports (`ADMIN_01_EMAIL`). */
  readonly suffix: string;
  /** The address, or `""` when only the pass half is set. */
  readonly email: string;
  /** Whether the pass half is set. A seat is a pair; half of one is not a seat. */
  readonly hasPassword: boolean;
}

/** What the census found. An email is present when `neon_auth` holds a row for it. */
export interface ReadyCensus {
  /** Rows in `record` — the content the seeded screens render. Zero means the branch is bare. */
  readonly contentRows: number;
  /** Rows in `demo_account`: the three PIN-gated role accounts. */
  readonly demoAccounts: number;
  /** The complete `ADMIN_NN` pairs the environment names — the only seats a seed can create. */
  readonly seats: readonly AdminSeat[];
  /** Which addresses `neon_auth` already holds a user for. */
  readonly presentEmails: readonly string[];
}

/** What to do about it. `reasons` is the sentence the script prints; `notes` never blocks. */
export interface ReadyDecision {
  /** Run `db:seed` before starting. */
  readonly needed: boolean;
  /** Each reason names the missing thing, in the order a person would fix it. */
  readonly reasons: readonly string[];
  /** Informational: printed, never a reason. */
  readonly notes: readonly string[];
}

/**
 * Whether there is anything to census at all.
 *
 * A branch with no `DATABASE_URL` has no census to take and no seed to run: it prints its one
 * line and starts. Kept here, and not inline in the script, because that branch is one of the
 * four the test table covers and a spawn of `next dev` is not a unit test.
 */
export type ReadyPlan =
  | { readonly kind: "start"; readonly lines: readonly string[] }
  | { readonly kind: "census" };

/** `start` with the one line, or `census` when a database is configured. */
export function bootstrapPlan({ hasDatabaseUrl }: { readonly hasDatabaseUrl: boolean }): ReadyPlan {
  return hasDatabaseUrl ? { kind: "census" } : { kind: "start", lines: [NO_DATABASE_LINE] };
}

/**
 * The arguments after `pnpm dev:ready --`, with the separator dropped.
 *
 * `pnpm run` forwards the literal `--` into `process.argv`, and `next dev -- --port 3000` reads
 * everything after a `--` as a project directory (measured: `Invalid project directory provided, no
 * such directory: …/--port`). One leading separator is process plumbing, not an argument.
 */
export function forwardedArgs(argv: readonly string[]): readonly string[] {
  const args = [...argv];
  if (args[0] === "--") args.shift();
  return args;
}

/** A seat is a pair: both halves, or the seed skips it. */
export function completeSeats(seats: readonly AdminSeat[]): readonly AdminSeat[] {
  return seats.filter((seat) => seat.email !== "" && seat.hasPassword);
}

/** The complete seats `neon_auth` does not hold yet — the ones a seed would create. */
export function missingSeats(census: ReadyCensus): readonly AdminSeat[] {
  const present = new Set(census.presentEmails.map((email) => email.toLowerCase()));
  return completeSeats(census.seats).filter((seat) => !present.has(seat.email.toLowerCase()));
}

/**
 * Seed or start as-is.
 *
 * Content is checked first because a bare branch is the case a seed exists for: the accounts are
 * a consequence of the data being there, and a seed run against no content would create three
 * accounts that land on nothing.
 */
export function readyDecision(census: ReadyCensus): ReadyDecision {
  const reasons: string[] = [];
  const notes: string[] = [];

  if (census.contentRows === 0) {
    reasons.push("no content rows — the branch has no seeded dataset");
  }
  if (census.demoAccounts < DEMO_ACCOUNT_TARGET) {
    reasons.push(
      `${census.demoAccounts} of ${DEMO_ACCOUNT_TARGET} PIN demo accounts present — /demo has nothing to sign in as`,
    );
  }

  // A half pair is reported the way the seed reports it: skipped, named, not a failure. Nothing a
  // local loop does resolves a missing half, so it must not become a reason.
  for (const seat of census.seats) {
    if (seat.email !== "" && !seat.hasPassword) {
      notes.push(
        `ADMIN_${seat.suffix}_PASS is unset — the seed skips that seat, because a seat is a pair`,
      );
    }
    if (seat.email === "" && seat.hasPassword) {
      notes.push(
        `ADMIN_${seat.suffix}_EMAIL is unset — the seed skips that seat, because a seat is a pair`,
      );
    }
  }

  const missing = missingSeats(census);
  if (missing.length > 0) {
    reasons.push(
      `${missing.length} of ${completeSeats(census.seats).length} admin seat(s) missing — db:seed will create them`,
    );
  }

  if (completeSeats(census.seats).length === 0 && census.seats.length === 0) {
    notes.push(
      "no ADMIN_NN_EMAIL/ADMIN_NN_PASS pair is set — no admin seat will be seeded (ADMIN_EMAILS alone grants admin only at sign-in)",
    );
  }

  return { needed: reasons.length > 0, reasons, notes };
}

/**
 * The census, as one line: what the branch has, so the person can see the numbers the decision
 * was made from rather than only its verdict.
 */
export function censusLine(census: ReadyCensus): string {
  return (
    `dev:ready — ${census.contentRows} content row(s), ` +
    `${census.demoAccounts} demo account(s), ` +
    `${census.seats.length} admin seat(s) configured`
  );
}
