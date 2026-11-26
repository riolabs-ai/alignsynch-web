---
title: When a Relationship Pauses
summary: Sometimes Stage 6 pauses. You don't need to do anything, and nothing is lost.
audience: [Counterparty]
status: "Built (#1143, #1236) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/"
  - "bundle: spec-design-v2-rc1.3-bundle/01-answer-screen-paused-1223/reference/"
  - "issues: #1224, #1223"
  - "code: main @ 601ce26"
---
# When a Relationship Pauses

Now and then the person who invited you will need to resume Stage 6 on their side. While it's paused, everything you've answered and said is kept, and you can still read your results and the Discussion. There's nothing for you to do. When they resume it, you carry on where you left off.

## At a Glance

| | |
|---|---|
| **Your badge** | ⏸ Paused · Waiting on Marcus |
| **The line under the stages** | Stage 6 is paused until Marcus resumes it. Everything is saved. |
| **Your Next Step** | Waiting on Marcus · Nothing to do. You can still read your results. |
| **What still works** | Reading results, the Discussion and the Aspects; answering when the form is still open |
| **What waits** | New Discussion replies and Aspect changes |
| **What's lost** | Nothing |

## How It Works

### 1. You see that it's paused

![Elena's relationship page: Paused · Waiting on Marcus, with See Your Results.](../../assets/counterparty/paused-waiting-desktop.png)

*Elena (Counterparty) · Paused · Waiting on Marcus*

<img src="../../assets/counterparty/paused-waiting-mobile.png" alt="The paused relationship page on a phone" width="320" />

*mobile*

### 2. Keep reading, or keep answering

If you open the assessment while the form is still open, you'll see **Paused · Waiting on Marcus** with **You can keep answering.** and **Back to the Relationship**.

![Answer screen for Elena while paused. This shot still shows the older Answering Is Paused For Now pane.](../../assets/counterparty/answering-paused-desktop.png)

*Elena (Counterparty) · answer screen while paused*

*Shot predates the settled copy above*

<img src="../../assets/counterparty/answering-paused-mobile.png" alt="Answer screen while paused, on a phone" width="320" />

*mobile*

### 3. It resumes

When Marcus resumes it, the badge goes back to **Stage 6 Live** and the Discussion opens again.

## Good to Know

- **A pause isn't the end.** Leaving a relationship closes it; a pause only puts Stage 6 on hold.
- **Your answers stay sealed** until you've both answered, paused or not.

## For the Build Team

**Acceptance**

- [ ] Badge **Paused · Waiting on {name}**, grey, pause icon. No red.
- [ ] Line **Stage 6 is paused until {name} resumes it. Everything is saved.**
- [ ] Answer screen: **Paused · Waiting on {name}**, **You can keep answering.**, **Back to the Relationship**.
- [ ] This seat never reads a reason for the pause, and nothing on it names what the other person does to resume.

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationship-detail.ts:237` | "{ id: "badge-waiting", label: "Paused · Waiting on {initiator}" }," | Badge. |
| `data/pages/dashboard-relationship-detail.ts:244` | "label: "Stage 6 is paused until {initiator} resumes it. Everything is saved."," | Pause line (#1236). |
| `data/pages/dashboard-relationship-detail.ts:254` | "{ id: "waiting-body", label: "Nothing to do. You can still read your results." }," | Next Step body. |
| `data/pages/assessment-answer.ts:233` | "{ id: "heading-counterparty", label: "Answering Is Paused For Now" }," | Answer pane still uses the old heading; spec: **Paused · Waiting on {name}**. |
| `data/pages/assessment-answer.ts:236` | "id: "lapsed-note"," | An Initiator-only note sits in the same section; confirm it never renders for this seat. |

**Open deltas:** the answer-screen heading and body ([#1223](https://github.com/riolabs-ai/alignsynch/issues/1223), after [PR #1235](https://github.com/riolabs-ai/alignsynch/pull/1235)); recapture these shots after the fix.

## References

| Shot | Source | Original |
|---|---|---|
| paused-waiting-desktop | **Bundle** 03 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| paused-waiting-mobile | **Bundle** 03 (cropped to the top 2200 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| answering-paused-desktop | **Bundle** rc1.3 01 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| answering-paused-mobile | **Bundle** rc1.3 01 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |

The rc1.3 answer-screen shots are from 19 Nov and still show the older pane.
