---
title: Save These Aspects as a Template
summary: Liked the questions? Keep your own copy for future relationships.
audience: [Counterparty]
status: "Built (#1153 via #1170) · design deltas open"
sources:
  - "bundle: spec-design-v2-bundles/03-spec-design-page-relationship-detail-v2/reference/rd-live-aspects-counterparty-*"
  - "issues: #1134"
  - "code: main @ 601ce26"
---
# Save These Aspects as a Template

The template behind this relationship belongs to the person who invited you. If the Aspects worked for you, save a copy. It becomes yours in **My Templates**, ready to edit or to start a relationship of your own.

## At a Glance

| | |
|---|---|
| **Where** | Relationship › **Aspects** tab |
| **Action** | **Save This Template to My Templates** |
| **Result** | Saved as "{title}", with every Aspect, in My Templates |
| **Already saved?** | It tells you, and points to your copy |

## How It Works

![Elena's Aspects tab with a Save These Aspects as a My Template action.](../../assets/counterparty/aspects-save-desktop.png)

*Elena (Counterparty) · Aspects tab*

<img src="../../assets/counterparty/aspects-save-mobile.png" alt="Aspects tab on a phone" width="320" />

*mobile*

1. Open the **Aspects** tab.
2. Press **Save This Template to My Templates**.
3. Open **My Templates** to edit your copy.

## For the Build Team

**What's Built Today** (main @ `601ce26`, v2.0.0-rc1.2 plus #1235–#1237; each quote is on the cited line)

| Citation | Evidence | What it means |
|---|---|---|
| `data/pages/dashboard-relationship-detail.ts:610` | "heading: "Keep these Aspects for yourself"," | Section heading; Title Case needed. |
| `data/pages/dashboard-relationship-detail.ts:613` | "{ id: "submit", label: "Save this template to My Templates" }," | Action; Title Case needed. |
| `data/pages/dashboard-relationship-detail.ts:619` | "{ id: "reused", label: "You already have this one, saved as “{title}”." }," | Already saved. |

**Open deltas:** Title Case on the heading and action.

## References

| Shot | Source | Original |
|---|---|---|
| aspects-save-desktop | **Bundle** 03 (cropped to the top 1800 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
| aspects-save-mobile | **Bundle** 03 (cropped to the top 2200 px) | see [MANIFEST.md](../../MANIFEST.md#asset-sources) |
