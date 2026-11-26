---
title: Delete Your Account
summary: "A clear, final choice: deleting is immediate and can't be restored."
audience: [Initiator, Counterparty]
status: Built (#1163, lib/account/purge.ts)
sources:
  - "prototype: settings.html delete confirm (18 Nov capture)"
  - "issues: #1163"
  - "code: main @ 601ce26"
---
# Delete Your Account

If you want to leave AlignSynch, you can delete your account yourself, at any time, from **Account Settings**. It happens straight away. There's no waiting period and no way to bring it back, so the page asks you to type a short phrase first.

## At a Glance

| | |
|---|---|
| **Where** | Account Settings › **Delete Account** |
| **Confirm** | Type **delete my account** |
| **When it happens** | Immediately |
| **Can it be undone?** | No |
| **Afterwards** | "Your account is deleted. You are signed out." |

## How It Works

![Delete Account card with the typed confirmation phrase.](../../assets/account/delete-confirm-desktop.png)

*Delete Account · desktop*

<img src="../../assets/account/delete-confirm-mobile.png" alt="Delete Account on a phone" width="320" />

*mobile*

1. Open **Account Settings** and scroll to **Delete Account**.
2. Type **delete my account** exactly.
3. Press **Delete Account**.

## Good to Know

- **Think about your relationships first.** To step away from one without deleting your account, use **Leave Relationship**.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/settings.ts:199` | "body: "Deleting your account is immediate and irreversible" | Immediate, no grace period. |
| `data/pages/settings.ts:201` | "{ id: "confirm-phrase", label: "delete my account" }," | Phrase. |
| `data/pages/settings.ts:206` | "{ id: "outcome-deleted", label: "Your account is deleted. You are signed out." }," | Outcome. |
| `lib/account/purge.ts:2` | "Deleting an account: the auth-side delete, and the scrub it is followed by (#278)." | The writer. |

**Open deltas:** bundle 11 still shows the old 30-day text ([#1233](https://github.com/riolabs-ai/alignsynch/issues/1233)).

## References

| Shot | Source | Original |
|---|---|---|
| delete-confirm-desktop | **Prototype** (18 Nov) (scaled from 2560 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| delete-confirm-mobile | **Prototype** (18 Nov) (scaled from 780 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |

Prototype tier used because the bundle 11 render is stale. Scaled from the 2× capture.
