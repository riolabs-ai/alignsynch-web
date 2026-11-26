---
title: Stage 2 · Settings
summary: Choose how answers are asked and how strictly they're compared.
audience: [Initiator, Build team]
status: Built (#1144) · design deltas open
sources:
  - "bundle: spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/"
  - "code: main @ 601ce26"
---
# Stage 2 · Settings

Choose how answers are asked and how strictly they're compared.

## At a Glance

| | |
|---|---|
| **Who acts** | Initiator |
| **The Initiator sees** | **Opinions Mode**: Basic (2 per Aspect) or Advanced (4) · **Alignment Setting**: Soft or Full |
| **The Counterparty sees** | The chosen Mode and Setting on the invite |
| **What moves it forward** | **Continue to Stage 3** |

![Stage 2 Settings](../../assets/wizard/stage-2-settings-desktop.png)

*Stage 2*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/assessment-create.ts:583` | "{ id: "mode-label", label: "Opinions Mode" }," | Mode. |
| `data/pages/assessment-create.ts:587` | "{ id: "setting-label", label: "Alignment Setting" }," | Setting. |
| `data/pages/invite.ts:103` | "{ id: "setting-soft", label: "Soft. Answers one step apart still count as aligned." }," | How the invite explains Soft. |

## References

| Shot | Source | Original |
|---|---|---|
| stage-2-settings-desktop | **Bundle** 01 | `spec-design-v2-bundles/01-spec-design-page-wizard-v2/reference/wizard-stage2-1280.png` |
