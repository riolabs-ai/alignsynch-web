---
title: Propose a Change
summary: "No silent edits: once Stage 6 is live, both of you agree before an Aspect changes."
audience: [Initiator, Counterparty]
status: "Built (#1155 via #1170) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/modal-propose-*, proposal-incoming-*"
  - "issues: #1133"
  - "code: main @ 601ce26"
---
# Propose a Change

Once you're both answering, the Aspects are locked, so nobody's answers change meaning under them. If an Aspect needs rewording, either of you can propose a change. The other person sees it and accepts or declines.

## At a Glance

| | |
|---|---|
| **When** | Stage 6 is live and the Aspects are locked |
| **Who** | Either person |
| **How** | **Propose a Change** on the Aspect |
| **Result** | Nothing changes until the other person accepts |

## How It Works

![Propose a Change dialog for one Aspect.](../../assets/propose/propose-desktop.png)

*Proposing a change*

![An incoming proposal with Accept and Decline.](../../assets/propose/incoming-desktop.png)

*Reviewing an incoming proposal*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationship-detail.ts:344` | "heading: "Aspects are Locked"," | Lock heading; Title Case "Aspects Are Locked". |
| `data/pages/dashboard-relationship-detail.ts:347` | "{ id: "rule", label: "Changes are proposed and agreed by both of you." }," | The rule. |

**Open deltas:** confirm the proposal accept / decline round trip on the built app; no QA capture.

## References

| Shot | Source | Original |
|---|---|---|
| propose-desktop | **Bundle** 03 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| incoming-desktop | **Bundle** 03 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
