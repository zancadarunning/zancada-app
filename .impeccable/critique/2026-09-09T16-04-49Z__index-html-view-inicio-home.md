---
target: "Home screen (index.html #view-inicio)"
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\ferna\\OneDrive\\Documentos\\zancada app\\zancada-repo\\index.html#view-inicio (Home)"
timestamp: 2026-09-09T16-04-49Z
slug: index-html-view-inicio-home
---
Method: dual-agent (A: a9d8acaa0508e5fbc · B: a2245a07016f4b840)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | First paint shows literal "—" placeholders instead of a skeleton; sync status is a tiny icon-only badge. |
| 2 | Match Between System / Real World | 4/4 | Domain language is precise and native (racha, puesta a punto, zona de esfuerzo). |
| 3 | User Control and Freedom | 3/4 | Readiness answer is re-pickable; dismissing the install banner has no visible "bring it back" path. |
| 4 | Consistency and Standards | 2/4 | Conflicts with the project's own "One Signal Rule" — hi-vis lime appeared on 10 different elements on one screen. |
| 5 | Error Prevention | 3/4 | The one semi-destructive action (lowering today's session) is gated behind a confirm dialog. |
| 6 | Recognition Rather Than Recall | 3/4 | Readiness chips are labeled text; but info-toggle rows have no visible "tap for more" affordance. |
| 7 | Flexibility and Efficiency | 1/4 | Zero customization — same card shape/order for a day-one beginner and a week-40 veteran. |
| 8 | Aesthetic and Minimalist Design | 1/4 | Up to 10-11 stacked cards, no section grouping. |
| 9 | Help Recognize/Diagnose/Recover from Errors | 2/4 | No visible state for "plan didn't load," "Strava sync failed," or "you're offline." |
| 10 | Help and Documentation | 3/4 | `install-help-card` is genuinely good contextual help, placed exactly where needed. |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** Individual pieces are specific to running (mono-font pace/distance readouts, effort-zone chips, taper/build phase labeling tied to real race math, native "vos" copy). But the card stack itself — greeting, install nag, "next task" tile, countdown tile, weekly bars, a mood check-in, a status pill, two rotating tips, a help accordion — is the shape of a generic habit-tracker home feed. The one genuinely bespoke gesture (the lime halo on the next-session card) was undercut by lime repeating nine more times on the same screen.

**Deterministic scan:** The bundled detector found 60 findings across the whole app file, only one of which is location-verified inside Home (line 1163, a 5px border-radius outside the documented rounded scale on the goal-progress track — minor, advisory). 35 "dark-glow" warnings are a confirmed false positive — DESIGN.md documents the lime glow as an intentional signal, not AI-slop. Two "hairline + wide shadow" and one "overused font" (Inter) hit are also false positives against the project's own documented system. Two "pulsing dot" warnings (live GPS recording, chat typing indicator) are justified live-state indicators, not the generic pulsing-dot antipattern.

**Browser evidence:** Only the splash and login screens could be captured live (screenshot confirmed rendering correctly); Home and onboarding steps 2-5 require an authenticated Supabase session not available in this environment. This is a documented limitation, not a finding.

## Overall Impression

Home's underlying logic is more considered than it looks at first glance — the progressive-disclosure gating (load card waits 14 days, streak badge waits 2 weeks) is genuinely thoughtful, evidence-aware UI. But the surface undermines its own system: the lime accent that DESIGN.md defines as a rare, deliberate signal is spent on nearly every card, and the page has no visual grouping to help a runner who opened the app mid-run find "what do I do today" quickly. The biggest opportunity is disciplining the accent back down to the rule the project already wrote for itself.

## What's Working

- **Data-aware progressive disclosure.** `calcTrainingLoad()` deliberately returns nothing for the first 14 days of a plan (not enough data to compare yet, per its own code comments); the streak badge only appears at 2+ weeks. This is thoughtful, not just "hide if zero."
- **The mono/display type split does real work.** Every measurement (pace, distance, countdown days) renders in JetBrains Mono against Bebas Neue headings — a runner can tell "a trustworthy number" from a sentence at a glance, exactly as DESIGN.md intends.
- **`install-help-card`'s content** (OS-specific install steps, right where you'd want them) is good contextual help done right — the problem was only that it never left, not that it existed.

## Priority Issues

