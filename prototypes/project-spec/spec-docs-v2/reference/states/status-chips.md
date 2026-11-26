---
title: Status Chips
summary: Icon plus word, every time, and never red.
audience: [Initiator, Counterparty, Build team]
status: "Built (#1145, #1150) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/09-spec-design-system-tokens-v2/reference/patterns-1280.png"
  - "prototype: palette-before-after.png"
  - "code: main @ 601ce26"
---
# Status Chips

## At a Glance

| Chip | Icon | Tone |
|---|---|---|
| **In Synch** | ✓ | Synch green |
| **Small Gap** | ≈ | Amber |
| **Gap** | ⚑ | Apricot (never red) |
| **Stage 6 Live** | ● | Teal |
| **Waiting on Invite** | ✉ | Neutral |
| **Draft** | ✎ | Neutral |
| **Paused** | ⏸ | Grey |
| **Saved / Saving… / Not Saved** | ✓ / spinner / ⚑ | Neutral / apricot |

![Status patterns from the design system](../../assets/system/status-patterns-desktop.png)

*Design system · status patterns*

![Palette before and after: red removed, apricot for Gap.](../../assets/system/palette-before-after-desktop.png)

*Palette · before and after*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/chat.ts:56` | "{ id: "chip-gap", label: "Gap" }," | Gap word. |
| `data/pages/dashboard-relationship-detail.ts:236` | "{ id: "badge", label: "Paused" }," | Paused badge. |
| `data/pages/assessment-answer.ts:79` | "{ id: "saved", label: "Saved" }," | Save chip is a bare word (no icon) today. |

**Open deltas:** save chips and CRUD matrix cells ship as bare words (#1173, #1232).

## References

| Shot | Source | Original |
|---|---|---|
| status-patterns-desktop | **Bundle** 09 | `spec-design-v2-bundles/09-spec-design-system-tokens-v2/reference/patterns-1280.png` |
| palette-before-after-desktop | **Prototype** | `spec-design-v2-prototype/screens/palette-before-after.png` |
