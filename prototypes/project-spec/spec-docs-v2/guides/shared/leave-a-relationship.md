---
title: Leave a Relationship
summary: Step away without erasing the other person's results.
audience: [Initiator, Counterparty]
status: "Built (#1149 via #1170) · no shot"
sources:
  - "notes: DESIGN-NOTES §42 · issue #1135"
  - "code: main @ 601ce26"
---
# Leave a Relationship

Either of you can leave. Leaving **closes** Stage 6 for both of you; it never deletes. Your answers and the Discussion stay readable to both, so nobody loses what they put in. An Initiator with an unsent draft can **Abandon Draft** instead.

## At a Glance

| Action | Who | Result |
|---|---|---|
| **Leave Relationship** | Either person | Stage 6 closes for both. Nothing is deleted |
| **Abandon Draft** | Initiator, unsent draft | The draft ends. Nobody else is affected |
| **Request My Removal** | Either person, after leaving | Support removes your name and answers within 30 days |

## How It Works

1. Open the relationship's menu (⋮) and choose **Leave Relationship**.
2. Read **Leave This Relationship?** — "Stage 6 closes for you and {name}. Answers and the discussion stay readable. Nothing is deleted."
3. Confirm with **Leave Relationship**, or **Stay**.
4. You'll see **You left. Stage 6 is closed.** and the badge **Relationship Closed**.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationships.ts:331` | "heading: "Leave This Relationship?"," | Confirm dialog. |
| `data/pages/dashboard-relationships.ts:345` | "{ id: "leave", label: "You left. Stage 6 is closed." }," | Toast. |
| `data/pages/dashboard-relationships.ts:322` | "heading: "Abandon This Draft?"," | Draft alternative. |
| `data/pages/dashboard-relationship-detail.ts:731` | "heading: "This relationship is closed"," | Closed banner; Title Case needed. |

**Gap:** no render of the Closed banner exists in any tier.

## References

No shot: there is no bundle, QA, spec or prototype render of the leave flow.
