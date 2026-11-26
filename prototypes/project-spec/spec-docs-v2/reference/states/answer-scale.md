---
title: The Answer Scale
summary: One 1–5 scale for every Aspect, labelled at both ends.
audience: [Initiator, Counterparty, Build team]
status: Built (#1173)
sources:
  - "prototype: scale-before-after.png"
  - "code: main @ 601ce26"
---
# The Answer Scale

Every Aspect is answered on the same five steps. The left label says what a **1** means and the right label what a **5** means. Basic Mode asks **Feel** and **Wish**; Advanced adds **Think** and **Guess**.

## At a Glance

| Gap between answers | Status | Soft | Full |
|---|---|---|---|
| 0 | ✓ In Synch | Aligned | Aligned |
| 1 | ≈ Small Gap | Aligned | Not aligned |
| 2–4 | ⚑ Gap | Not aligned | Not aligned |

![The 1–5 scale before and after: numbered bars with left and right labels.](../../assets/system/scale-before-after-desktop.png)

*Scale · before and after*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:623` | "{ id: "left-help", label: "The low end of the scale — what a 1 means." }," | Left label. |
| `data/pages/assessment-create.ts:625` | "{ id: "right-help", label: "The high end — what a 5 means." }," | Right label. |
| `data/pages/admin-gaps.ts:50` | "Soft is the tolerant lens: a Gap of 1 is still in range" | Soft vs Full. |

## References

| Shot | Source | Original |
|---|---|---|
| scale-before-after-desktop | **Prototype** (cropped to the top 1800 px) | `spec-design-v2-prototype/screens/scale-before-after.png` |
