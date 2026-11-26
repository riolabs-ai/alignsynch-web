---
title: My Relationships and Start
summary: One place for every relationship and its next step.
audience: [Initiator]
status: "Built (#1150 via #1170) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/05-spec-design-page-start-my-relationships-v2/reference/"
  - "issues: #1129"
  - "code: main @ 601ce26"
---
# My Relationships and Start

**Start** tells you what to do next. **My Relationships** shows everything you're part of, with its status as an icon plus a word, and a menu for each one.

## At a Glance

| | |
|---|---|
| **Start** | **Your Next Steps**: the one conversation to have first, then small jobs like **Finish and Send the Invite** |
| **My Relationships** | Filters **All · Live · Waiting · Drafts · Paused**, search, and a card per relationship |
| **Card statuses** | ● Stage 6 Live · ✉ Waiting on Invite · ✎ Draft · ⏸ Paused |
| **Card menu** | Open, Continue Setup, Resend Invite, Cancel Invite, Abandon Draft, Leave Relationship |

## How It Works

### 1. Start

![Start: Welcome Back, Your Next Steps with Open Align and Finish and Send the Invite.](../../assets/start-and-list/start-desktop.png)

*Initiator · Start*

<img src="../../assets/start-and-list/start-mobile.png" alt="Start on a phone" width="320" />

*mobile*

### 2. My Relationships

![My Relationships with filters and four relationship cards.](../../assets/start-and-list/my-relationships-desktop.png)

*Initiator · My Relationships*

![A draft card's menu: Open, Continue Setup, Abandon Draft.](../../assets/start-and-list/card-menu-desktop.png)

*Initiator · card menu*

### 3. When there's nothing yet

![No Relationships Yet · Browse Templates.](../../assets/start-and-list/empty-desktop.png)

*Initiator · empty state*

## Good to Know

- The design sample shows four relationships. On Basic, each relationship is its own $9.99 / month membership.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/start.ts:46` | "heading: "Your Next Steps"," | Start heading. |
| `data/pages/start.ts:56` | "{ id: "draft-title", label: "Finish and Send the Invite" }," | Draft job. |
| `data/pages/dashboard-relationships.ts:47` | "heading: "My Relationships"," | List heading. |
| `data/pages/dashboard-relationships.ts:105` | "{ id: "live", label: "Stage 6 Live" }," | Filter words. |
| `data/pages/dashboard-relationships.ts:307` | "{ id: "leave", label: "Leave Relationship" }," | Menu includes leave, not delete. |
| `data/pages/dashboard-relationships.ts:225` | "{ id: "archive-why", label: "Not built yet (#743)" }," | Archive is shown as not built, though #743 is closed. |
| `data/pages/dashboard-relationships.ts:374` | "heading: "No Relationships Yet"," | Empty state. |

**Open deltas:** Archive (archive over delete) still reads "Not built yet (#743)"; v1 table labels "Ready to publish", "Running", "Void" remain in the list's state column.

## References

| Shot | Source | Original |
|---|---|---|
| start-desktop | **Bundle** 05 | `spec-design-v2-bundles/05-spec-design-page-start-my-relationships-v2/reference/start-1280.png` |
| start-mobile | **Bundle** 05 (cropped to the top 2200 px) | `spec-design-v2-bundles/05-spec-design-page-start-my-relationships-v2/reference/start-390.png` |
| my-relationships-desktop | **Bundle** 05 | `spec-design-v2-bundles/05-spec-design-page-start-my-relationships-v2/reference/my-relationships-1280.png` |
| card-menu-desktop | **Bundle** 05 | `spec-design-v2-bundles/05-spec-design-page-start-my-relationships-v2/reference/kebab-relationship-1280.png` |
| empty-desktop | **Bundle** 05 | `spec-design-v2-bundles/05-spec-design-page-start-my-relationships-v2/reference/my-relationships-empty-1280.png` |
