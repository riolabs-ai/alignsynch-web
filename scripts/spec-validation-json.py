#!/usr/bin/env python3
"""VALIDATION.csv -> data/spec/validation.json — the project spec's register (#1252).

**Run it from the repository root, and never edit the output by hand.** The page reads
`data/spec/validation.json` at request time, and the counts it prints (44 of 76 met, the four
section totals 28 / 20 / 13 / 27, the per-scope meters) are derived from this file — so a hand edit
is a number nobody can regenerate, which is exactly what `data:check` E42 refuses.

    # the register lives outside the repo: it carries one agreement quote per row
    python3 scripts/spec-validation-json.py \\
      ../../project-spec/spec-scope-v2/VALIDATION.csv \\
      data/spec/validation.json

    # `--check` writes nothing: it derives the document again in memory and compares it with the
    # committed one, byte for byte, naming the row and field of every difference. `data:check` E42
    # runs this whenever the CSV is reachable on the machine, so a hand-edited register fails the
    # gate instead of passing it (#1441).
    python3 scripts/spec-validation-json.py <csv> data/spec/validation.json --check

    # `--with-quotes` writes the private file. It is NOT repo-safe: quotes are NDA text, so the
    # private copy is stored outside this tree and `content/spec.ts` refuses it (quote is
    # `z.literal(null)`, quotesIncluded `z.literal(false)`).

**The columns are the CSV's own**, one row per requirement: `section, group, id, check, status,
pdf_pages, agreement_quote, requirement, definition_of_done, v2_today, v2_0_0, rc2, rc3, beta,
evidence, parity, parity_basis, review_pm, review_design, approval_jaden, approval_walt,
next_acceptance, notes`.

**The register's identity is one `register` block, and it is not the app's.** `release` is the
*agreement register's* release label and `main` is the commit the citations were checked at —
neither is `package.json`'s version, and neither may ever be rendered as one. They sit under
`register` (with `generatedAt` and the CSV's `csvSha256`) rather than at the top level, because
top level is where a component reaches without asking: the Project Spec badges printed
`2.0.0-rc1.2` beside a `2.1.0` build for a release precisely because `release` was a bare key.
There is no top-level `release` and no top-level `main` any more, and `zSpecValidation`
(`content/spec.ts`) is `.strict()`, so a file still carrying them is refused by `data:check` E42
instead of quietly loading.

**`csvSha256` is the CSV's digest**, so a regenerated file is distinguishable from an edited one,
and the page prints the snapshot it is reading
(`Register · <release> · generated <date> · @<main> · VALIDATION.csv@<sha8>`).

`main` is the commit the evidence citations were checked at — the row's `file:line` links are built
from it, so it must be a commit that exists on `origin/main`, never `HEAD` of a working tree. Pass
`--main` when the citations are re-checked; the default is the commit the current register was
taken at, so a bare re-run cannot silently move it backwards.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import hashlib
import json
import pathlib
import sys

DEFAULT_RELEASE = "2.0.0-rc1.2"
DEFAULT_MAIN = "0ebca6823"


def build_document(
    raw: bytes,
    *,
    with_quotes: bool,
    release: str,
    main: str,
    generated_at: str | None,
) -> dict:
    """The whole register, derived from the CSV's bytes and nothing else."""
    rows = []
    for record in csv.DictReader(raw.decode("utf-8").splitlines()):
        evidence = [item for item in record["evidence"].split("; ") if item and item != "—"]
        rows.append(
            {
                "id": record["id"],
                "section": record["section"],
                "group": record["group"],
                "check": record["check"],
                "status": record["status"],
                "pdfPages": None if record["pdf_pages"] == "—" else record["pdf_pages"],
                # The quote is NDA text: dropped unless asked for, and a file that carries one is
                # never committed (see the module docstring).
                "quote": (None if record["agreement_quote"] == "—" else record["agreement_quote"])
                if with_quotes
                else None,
                "requirement": record["requirement"],
                "definitionOfDone": record["definition_of_done"],
                "today": record["v2_today"],
                "release": {
                    "v200": record["v2_0_0"],
                    "rc2": record["rc2"],
                    "rc3": record["rc3"],
                    "beta": record["beta"],
                },
                # A `.md` citation is a docs page, everything else is a code path with an optional
                # `:line` — the shape the page turns into a link.
                "evidence": [
                    {"kind": "docs" if item.endswith(".md") else "code", "ref": item} for item in evidence
                ],
                "parity": record["parity"],
                "parityBasis": record["parity_basis"],
                "review": {"pm": record["review_pm"], "design": record["review_design"]},
                "approval": {"jaden": record["approval_jaden"], "walt": record["approval_walt"]},
                "next": None if record["next_acceptance"] == "—" else record["next_acceptance"],
                "note": None if record["notes"] == "—" else record["notes"],
            }
        )

    return {
        "version": 1,
        "register": {
            "release": release,
            "main": main,
            "generatedAt": generated_at or datetime.datetime.now(datetime.UTC).date().isoformat(),
            "csvSha256": hashlib.sha256(raw).hexdigest(),
        },
        "quotesIncluded": bool(with_quotes),
        "rows": rows,
    }


