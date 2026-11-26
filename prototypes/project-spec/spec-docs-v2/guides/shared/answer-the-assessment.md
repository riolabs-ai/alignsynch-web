---
title: Answer the Assessment
summary: Answer honestly, one Aspect at a time, at your own pace.
audience: [Initiator, Counterparty]
status: "Built (#1173, #1235) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/10-spec-design-page-assessment-v2/reference/"
  - "bundle: spec-design-v2-rc1.3-bundle/01-answer-screen-paused-1223/reference/assessment-sheet-save-chip-*"
  - "issues: #1128, #1223"
  - "code: main @ 601ce26"
---
# Answer the Assessment

Each of you answers the same Aspects on the same 1–5 scale, privately. You see one Aspect at a time, every answer saves as you go, and you can stop and come back later. Nothing is shown to the other person until you've both finished.

## At a Glance

| | |
|---|---|
| **Where** | Relationship › **Start Assessment** or **Continue Assessment** |
| **Progress** | Round 1 · Aspect 2 of 5 |
| **Saving** | Saves as You Go · Saving… · ✓ Saved · Not Saved · Pick Again |
| **Privacy** | Private until you both finish |
| **Finish** | Review your answers, then submit. They're sealed for Round 1 |

## How It Works

### 1. Answer one Aspect at a time

![Round 1 answer screen with the 1–5 scale.](../../assets/assessment/answer-desktop.png)

*Marcus (Initiator) · answer screen*

![Elena's answer screen: the same Aspect and scale.](../../assets/assessment/answer-counterparty-desktop.png)

*Elena (Counterparty) · answer screen*

### 2. Watch it save

![The save status chip with a check icon and Saved.](../../assets/assessment/save-chip-desktop.png)

*Save status · ✓ Saved*

<img src="../../assets/assessment/save-chip-mobile.png" alt="Save status on a phone" width="320" />

*mobile*

### 3. Come back any time

<img src="../../assets/assessment/resume-mobile.png" alt="Welcome Back: your answers are saved, with your place in the list." width="320" />

*Resuming · mobile*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-answer.ts:77` | "{ id: "position", label: "Round 1 · Aspect {aspect} of {total}" }," | Progress line. |
| `data/pages/assessment-answer.ts:78` | "{ id: "saving", label: "Saves as you go" }," | Chip words in sentence case; spec: **Saves as You Go**. |
| `data/pages/assessment-answer.ts:80` | "{ id: "save-failed", label: "Not saved — pick again" }," | Spec: **Not Saved · Pick Again**. |
| `data/pages/assessment-answer.ts:57` | "heading: "Private until you both finish."," | Privacy heading; Title Case needed. |
| `data/pages/assessment-answer.ts:112` | "body: "Once you submit, your answers are sealed for Round 1."," | Sealed for Round 1. |
| `data/pages/assessment-answer.ts:46` | "{ id: "back", label: "Back to the relationship" }," | Spec: **Back to the Relationship**. |

**Open deltas:** chips are words with no icon (flagged on #1173); Title Case throughout ([#1223](https://github.com/riolabs-ai/alignsynch/issues/1223)).

## References

| Shot | Source | Original |
|---|---|---|
| answer-desktop | **Bundle** 10 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| answer-counterparty-desktop | **Bundle** 10 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| save-chip-desktop | **Bundle** rc1.3 01 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| save-chip-mobile | **Bundle** rc1.3 01 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| resume-mobile | **Bundle** 10 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
