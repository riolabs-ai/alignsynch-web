---
title: Profile and Password
summary: "Fewer, honest controls: your name, your password and this session."
audience: [Initiator, Counterparty]
status: "Built (#1152 via #1170) · bundle refresh open (https://github.com/riolabs-ai/alignsynch/issues/1233)"
sources:
  - "prototype: settings.html (18 Nov capture)"
  - "issues: #1136, #1233"
  - "code: main @ 601ce26"
---
# Profile and Password

**Account Settings** keeps only what you actually use: how your name appears, your password, and signing out. Notifications are gone; you'll only get the emails that matter to a relationship.

## At a Glance

| Card | What you can do |
|---|---|
| **Profile** | Display Name, Profile URL, Bio, Country · **Save Profile** |
| **Email** | Read-only here; contact support to change it |
| **Password** | At least 8 characters · **Update Password** (other devices are signed out) |
| **Session** | **Sign Out** on this device |
| **Delete Account** | See [Delete Your Account](delete-your-account.md) |

## How It Works

![Account Settings: Profile, Email, Password, Session and Delete Account cards.](../../assets/account/settings-desktop.png)

*Account Settings · desktop*

<img src="../../assets/account/settings-mobile.png" alt="Account Settings on a phone" width="320" />

*mobile*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/settings.ts:36` | "heading: "Account Settings"," | Page heading. |
| `data/pages/settings.ts:65` | "{ id: "save", label: "Save Profile" }," | Profile. |
| `data/pages/settings.ts:145` | "{ id: "hint", label: "At least {min} characters. Other devices are signed out." }," | Password. |
| `data/pages/settings.ts:165` | "heading: "Session"," | Session card. |

**Open deltas:** bundle 11's reference still shows Notifications and the 30-day text; refresh tracked in [#1233](https://github.com/riolabs-ai/alignsynch/issues/1233).

## References

| Shot | Source | Original |
|---|---|---|
| settings-desktop | **Prototype** (18 Nov) (scaled from 2560 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| settings-mobile | **Prototype** (18 Nov) (scaled from 780 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |

Prototype tier used because the bundle 11 render is stale (it still shows Notifications). Scaled from the 2× capture.
