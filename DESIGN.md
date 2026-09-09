---
name: Zancada
description: Tu coach de running — planes personalizados, seguimiento de carreras y un coach con IA.
colors:
  asphalt: "#0A0A0A"
  asphalt-2: "#18181B"
  asphalt-3: "#202023"
  asphalt-4: "#2C2C30"
  chalk: "#EDEFEF"
  mist: "#8B9296"
  mist-dim: "#5C6366"
  hivis: "#D6FF3F"
  hivis-dim: "rgba(214,255,63,.14)"
  ink: "#121415"
  clay: "#C06A2E"
  clay-dim: "rgba(192,106,46,.16)"
  danger: "#FF3B30"
  danger-dim: "rgba(255,59,48,.16)"
  zone1: "#5B9BFF"
  zone2: "#4ADE80"
  zone3: "#FACC15"
  zone4: "#FB923C"
  zone5: "#FF6B5D"
typography:
  display:
    fontFamily: "'Bebas Neue', sans-serif"
    fontSize: "22px–60px (contextual: 22px section headers, 25–32px stat highlights, 60px splash wordmark)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "0.02em"
  body:
    fontFamily: "'Inter', -apple-system, sans-serif"
    fontSize: "14px–16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter', -apple-system, sans-serif"
    fontSize: "10.5px–12.5px"
    fontWeight: 600
    letterSpacing: "0.04em–0.09em"
  mono:
    fontFamily: "'JetBrains Mono', monospace"
    fontWeight: 400
rounded:
  sm: "18px"
  md: "26px"
  pill: "999px"
spacing:
  card-padding: "22px"
  field-padding: "13px 15px"
  gap-sm: "8px"
  gap-md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.hivis}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "15px 22px"
  button-outline:
    backgroundColor: "{colors.asphalt-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.pill}"
    padding: "15px 22px"
  card:
    backgroundColor: "{colors.asphalt-2}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "22px"
  chip-active:
    backgroundColor: "{colors.hivis-dim}"
    textColor: "{colors.hivis}"
    rounded: "{rounded.sm}"
  chip-inactive:
    backgroundColor: "{colors.asphalt-2}"
    textColor: "{colors.mist}"
    rounded: "{rounded.sm}"
---

# Design System: Zancada

## Overview

**Creative North Star: "La Pista Nocturna" (The Night Track)**

Zancada is built for running before the sun's up or after it's down — the hours when a runner's own visibility is the thing keeping them safe. The interface is genuinely dark, not a "dark mode" toggle bolted onto a light design: near-black carbon (`#0A0A0A`) is the only background this app has, by deliberate, confirmed decision (a light theme existed and was removed at the user's request). Out of that darkness, one color does real work the way hi-vis gear does in real life: a lime-green accent (`#D6FF3F`) that exists to be seen, not to decorate. It marks the thing that's active, the button that matters, the number that's live right now — everywhere else, the screen stays quiet.

Surfaces separate from each other by luminosity, not by borders. Cards sit a few steps lighter than the page behind them; hairline strokes exist only as a faint finishing touch, never as the primary way two surfaces tell each other apart. Numbers — pace, distance, time, splits, percentages — always render in a monospaced face, so a runner glancing down mid-stride reads a tabular, precise, GPS-watch kind of number, visually distinct from the conversational prose around it. Everything else about the shape language is built for a hand that might be tired, sweaty, or moving: big pill buttons, generous 26px card corners, and a tab bar that floats like a HUD, its center pinned by a raised circular "Correr" button that has to be visibly gravity-defying to earn the interruption of stopping your day to start a run.

**Key Characteristics:**
- Single, deliberate dark theme — carbon-black ground, no light variant, ever.
- Depth from luminosity layering, not from borders — hairlines are a whisper, not the boundary.
- One accent color, hi-vis lime, used with the same restraint and purpose as real reflective gear.
- Every number on screen renders in JetBrains Mono; every heading renders in Bebas Neue.
- Large, confident, pill-and-round-corner shapes built for a runner's hand, not a mouse pointer.

