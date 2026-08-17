---
name: ux-audit
description: The HisobAI UX and design contract — the four request states, mobile rules, component and text style from design.md, accessibility requirements, and the performance budget. Load before auditing frontend UX.
---

Source: `docs/files/design.md`, `docs/FRONTEND.md` §7 (line 272), §11 (471),
§12 (487), `TZ.md` §20.

Core principle: **the number matters more than the decoration.**

## The user

A phone-shop admin in Uzbekistan, mostly on a **375px phone**, sometimes a
laptop. Uzbek only. Handling money, debts and customer passports while a
customer waits at the counter. Speed and unambiguous numbers beat polish.

## The four states — all designed, none skipped (`FRONTEND.md` §7)

| State              | Rule                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Loading            | **Skeleton, not spinner** — the table shape is preserved so the page does not jump. Not shown at all under 200 ms, to avoid flicker |
| Error              | What happened + what to do + a retry button. **No apology**                                                                         |
| Empty              | Name the next step: "Hali savdo yo'q. Birinchi savdoni qo'shing." + an action button                                                |
| Empty after filter | Different text: "Ushbu filtr bo'yicha savdo topilmadi." + "Filtrni tozalash"                                                        |
| Partial failure    | On the dashboard, one failed block must not take the page down — the rest still renders                                             |

The last row matters because `GET /dashboard` is a single request (§14.1) whose
blocks are displayed independently.

## Component rules (`design.md` §6)

- Buttons: primary = `bg-brand-action` + white text; secondary = white with a
  `neutral-300` border; destructive = `danger`. **One primary button per screen.**
- Touch target **≥ 44×44px** — the shop works phone-in-hand.
- Focus: `outline: 2px solid #274FB5; outline-offset: 2px` — **never removed**.
- Tables: header row `neutral-50`, borders `neutral-200`, **amounts
  right-aligned**.
- Empty state names the action, never just "Ma'lumot yo'q".
- Errors state the cause and the fix, without apologising:
  "Telefon raqami band. Boshqa raqam kiriting."

Spacing is a 4px scale — 4/8/12/16/24/32/48, no in-between values.
Radius: input and button `10px`, card and modal `14px`, badge `6px`.
Shadows only on floating elements (dropdown, modal, toast); ordinary cards use
a border, not a shadow.

## Text style (`design.md` §7)

- Uzbek, Latin script, **sentence case** (`Sotuvni saqlash`, not `SOTUVNI SAQLASH`).
- A button names the action it performs: not `Saqlash` but `Sotuvni saqlash`.
- One concept, one word: `mijoz` everywhere (never `klient`); likewise `qarz`,
  `nasiya`, `qoldiq`, `tarif`. Cross-check against `GLOSSARY.md`.
- No technical terms in the UI: not "xatolik 500" but
  "Server javob bermadi. Qayta urinib ko'ring."
- All strings come from `lib/messages.ts`, keyed by error `code`.

## Navigation (`FRONTEND.md` §4)

Phone < 768px: bottom bar, 5 items — Boshqaruv · Savdo · Ombor · Mijozlar ·
Yana; "Yana" opens a sheet with the rest.
Laptop ≥ 768px: left sidebar, everything visible.
Both: shop name, today's rate (CBU + shop), and a stale-rate warning bar.
**One** FAB only — "Yangi savdo", bottom right, on every page.

## Accessibility (`FRONTEND.md` §11, WCAG 2.2 AA)

- The focus ring is never disabled.
- **Colour is never the only signal** (TZ §20): debt, error and success are
  also marked by text and icon. A status badge always contains text.
- Modal: focus trapped, `Esc` closes, focus moves to the first interactive
  element on open.
- Every field is bound to a `<label>`; a `placeholder` never substitutes for one.
- Tables carry a `<caption>` or `aria-label`; amount columns use `<th scope>`.
- Contrast ≥ 4.5:1 for text, ≥ 3:1 for large text. `neutral-400` only at 16px+.

## Performance budget (`FRONTEND.md` §12)

Dashboard JS ≤ 200 KB gzip · `GET /dashboard` response ≤ 50 KB · LCP ≤ 2.5 s on
4G/mid-range phone · one chunk per route · Recharts only on `/reports` and
`/dashboard`, dynamically imported (it is the heaviest dependency).

## Money presentation

Currency always visible next to an amount. Consistent grouping. Reversal and
negative rows visually distinct **and** labelled. No truncated sums. The
stale-rate warning must be visible when it applies (§16.6).

## Useful greps

```
use client                      unnecessary client components
className=".*#[0-9a-fA-F]{3,6}  hardcoded colors instead of tokens
aria-|role=|<label               accessibility coverage
overflow-x|min-w-\[|w-\[         375px overflow risk
<table                          tables that must reflow on phones
onSubmit|disabled=               double-submit protection
isLoading|isPending|isError      the four states
```

## Reporting rules

Every finding: `file:line`, the problem, **what the user actually feels**, and
a concrete fix. Prioritise what a real user hits. Taste is not a finding unless
it causes measurable usability or maintenance harm. Name what is done well, so
a deliberate decision does not get "improved" away.
