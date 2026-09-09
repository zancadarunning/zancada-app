# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Runners in two overlapping groups: people just starting to run who need structure and encouragement, and existing runners who want a real training plan (not just activity tracking). Spanish-speaking market primarily (Argentine "vos" voice in the UI copy — "Tocá un día", "Pedí un ajuste"), with the app also localized into en, pt, fr, it, de.

## Product Purpose

Zancada is a running coach: personalized training plans, race/run tracking, and an AI coach in one app, so a runner doesn't need to stitch together a tracking app, a static training plan, and a human coach separately.

## Positioning

The AI coach that adapts the plan is the core differentiator versus Strava, Nike Run Club, or Runna — ongoing conversational coaching that adjusts the plan based on how training is actually going, not a one-time static plan or pure activity logging.

## Operating Context

- Installed as a PWA (standalone display, portrait), also wrapped for Android/iOS app stores with native home-screen widgets (`mobile/widget-setup`).
- Primary navigation: Inicio (Home), Plan, Correr (Run), Historial (History), Coach, Perfil (Profile).
- Backend on Vercel (serverless functions in `api/`, cron jobs) with Supabase (Postgres + realtime) as the data layer.
- Strava is the current run-data source: OAuth + a 15-minute polling cron (`api/sync-strava.js`) merges new activities atomically via a Postgres RPC (`sql/merge_strava_runs.sql`) to avoid race conditions. Garmin support (webhook/push-based, different architecture from Strava's polling) is planned but not yet built (see `docs/garmin-integration-plan.md`).
- Weather via Open-Meteo and route maps via CartoDB basemaps are integrated (visible in the CSP `connect-src`/`img-src`).
- Push notifications (web-push) drive training reminders (`api/send-reminders.js`, hourly cron).

## Capabilities and Constraints

- Personalized weekly training plans that the user can ask the AI coach to adjust.
- Run/race tracking and history, synced from Strava today.
- AI coach chat (`api/chat.js`).
- Account deletion, push reminders, Strava connect/disconnect/resync flows.
- No monetization currently implemented — no premium tier, paywall, or pricing found in the codebase; treat the product as free unless told otherwise.
- Both `vercel.json` and `netlify.toml` exist in the repo; Vercel is the active deploy target (crons, security headers, and CSP all live in `vercel.json`) — treat Netlify config as legacy/unused unless the user says otherwise.

## Brand Commitments

- Name: Zancada ("stride" in Spanish). Tagline: "Tu coach de running."
- Voice: informal Argentine Spanish (voseo) — "Tocá", "Pedí", casual and direct, not corporate.
- Existing app icons (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`) and a dark theme color (`#0A0A0A`/`#121415`) are established brand assets.
- Several prior home-screen concepts exist in the repo root (`dark_home.png`, `light_home.png`, `v2_*`, `v3_*`, `v4_*`) — these are design history/exploration, not a confirmed current DESIGN.md; treat as evidence of direction, not a locked system.

## Evidence on Hand

Live in production with real users (confirmed by the user). No testimonials, user counts, or press are present in the codebase — do not fabricate any; if evidence like this is needed for a surface, ask or mark it explicitly as a placeholder.

## Product Principles

- One coherent coach, not a bundle of disconnected tools — plan, tracking, and chat should feel like one relationship, not three features.
- The plan is alive, not a PDF — it should visibly respond to what the runner actually did (via Strava data) and to what they tell the coach.
- Speak to the runner like a person, not a dashboard — casual, direct, Argentine voseo tone throughout, in every locale's equivalent register.
- Serve beginners and committed runners without forking the product — the same coach should feel right whether someone is on week one or training for a marathon.
- Free today — don't design monetization gates or pricing UI that don't exist yet.
