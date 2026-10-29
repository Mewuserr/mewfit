# MewFit — Product

> Facts marked *(inferred)* were inferred from the code and README because the owner delegated design decisions ("คุณตัดสินใจได้เลย"). Confirm or correct them.

## What it is
A free single-file web app (installable PWA) that acts as a personal trainer for working out at home. All data stays in the user's own browser; no account, no server.

## Who uses it
- Thai adults who want to get fit at home with little or no equipment *(inferred)*.
- Beginners to intermediates; most open it on a phone, often propped on the floor during a session or held in one hand while logging food *(inferred)*.
- Language: Thai only.

## What it does (product truth — must be preserved)
- 7-step onboarding: PAR-Q+ health screening, body data, goal, daily activity, training setup, fitness test, schedule.
- Auto-progressing home workout plan: 62 moves, each with ladder levels and an animated stick-figure demo; set/rep logging with rest timer; warm-up, stretching and a 7-minute circuit timer with Thai voice prompts.
- Thai meal plan by calorie and protein target; food log with Thai food search; water tracking.
- Daily life schedule (wake, meals, work, training, sleep).
- Weight and body-measurement tracking with a 7-day trend line and weekly coaching feedback.
- Research-backed tips and myth-busting ("ความรู้"), with sources.

## Brand
- Name: MewFit; coach persona "โค้ชมิว". Name comes from the owner's nickname Mew.
- Tone: friendly, encouraging, plain Thai, evidence-based, never preachy.
- Not medical advice (stated in app).

## Success
Someone opens it on their phone, immediately sees what to do today, starts a workout in one tap, and comes back daily *(inferred)*.

## Constraints
- One `index.html`, no build step, no framework; deployed on Cloudflare Workers static assets.
- Must work offline (service worker) and on small phones (360px wide).
- Owner wants: simple, beautiful, easy to use, modern; mobile first.
