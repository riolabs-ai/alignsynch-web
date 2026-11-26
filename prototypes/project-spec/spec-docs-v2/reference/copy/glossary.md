---
title: Glossary
summary: Every v2 word, what it means, and how it's written.
audience: [Initiator, Counterparty, Build team]
status: Designed
sources:
  - "code: docs/glossary.md (repo)"
  - "notes: DESIGN-NOTES"
---
# Glossary

| Term | Meaning | Write it as |
|---|---|---|
| Relationship | Two people, one set of Aspects, and what follows | Relationship |
| Initiator | The person who starts it and covers it | Initiator |
| Counterparty | The person invited; never pays | Counterparty |
| Template | A ready-made set of Aspects | Template · My Templates · Library |
| Aspect | One question on the 1–5 scale | Aspect |
| Stage | Six steps: Details, Settings, Aspects, Account, Invite, Align | Stage 6 · Align |
| Opinions Mode | Basic (Feel, Wish) or Advanced (adds Think, Guess) | Basic Mode · Advanced Mode |
| Alignment Setting | Soft or Full | Soft · Full |
| In Synch · Small Gap · Gap | Status of one Aspect | ✓ In Synch · ≈ Small Gap · ⚑ Gap |
| Next Step | The widest Gap, to talk about first | Next Step |
| Discussion | The thread beside the results | Discussion |
| Paused | Stage 6 on hold, nothing lost | ⏸ Paused |
| Extra Week | One free 7 more days, once | Extra Week (never "extension") |
| Basic | The one plan: $9.99 / month, one relationship | Basic |
| Closed | Someone left; read-only for both | Relationship Closed |

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `content/stages.ts:104` | "export const STAGE_LABELS: Record<RelationshipStage, string> = {" | Old four-stage labels still in code. |
| `lib/relationship/pause.ts:46` | "export const EXTRA_WEEK_DAYS = 7;" | **Fixed**: the code now says Extra Week too. |