## Colors

A near-monochrome carbon scale carries almost the entire interface; a single hi-vis accent is spent deliberately, plus a small semantic set for terrain and effort.

### Primary
- **Hi-Vis Lime** (`#D6FF3F`): the one color that means "this is active / this is the one action." Primary CTAs, active nav/tab state, active chips and toggles, focus rings, the live-progress fill, the splash wordmark's accent letter. Always paired with `--ink` (`#121415`) as its text/icon color when used as a fill, never with white.
- **Hi-Vis Dim** (`rgba(214,255,63,.14)`): the same color as a translucent wash — active chip backgrounds, success toasts, the subtle radial glow behind the app shell.
- **Hi-Vis Glow** (`rgba(214,255,63,.32)`): used only as a `box-shadow` color, not a fill — the literal glow under the primary button and active segmented control, echoing reflective material catching light.

### Secondary
- **Clay** (`#C06A2E`): a burnt-orange/terracotta reserved for trail/off-road context (the "trail" terrain tag, load-caution warnings) — the app's other outdoor-surface color, distinct from the safety-signal lime.

### Neutral
- **Asphalt** (`#0A0A0A`): the base page background. The darkest tone in the system; nothing sits darker than this.
- **Asphalt Raised** (`#18181B`): card and primary surface background — one deliberate step up from Asphalt so cards read as elevated by contrast alone.
- **Asphalt Recessed** (`#202023`): inset/interactive surfaces sitting *within* a card — segmented-control tracks, stat boxes, the history-map placeholder.
- **Asphalt Stroke** (`#2C2C30`): input borders and other structural strokes where a border is actually load-bearing (form fields), as opposed to the near-invisible hairline.
- **Chalk** (`#EDEFEF`): primary text and icon color on dark surfaces.
- **Mist** (`#8B9296`): secondary text — labels, captions, muted body copy.
- **Mist Dim** (`#5C6366`): tertiary/disabled text, placeholder text, the least emphasis available.
- **Overlay Hairline** (`rgba(255,255,255,.045)`): the only border most cards and buttons get — intentionally almost invisible; it's a finishing detail, not the mechanism that separates surfaces.

### Effort Zones (semantic, not brand)
- **Zone 1** (`#5B9BFF`, blue) → **Zone 5** (`#FF6B5D`, coral-red), stepping through green (`#4ADE80`), yellow (`#FACC15`), and orange (`#FB923C`) — a fixed, saturated five-step scale for heart-rate/pace training zones, cool-to-hot mapping easy effort to max effort. Each zone also has a `-bg` translucent variant (`.16` alpha at rest, `.13` alpha in a live/active context) for its badge background. This scale is functional data-encoding, not brand expression — never repurpose these five hues for anything else.

### Named Rules
**The Luminosity-Not-Line Rule.** Two adjacent surfaces separate because one is measurably lighter than the other, not because a hard border was drawn between them. Reach for a lighter Asphalt step before reaching for a stroke.

