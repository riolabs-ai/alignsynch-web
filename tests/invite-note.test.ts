/**
 * The invitation's personal note — the rules, before any surface draws it (#1275, spec APP-22).
 *
 * Three things are pinned, because all three are ways the field rots:
 *
 *   the shape   what a stored note is: one line ending, no control characters, no runaway blank
 *               runs, trimmed — so the mail's line reading and the recipient's blockquote see the
 *               same text no matter what a browser posted.
 *   the ceiling 400 characters, counted in characters a person sees, so an emoji is one and the
 *               column's `char_length()` CHECK agrees with the code.
 *   the absence a note of nothing but whitespace is `null`, not `''`: "no note" has one spelling,
 *               and every surface draws nothing for it rather than an empty quotation.
 *
 * Pure: no database, no React, no clock.
 */
import { describe, expect, it } from "vitest";

import { INVITE_NOTE_MAX, noteProblem, noteToStore, plainNote } from "@/lib/flow/invite-note";

describe("plainNote — what a stored note looks like", () => {
  it("normalises every line ending to one newline", () => {
    expect(plainNote("one\r\ntwo\rthree")).toBe("one\ntwo\nthree");
  });

  it("drops control characters and keeps tabs and newlines", () => {
    expect(plainNote("a\u0000b\u0007c\td\ne")).toBe("abc\td\ne");
    expect(plainNote("a\u001fb")).toBe("ab");
  });

  it("trims trailing space on each line and the whole note", () => {
    expect(plainNote("  first   \n  second  \n")).toBe("first\n  second");
  });

  it("collapses three or more blank lines into one blank line", () => {
    expect(plainNote("one\n\n\n\ntwo")).toBe("one\n\ntwo");
  });

  it("is a paragraph, not a template: markup survives as the characters typed", () => {
    // The band derives HTML from text and React escapes children, so nothing here escapes — and
    // nothing here strips, either. A note that reads `<b>` says `<b>`.
    expect(plainNote("<b>hi</b>")).toBe("<b>hi</b>");
  });
});

describe("noteProblem — the ceiling", () => {
  it("accepts a note at exactly the ceiling", () => {
    expect(noteProblem("x".repeat(INVITE_NOTE_MAX))).toBeNull();
  });

  it("refuses one character past it", () => {
    expect(noteProblem("x".repeat(INVITE_NOTE_MAX + 1))).toBe("too-long");
  });

  it("counts characters a person sees, so an emoji is one", () => {
    // 400 emoji are 800 UTF-16 units and one character each: a cap measured in units would refuse
    // a note the database's `char_length()` CHECK takes.
    expect(noteProblem("🙂".repeat(INVITE_NOTE_MAX))).toBeNull();
    expect(noteProblem("🙂".repeat(INVITE_NOTE_MAX + 1))).toBe("too-long");
  });
});

describe("noteToStore — the one call both writers make", () => {
  it("stores a note as its plain text", () => {
    expect(noteToStore("  Hello\r\n\r\n\r\nworld  ")).toEqual({ ok: true, note: "Hello\n\nworld" });
  });

  it("stores nothing for a field left empty", () => {
    expect(noteToStore("")).toEqual({ ok: true, note: null });
  });

  it("stores nothing for a field holding only whitespace", () => {
    // "no note" is one value, not two spellings of one.
    expect(noteToStore("   \n\t\n ")).toEqual({ ok: true, note: null });
  });

  it("refuses a note past the ceiling rather than truncating it", () => {
    // Truncating would mail half a sentence the person is looking at in full.
    expect(noteToStore("x".repeat(INVITE_NOTE_MAX + 1))).toEqual({
      ok: false,
      problem: "too-long",
    });
  });
});
