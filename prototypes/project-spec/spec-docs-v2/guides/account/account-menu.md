---
title: Account Menu
summary: Get to your account and sign out from any page.
audience: [Initiator, Counterparty]
status: "Built (#1152 via #1170)"
sources:
  - "bundle: spec-design-v2-bundles/11-spec-design-page-account-settings-v2/reference/account-menu-1280.png"
  - "issues: #1136"
  - "code: main @ 601ce26"
---
# Account Menu

Your avatar in the top-right corner opens a small menu: your name and email, **Account Settings**, and **Sign Out**. It's the same on every page.

## At a Glance

| Row | What it does |
|---|---|
| Your name and email | Shows which account you're in |
| **Account Settings** | Profile, password, session and Delete Account |
| **Sign Out** | Signs you out on this device |

## How It Works

![The header avatar menu: name and email, Account Settings, Sign Out.](../../assets/account/account-menu-desktop.png)

*Account menu · desktop*

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/shell.ts:664` | "{ id: "settings", label: "Account Settings" }," | Menu row. |
| `data/pages/shell.ts:665` | "{ id: "logout", label: "Sign Out" }," | Menu row. |

**Open deltas:** none found; no QA capture.

## References

| Shot | Source | Original |
|---|---|---|
| account-menu-desktop | **Bundle** 11 | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