**The One Signal Rule.** Hi-Vis lime means "active" or "this is the one thing to act on" — never used as a decorative accent, never applied to more than the thing currently earning attention. If everything is lime, nothing is. This governs status badges, tags, and fills (a card, a chip, a bar) — anywhere lime stands in for "this is the answer." It does not govern the leading icon inside a row-nav card (Perfil's list rows, and the equivalent icon slot elsewhere): every such icon is tinted Hi-Vis-Text consistently, on every screen, as a confirmed identity choice, not a signal — treat that tint as a fixed property of the icon slot itself, the same way its size and stroke weight are fixed, not as an instance of "the one thing to act on."

## Typography

**Display Font:** Bebas Neue (with sans-serif fallback)
**Body Font:** Inter (with -apple-system, sans-serif fallback)
**Label/Mono Font:** JetBrains Mono

**Character:** A tall, condensed, all-caps poster face for anything that announces itself (headings, big stats, the wordmark) against a workmanlike, highly legible grotesque for everything you actually read, with a tabular mono face reserved strictly for numbers — the pairing reads like a race bib next to a watch face.

### Hierarchy
- **Display** (Bebas Neue, 400, 22–60px contextual, line-height 0.9, letter-spacing 0.02em): every section `<h2>`, the splash wordmark, and standout stat highlights (e.g. days-to-race countdown). Always uppercase-reading by nature of the typeface itself, not text-transform.
- **Body** (Inter, 400, 14–16px, line-height 1.5): running copy, descriptions, chat messages, form values.
- **Label** (Inter, 600–700, 10.5–12.5px, letter-spacing 0.04–0.09em, often uppercase): field labels, card eyebrow headers (`.card h3`), tag text.
- **Mono** (JetBrains Mono, tabular figures): every metric on screen — pace, distance, elapsed time, dates, percentages, the live run timer. Never used for prose.

### Named Rules
**The Data-Is-Mono Rule.** Any value that is a measurement — distance, time, pace, percent, a date — renders in JetBrains Mono. This is how a runner tells "a number I can trust" from "a sentence," at a glance, mid-stride.

## Layout

Single-column, mobile-first, capped at `max-width: 480px` and centered — the app never tries to become a desktop layout, it stays phone-shaped even in a wide viewport. Content view padding is `4px 20px 20px`. Cards stack vertically with `16px` margin between them and `22px` internal padding. A sticky `header.top` (blurred, translucent) pins to the top of the scroll; a floating pill-shaped `nav.tabbar` pins to the bottom via `position: sticky`, inset from the screen edges by 14px, so it reads as a HUD element rather than an edge-to-edge bar. Overlays and bottom sheets are full-screen panels (not true modals) that slide/fade in from the same 480px column.

## Elevation & Depth

Depth comes from two complementary systems working together, not shadows alone: a **luminosity ladder** (Asphalt → Asphalt Raised → Asphalt Recessed) does most of the work of telling surfaces apart, while soft, ambient (never hard-edged) shadows add a second, subtler layer of lift for things that float above the page — cards, the tab bar, modals, and confirm sheets.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 8px 22px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.03)`): the default lift for cards and chips — a soft ambient shadow plus a 1px inner top highlight that reads as a faint sheen, not a border.
- **Large / Modal** (`box-shadow: 0 16px 48px rgba(0,0,0,.55)`): deeper, more diffuse — reserved for things that visually float above the whole page: confirm dialogs, sheet overlays.
- **Hi-Vis Glow** (`box-shadow: 0 10px 24px rgba(214,255,63,.32)`, tighter `0 4px 14px` on smaller elements): a colored glow instead of a neutral shadow, used only under lime-filled elements (primary button, active segmented choice) — depth and "this is lit up" read as the same gesture.

### Named Rules
**The Ambient-Only Rule.** Shadows in this system are soft and diffuse (`rgba(0,0,0,.4–.55)` blurred), never sharp or directional. A shadow signals "this surface is above the page," not "light is coming from a specific angle."

## Shapes

Two radius steps, both generous, plus a hard pill for anything you tap to act: `18px` (`--radius-sm`) for inputs, chips, tags, and secondary surfaces; `26px` (`--radius`) for cards, confirm dialogs, and the splash panel; `999px` for every button, the tab bar itself, switches, and the language pills. Corners get rounder as an element gets more "actionable" — a card corner is generous, a button corner is total. No sharp (0px) corners appear anywhere in the system.

## Components

### Buttons
- **Shape:** full pill (`border-radius: 999px`), full-width by default, `15px 22px` padding.
- **Primary:** Hi-Vis fill, Ink text, Hi-Vis Glow shadow; scales to `0.98` on press with a tightened glow — feels like a press, not a color swap.
- **Outline:** Asphalt Raised background, Chalk text, the near-invisible hairline border, Card shadow; scales to `0.97` on press with a flash of the `--press` overlay.
- **Danger:** Danger-Dim background, Danger text — no border, kept visually quiet relative to Primary so it doesn't compete for attention.
- **Disabled:** Asphalt Raised background, Mist-Dim text, hairline-strength stroke, `cursor: not-allowed` — visually recedes rather than grays out harshly.

### Chips / Tags
- **Choice chips** (segmented pickers, filters): Asphalt Raised background, Mist text, hairline border at rest; Hi-Vis Dim background + Hi-Vis text + Hi-Vis Glow when active. Segmented variants (2–3 mutually exclusive options in one pill-shaped track) drop the individual borders and shift the active state to a solid Hi-Vis fill instead of a tint.
- **Semantic tags** (terrain, load risk): small pill, uppercase label type — Asphalt Stroke/Chalk for neutral (asfalto), Clay-Dim/Clay for trail and load-caution, Danger-Dim/Danger for load-risk, a dashed hairline "soon" variant for unavailable features.

### Cards / Containers
- **Corner Style:** 26px (`--radius`).
- **Background:** Asphalt Raised, no alpha/translucency (cards sit above swipe-to-delete action backgrounds, so a flat opaque fill is required, not just visual preference).
- **Shadow Strategy:** Card shadow (see Elevation & Depth) plus the 1px inner top highlight.
- **Border:** Overlay Hairline only.
- **Internal Padding:** 22px; card eyebrow headers (`h3`) are 11.5px uppercase Label type with 12px bottom margin before content.

### Inputs / Fields
- **Style:** Asphalt Raised background, 1.5px Asphalt Stroke border, 18px radius, 13px/15px padding, 16px font size (kept at 16px specifically to avoid iOS Safari's auto-zoom-on-focus).
- **Focus:** border shifts to Hi-Vis, plus a `0 0 0 3px` Hi-Vis-Dim ring — the same accent-as-signal language as everywhere else in the system.
- **Error:** Danger-colored helper text beneath the field; the field chrome itself does not change state.

### Navigation (tab bar)
- **Style:** a floating pill, sticky to the bottom with a 14px inset on every side, translucent blurred background (`backdrop-filter: blur`) over the Tabbar-Bg color — reads as glass, not a flat bar.
- **States:** inactive icons/labels in Mist-Dim; the active tab's icon gets a Hi-Vis-Dim rounded backdrop and Hi-Vis text; press scales the button to `0.9`.
- **Signature Component — the raised primary action:** the center "Correr" (Run) tab breaks the row — it's a 56px Hi-Vis-filled circle that hangs 24px above the rest of the bar, with its own Hi-Vis Glow shadow that intensifies when active. It's the one nav item that behaves like a floating action button, not a tab, because starting a run is the one action this app exists to make effortless.

## Do's and Don'ts

### Do:
- **Do** separate surfaces by moving up the Asphalt luminosity ladder before adding a stroke.
- **Do** render every measurement (pace, distance, time, date, percent) in JetBrains Mono.
- **Do** use Bebas Neue for every section heading and standout number — it's the system's only display voice.
- **Do** keep the primary "Correr" tab visually distinct (raised, circular, glowing) from the other four flat tab-bar items.
- **Do** pair a Hi-Vis fill with Ink (`#121415`) text/icons, never white or Chalk.
- **Do** keep shadows soft and ambient (large blur, no offset drama); depth should feel like the surface is lit, not like it's casting a directional shadow.

### Don't:
- **Don't** reintroduce a light theme or a theme toggle — this was built, shipped, and deliberately removed at the user's request; the product is dark-only by decision, not by default.
- **Don't** use hard borders as the primary way two surfaces read as separate; the hairline (`rgba(255,255,255,.045)`) is a finishing touch, not a boundary.
- **Don't** spend the Hi-Vis accent on more than one "this is the active/primary thing" per screen — it loses its meaning (and its resemblance to real hi-vis gear) the moment it's decorative.
- **Don't** repurpose the five effort-zone colors (Zone 1–5) for anything other than heart-rate/pace zone data — they're a fixed semantic scale, not a brand palette to draw from.
- **Don't** use a sharp 0px corner anywhere; the system's smallest radius is 18px.
- **Don't** put prose or labels in JetBrains Mono, and don't put a measurement in Inter — the mono/sans split is how the interface tells data from language.
