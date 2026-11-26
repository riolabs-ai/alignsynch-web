---
title: Chat and Discussion
summary: Talk it through, right next to the results.
audience: [Initiator, Counterparty]
status: "Built (#1154 via #1170) · chat does not persist yet"
sources:
  - "bundle: spec-design-v2-bundles/07-spec-design-page-chat-v2/reference/"
  - "issues: #1131, #1188"
  - "code: main @ 601ce26"
---
# Chat and Discussion

Each relationship has one thread for the two of you. Tag a message with an Aspect and it carries that Aspect's status, so the conversation stays tied to the results. **Chat** gathers every thread in one place.

## At a Glance

| Thread state | What you see |
|---|---|
| **Stage 6 Live** | The composer: **Message {name}**, **Tag an Aspect**, **Send** |
| **Waiting to join** | When it opens; no composer yet |
| **Paused · Read-Only** | Read everything; replies wait |

## How It Works

![Chat with the conversation list and an open thread.](../../assets/chat/chat-desktop.png)

*Chat · desktop*

<img src="../../assets/chat/chat-mobile.png" alt="Chat on a phone" width="320" />

*Chat · mobile*

![The Discussion inside a relationship, with Aspect tags.](../../assets/chat/relationship-thread-desktop.png)

*Discussion inside the relationship*

![The Discussion while paused: read-only.](../../assets/chat/relationship-thread-paused-desktop.png)

*Discussion · Paused · Read-Only*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/chat.ts:51` | "{ id: "tag-group", label: "Tag an Aspect" }," | Aspect tags. |
| `data/pages/chat.ts:60` | "{ id: "state-paused", label: "Paused · Read-Only" }," | Paused thread. |
| `data/pages/dashboard-relationship-detail.ts:259` | "{ id: "read-only", label: "Read-only while Stage 6 is paused." }," | Discussion line. |
| `docs/changelog/v2-0-0-rc1.md:119` | "**Chat does not persist.**" | Messages are not stored yet. |

**Open deltas:** persistence for chat messages (no approved schema yet).

## References

| Shot | Source | Original |
|---|---|---|
| chat-desktop | **Bundle** 07 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| chat-mobile | **Bundle** 07 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| relationship-thread-desktop | **Bundle** 07 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| relationship-thread-paused-desktop | **Bundle** 07 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
