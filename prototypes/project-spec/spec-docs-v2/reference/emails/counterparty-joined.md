---
title: Counterparty Joined Email
summary: Tells the Initiator the other person is in and the free week has started.
audience: [Initiator]
status: Built (https://github.com/riolabs-ai/alignsynch/issues/1227, https://github.com/riolabs-ai/alignsynch/pull/1240) · no delta
sources:
  - "bundle: spec-design-v2-rc1.3-bundle/05-email-counterparty-joined-1227/"
  - "code: lib/email/templates/counterparty-joined.ts"
---
# Counterparty Joined Email

Tells the Initiator the other person is in and the free week has started.

## At a Glance

| | |
|---|---|
| **Sent to** | Initiator |
| **When** | When the Counterparty accepts |
| **Body** | Settled copy: "Your 7 days free start today." only on a free trial · last line "Your answers stay hidden from each other until you have both answered." |

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `lib/email/templates/counterparty-joined.ts:54` | "return `${facts.joiner} joined — your assessment can start`;" | Subject. |
| `lib/email/templates/counterparty-joined.ts:92` | "Your 7 days free start today." | Body: the trial line, drawn **only when `onFreeTrial`** — a paid plan is told nothing about a trial, which is the #1227 delta, closed. |

## References

No render of this email exists; the body is a copy spec only.