def dump(document: dict) -> str:
    """The one serialisation both the writer and `--check` use, so 'equal' means equal bytes."""
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def field_differences(before: object, after: object, path: str, out: list[str]) -> None:
    """Every leaf where the committed register disagrees with the derivation, by path."""
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(set(before) | set(after)):
            field_differences(before.get(key), after.get(key), f"{path}.{key}", out)
        return
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        for index, (left, right) in enumerate(zip(before, after, strict=True)):
            field_differences(left, right, f"{path}[{index}]", out)
        return
    if before != after:
        out.append(f"{path.lstrip('.')}: the file has {before!r}, VALIDATION.csv derives {after!r}")


def differences(current: dict, derived: dict, limit: int = 6) -> list[str]:
    """What to say about a register that its own source does not reproduce."""
    found: list[str] = []
    for key in ("version", "quotesIncluded"):
        if current.get(key) != derived.get(key):
            found.append(f"{key}: the file has {current.get(key)!r}, the source derives {derived.get(key)!r}")
    if (current.get("register") or {}).get("csvSha256") != derived["register"]["csvSha256"]:
        found.append(
            "register.csvSha256: the file records "
            f"{(current.get('register') or {}).get('csvSha256')!r}, the CSV hashes to "
            f"{derived['register']['csvSha256']!r} — the register was not regenerated after the CSV moved"
        )
    rows_value = current.get("rows")
    current_rows: list = rows_value if isinstance(rows_value, list) else []
    derived_rows: list = derived["rows"]
    for index, derived_row in enumerate(derived_rows):
        if index >= len(current_rows):
            found.append(f"rows[{index}] ({derived_row['id']}): the file has no such row")
            continue
        current_row = current_rows[index]
        row_id = current_row.get("id") if isinstance(current_row, dict) else None
        if row_id != derived_row["id"]:
            found.append(
                f"rows[{index}]: the file has {row_id!r} where the source derives {derived_row['id']!r}"
            )
            continue
        row_found: list[str] = []
        field_differences(current_row, derived_row, f"{derived_row['id']}", row_found)
        found.extend(row_found)
        if len(found) >= limit:
            break
    if len(current_rows) > len(derived_rows):
        found.append(f"rows: the file carries {len(current_rows) - len(derived_rows)} row(s) the CSV does not")
    return found[:limit]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=pathlib.Path, help="the VALIDATION.csv register")
    parser.add_argument("destination", type=pathlib.Path, help="the JSON to write, or to check")
    parser.add_argument("--check", action="store_true", help="write nothing: derive and compare with the destination")
    parser.add_argument("--with-quotes", action="store_true", help="write agreement quotes (private storage only)")
    parser.add_argument("--release", default=DEFAULT_RELEASE, help=f"the register's release label (default {DEFAULT_RELEASE})")
    parser.add_argument("--main", default=DEFAULT_MAIN, help=f"the commit the citations were checked at (default {DEFAULT_MAIN})")
    parser.add_argument("--generated-at", default=None, help="YYYY-MM-DD (default: today, UTC)")
    args = parser.parse_args(argv)

    raw = args.source.read_bytes()

    if args.check:
        # The snapshot's identity (`release`, `main`, `generatedAt`) is declared, not derived: it
        # describes when the citations were taken, so a check compares what the CSV *derives* —
        # the rows and the digest — while leaving the declared block alone. A check that demanded
        # today's date would fail every clone on every day that is not the snapshot's.
        if not args.destination.exists():
            print(
                f"E42 {args.destination} is missing — it is generated, so run this script without --check",
                file=sys.stderr,
            )
            return 1
        text = args.destination.read_text(encoding="utf-8")
        try:
            current = json.loads(text)
        except json.JSONDecodeError as cause:
            print(f"E42 {args.destination} is not JSON ({cause}) — it is generated, not authored", file=sys.stderr)
            return 1
        declared = current.get("register") if isinstance(current.get("register"), dict) else {}
        document = build_document(
            raw,
            with_quotes=args.with_quotes or bool(current.get("quotesIncluded")),
            release=declared.get("release", args.release),
            main=declared.get("main", args.main),
            generated_at=declared.get("generatedAt", args.generated_at),
        )
        if dump(document) == text:
            print(
                f"register ok — {len(document['rows'])} rows reproduce {args.destination} byte for byte "
                f"from VALIDATION.csv@{document['register']['csvSha256'][:8]}"
            )
            return 0
        print(
            f"E42 {args.destination} is not what VALIDATION.csv derives — it was edited by hand, "
            "or the CSV moved and the register was not regenerated:",
            file=sys.stderr,
        )
        for line in differences(current, document):
            print(f"E42   {line}", file=sys.stderr)
        print(
            "E42   fix: edit the CSV (never the JSON), then run this script without --check",
            file=sys.stderr,
        )
        return 1

    document = build_document(
        raw,
        with_quotes=args.with_quotes,
        release=args.release,
        main=args.main,
        generated_at=args.generated_at,
    )

    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(dump(document), encoding="utf-8")

    print(
        f"{len(document['rows'])} rows -> {args.destination} "
        f"(register {document['register']['release']} @ {document['register']['main']}, "
        f"csv {document['register']['csvSha256'][:8]}, "
        f"quotes {'IN — private storage only' if args.with_quotes else 'dropped'})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
