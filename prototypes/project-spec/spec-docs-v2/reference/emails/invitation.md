---
title: Invitation Email
summary: "The one email the Counterparty gets: who invited them, to what, and a link."
audience: [Counterparty]
status: Built
sources:
  - "code: lib/email/templates/invitation.ts · content/email-bodies.md"
---
# Invitation Email

The one email the Counterparty gets: who invited them, to what, and a link.

## At a Glance

| | |
|---|---|
| **Sent to** | Counterparty |
| **When** | When the Initiator presses **Continue with 7 Days Free**; a reminder goes 2 days before the link expires |
| **Body** | Who invited you and the template, answered separately. No price, trial or card. |

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `lib/email/templates/invitation.ts:42` | "return `${facts.inviter} invited you to a ${facts.template} assessment`;" | Subject. |
| `lib/email/templates/invitation-reminder.ts:60` | "/** `Your invitation expires in 2 days` — the spec's subject, which names no party. */" | Reminder subject. |
| `content/email-bodies.md:10` | "This is {{inviter}}'s invitation to answer {{template}}: a set of statements about the two of you," | Body. |

## References

No render of this email exists; the body is a copy spec only.