**[P0] The "One Signal Rule" is broken on the surface that should showcase it most — FIXED this session.**
Hi-vis lime appeared on the streak badge, the race countdown number, every training-day bar simultaneously, and the "optimal load" tag, in addition to the next-session card. Reserved full-intensity lime for exactly one element (the next-session card's highlight) plus "today" in the week strip; demoted the streak badge, race countdown, training-day bars, and the load tag to neutral tones. Verified visually via a static render.

**[P1] The race-tips card showed for users with no race — FIXED this session.**
`renderRaceTip()` never checked `state.event` before populating the card; it was unconditionally visible, including for the "health and lifestyle, no specific race" goal PRODUCT.md explicitly names as a served persona. Gated it on `state.event`, matching the pattern already used correctly for the race and goal-progress cards.

**[P1] Nine-to-eleven cards with no grouping — not fixed, needs a composition decision.**
Greeting, install banner, next-session, race card, week progress, readiness, load, daily tip, goal progress, race tips, install help all sit in one flat list. This is the screen a sweaty, one-handed runner opens mid-activity (Casey persona); a flat wall of equal-weight cards forces a full scroll just to find today's session. Recommend a visually distinct "today" cluster (next session + readiness) versus a visually quieter secondary group (tips, help) — left undone here since it's a real layout/content call better made with a live look at the authenticated screen than blind.
**Suggested command:** `/impeccable distill`

**[P2] Two permanent PWA-install touchpoints — one gating bug fixed, the redundancy itself is a design call left open.**
`install-help-card` had no visibility gating at all (persisted even in installed/standalone mode) — fixed this session, now hidden via the same `isRunningStandalone()` check the dismissible banner already used. Whether the banner and the help card should also be merged into one component is a separate, non-bug design decision left open.
**Suggested command:** `/impeccable polish`

**[P2] Readiness check-in (and every `.choice`/`.day-pill` control app-wide) was not keyboard-accessible — FIXED this session.**
These were plain `<div>`s with click-only handlers, no `role`, no `tabindex` — a keyboard-only or screen-reader user (Sam persona) could not reach them at all. Added `role="button"`/`tabindex="0"` (both statically and for the one dynamically-rendered day-pill list) plus a delegated Enter/Space handler, app-wide, not just on Home. Verified via a real dispatched keyboard event in the browser: focus + Enter correctly toggled selection.

**[P3] Post-run state on Home is emotionally flat — not fixed, a copy/content call.**
`home-session-done-block` swaps in a checkmark and three stat boxes with the same chrome as the pre-run state. Per PRODUCT.md's "speak like a coach, not a dashboard" principle, this is where a coach-voice acknowledgment of the specific session just completed would land well. Left open — needs real copy, not a mechanical fix.
**Suggested command:** `/impeccable delight`

## Persona Red Flags

**Casey (distracted, mobile, mid/post-run):** The next-session card's halo is meant to be the thumb-stopping element; with the P0 fix, it no longer competes with 9 other lime elements for that half-second of attention. The remaining risk is still the card count (P1, unresolved) — reaching training-load or tips still requires scrolling well past what Casey opened the app for.

**Jordan (confused first-timer, zero history):** Previously got race-fueling tips with no race set (fixed). Still true: nothing on the page explains *why* some cards are missing versus a friend's fuller Home screen — a first-timer has no context that this fills in as they train.

**Sam (keyboard/screen reader):** Readiness chips were a hard blocker — fixed app-wide this session. Still open: the install-help accordion toggle has no `aria-expanded` state, so a screen reader can't tell it's interactive or what state it's in.

## Minor Observations

- `home-runs-count` — Assessment A flagged this as possibly dead/orphaned code; verified false, it's used correctly in the Plan view, just outside the Home line range that was searched.
- `.tag-mixto` is reused for three semantically different things (terrain "mixed," race phase "build," and — until this session — load "optimal," now moved off it). Terrain and race-phase still share it; worth a look in a future pass.
- Daily tip and race tip both rotate on a per-day random index with no way to see a previous tip or dismiss one that isn't relevant (e.g., a rain tip in a drought).
- The greeting renders in Inter, not Bebas Neue — likely a deliberate warmth choice, worth confirming against DESIGN.md's "every section heading" rule.

## Questions to Consider

1. If lime means "the one thing to act on," should the goal-progress bar (still lime-filled, left untouched this session) count as that one thing, or does a progress-fill bar get a legitimate pass the way a badge or tag doesn't?
2. Is the race-tips/daily-tip split still worth two separate rotating-tip cards, or has it drifted into "two things saying similar things" now that one of them is properly gated?
3. Was `install-help-card` never gating on standalone mode an oversight, or was "always-available help" a deliberate choice that the fix should be reconsidered against?
