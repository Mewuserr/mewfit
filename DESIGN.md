---
name: MewFit
description: A Thai home-training coach in one installable page; today's session reads as a fight card.
colors:
  corner-red: "#FB4620"
  corner-red-ink: "#170A05"
  corner-red-muted: "#3D1608"
  ember: "#C2380F"
  ember-soft: "#FFE8DF"
  blue-corner: "#2343D8"
  blue-corner-ink: "#FFFFFF"
  blue-corner-soft: "#E6EBFF"
  rope: "#15161B"
  rope-fg: "#9EA2AC"
  canvas: "#F1F2F4"
  surface: "#FFFFFF"
  sunk: "#EBECEF"
  ink: "#121318"
  muted: "#5B5F69"
  line: "#E0E2E7"
  good: "#11774A"
  warn: "#975A00"
  bad: "#BE2E39"
  figure-prop: "#BDBFC6"
  figure-bg: "#F6F7F8"
typography:
  display:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(2rem, 9vw, 2.8rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 7.4vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title-sm:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "IBM Plex Sans Thai, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "IBM Plex Sans Thai, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1.4
  numeral:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    fontFeature: "tnum"
  numeral-live:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "3.2rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  numeral-clock:
    fontFamily: "Kanit, Leelawadee UI, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(4rem, 20vw, 8rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  xs: "10px"
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  card: "22px"
  nav: "24px"
  modal: "26px"
  hero: "28px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  gutter: "16px"
  card: "18px"
  hero: "22px"
  hero-wide: "28px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.blue-corner}"
    textColor: "{colors.blue-corner-ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "44px"
  button-go:
    backgroundColor: "{colors.corner-red}"
    textColor: "{colors.corner-red-ink}"
    rounded: "{rounded.lg}"
    padding: "14px 22px"
    height: "54px"
  button-on-hero:
    backgroundColor: "{colors.corner-red-ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "14px 22px"
    height: "54px"
  button-sm:
    rounded: "{rounded.sm}"
    padding: "7px 12px"
    height: "36px"
  chip:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-selected:
    backgroundColor: "{colors.blue-corner}"
    textColor: "{colors.blue-corner-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    height: "34px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px"
  hero-bout:
    backgroundColor: "{colors.corner-red}"
    textColor: "{colors.corner-red-ink}"
    rounded: "{rounded.hero}"
    padding: "22px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 13px"
    height: "46px"
  nav-rope:
    backgroundColor: "{colors.rope}"
    textColor: "{colors.rope-fg}"
    rounded: "{rounded.nav}"
    height: "58px"
  nav-go-button:
    backgroundColor: "{colors.corner-red}"
    textColor: "{colors.corner-red-ink}"
    size: "56px"
  kpi-tile:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  rest-timer:
    backgroundColor: "{colors.rope}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "18px"
---

# Design System: MewFit

## Overview

**Creative North Star: "The Fight Card"**

MewFit is a Muay Thai camp (ค่ายมวย) rendered as a phone app. Today's session is the bout you are about to walk into: a full-bleed corner-red block carrying the session name in heavy upright Kanit, a strip of round pills (one per move), and one dark "start bell" button. Everything else (food, plan, progress) sits one thumb-reach below on a cool canvas of white cards, and the floating nav is an ink-black rope with a raised red go button at its centre.

The camp has three corners and each owns a job. Corner-red owns today and the go action. The blue corner owns information: selection, progress bars, data marks, links and focus. Ink rope owns the moments you are mid-fight: the nav, the rest timer, the full-screen interval clock. Colour is applied as solid fields that carry content, not as decoration; the only gradient in the build is a functional fade mask at the end of the round strip. Hierarchy comes from scale contrast: reps, rest and interval clocks are set as huge tabular numerals rather than made louder with colour or chrome.

Density is phone-first (390px design width, safe down to 360px) with 16px gutters, 14px rhythm between blocks, and touch targets of at least 44px (36px for small chips and secondary buttons). Light and dark themes follow the device, with a manual override; corner-red does not change between themes.

**Identity asset.** The logo and every app icon (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `icon.svg` which wraps the PNG in a 15/64-radius clip) were generated with ChatGPT image generation on 2026-10-29 at the owner's request: a kettlebell whose handle forms a cat's ears, with negative-space eyes, nose and whiskers, off-white on orange-red #FB4620 (replaced a first leaping-cat mark the owner rejected as too close to Puma). They were then resized into these sizes locally. The icon's orange-red is the source of corner-red, and `theme-color` and the manifest `theme_color` both use it. In the shipped page the icon appears only as the 72px mark in the onboarding hero (10px radius at 34px). The top bar carries the "Mew**Fit**" wordmark in Kanit 800, with "Fit" in corner-red.

**Key Characteristics:**
- Full-bleed corner-red "today" block on phones, its bottom corners rounded 30px, flowing out of a red top bar.
- Three-corner colour roles: red = today and go, blue = information, ink = in-session.
- Kanit upright for display, buttons and all numerals (tabular); IBM Plex Sans Thai for reading.
- Flat colour fields with one soft ambient shadow; no decorative gradients.
- Animated stick-figure demos tinted by the current surface (ink on canvas, near-black on red, white on rope).

## Colors

Three solid corners on a cool grey canvas: an orange-red that is the logo's own colour, a deep signal blue, and near-black rope. A semantic trio handles status.

### Primary
- **Corner Red** (corner-red): the logo's orange-red. Fills the today hero, the today-view top bar and safe-area strip, the raised nav train button, the rest bar, the onboarding "next" button, the HIIT work-phase label and progress, the active nav icon, the today border in the week strip, and the "Fit" in the wordmark. The same in light and dark.
- **Corner Red Ink** (corner-red-ink): text and icons on corner-red. On the hero it also becomes the solid fill of the start button, with white text.
- **Corner Red Muted** (corner-red-muted): secondary text on corner-red (meta lines, descriptions, the rest bar's caption). Contrast on corner-red is about 4.6:1; don't lighten it.
- **Ember** (ember) / **Ember Soft** (ember-soft): the text-safe version of red, for small marks. Hot chips, the numbered feature tiles in onboarding, the dumbbell and dashed props in figures, the sleep dot on the timeline, and the third daily ring. Dark mode lifts ember to #FF8259 on #3B1A0F.

### Secondary
- **Blue Corner** (blue-corner) with **Blue Corner Ink** and **Blue Corner Soft**: the information corner. Primary buttons outside the hero, checked segments and options, pressed chips, the current set, ladder level, progress bars, onboarding progress, links, `summary` toggles, text selection, caret and every focus ring. Soft blue tints training days, selected options, banners, OK notes and list hover. Dark mode uses #8FA3FF on #0B1033 ink with #1E2552 soft.

### Neutral
- **Canvas** (canvas): page ground, and the sticky top bar's 86% frosted glass.
- **Surface** (surface): cards, tool tiles, tips, inputs, the default button, modals.
- **Sunk** (sunk): recessed fills for chips, KPI tiles, target tiles, week days, bar tracks and the "why" boxes in onboarding.
- **Ink** (ink): text, and the toast background (inverted).
- **Muted** (muted): secondary text, inactive top tabs, axis labels.
- **Line** (line): input strokes, hairline dividers between list rows, the default button border.
- **Rope** (rope) / **Rope Fg** (rope-fg): the floating nav, rest timer card and HIIT screen; rope-fg is their secondary text and inactive nav labels. Dark mode rope is pure #000000.
- **Figure Prop** / **Figure Bg**: stick-figure props and ground line, and the panel behind figure demos.

### Semantic
- **Good** (good) for completed sets, food dots, water glasses and verdicts; **Warn** (warn) for over-target bars and caution lines; **Bad** (bad) for the danger button and the "ความเชื่อ:" myth prefix. Dark: #4FCB8E / #EAAA4A / #F2737C.

### Named Rules
**The Corner-Red Rule.** Corner-red marks only today's bout and the go action (start, next, the raised train button, the running rest bar, the today marker). It is never used for information, selection or decoration. If it isn't "today" or "go", it isn't red.

**The Blue Corner Rule.** Every selected, in-progress, measured or focused state is blue. Selection never borrows red.

**The Ink Ropes Rule.** Rope black is the in-fight surface: the floating nav, the rest timer and the full-screen interval clock. On rope, the only accent is corner-red.

## Typography

**Display Font:** Kanit (with Leelawadee UI, Noto Sans Thai, system-ui)
**Body Font:** IBM Plex Sans Thai (with Leelawadee UI, Noto Sans Thai, system-ui)
**Numeral Font:** Kanit with tabular figures (the same family as display)

**Character:** Kanit set upright and heavy (700-800) gives fight-poster lettering for headings, session names, buttons and every number. Plex Sans Thai is the calm reading voice for coaching copy and instructions.

### Hierarchy
- **Display** (800, clamp(2rem, 9vw, 2.8rem), 1.08): the session or day name inside the corner-red hero.
- **Headline** (800, clamp(1.8rem, 7.4vw, 2.5rem), 1.2): the page `h1` on every other view. Onboarding uses 700 at clamp(1.9rem, 7vw, 2.6rem) with -0.02em tracking.
- **Title** (700, 1.25rem, 1.2): card and section `h2`. Player move names scale to clamp(1.4rem, 5vw, 1.9rem).
- **Title Small** (600, 1.05rem, 1.2): `h3`, option titles and buttons (buttons use Kanit 600 at inherited size; big buttons 1.06rem).
- **Body** (400, 15.5px, 1.65): all reading text, capped at 52-62ch inside heroes and coach notes. Small text is 0.86rem.
- **Label** (500-600, 0.72-0.92rem): chips (0.8rem 600), nav labels (0.72rem 500), field labels (0.88rem 500), table heads (0.78rem 600, muted). Never uppercase; Thai has no case.
- **Numerals** (Kanit 600, tabular): metric values, legends, times, KPIs (1.55rem 700). **Live numerals** step up by scale: the rep stepper is 800 at 3.2rem, the rest timer 800 at 4.2rem, the HIIT clock 800 at clamp(4rem, 20vw, 8rem).

### Named Rules
**The Fight-Poster Numeral Rule.** Every number a user counts, logs or watches is Kanit with tabular figures. The number you are acting on now is the largest thing on screen (3.2rem or more, weight 800).

**The Two Voices Rule.** Kanit speaks (headings, buttons, numbers); Plex explains (sentences). Don't set paragraphs in Kanit or headings in Plex.

## Layout

One centred column with a 1000px max width and 16px gutters (padding respects `env(safe-area-inset-*)`). Views are vertical flex stacks with a 14px gap. Cards stack singly on phones and become 2- or 3-up grids from 740px. KPI tiles auto-fit at a 118px minimum, and form fields auto-fit at 140px. The tool grid is 3-up, falling to 2-up below 420px with the last tile spanning both columns.

On phones the today hero breaks out of the gutters (-16px margins) to sit edge to edge under the red top bar, with only its bottom corners rounded (30px). From 640px the hero becomes a 1.25fr / 1fr two-column with the figure beside the text. Below that, the figure floats top-right at 148px and 90% opacity behind the text, and the text gets 110px of right padding.

Navigation is a floating rope bar fixed 10px above the bottom safe area, 12px from the sides, max 520px, with five equal columns. Main content reserves 116px of bottom padding for it. At 880px the bar is hidden and pill tabs appear in the top bar. The onboarding flow is a 620px column with a sticky footer action bar.

Breakpoints: 420px (tool grid), 640px (hero and option grids), 740px (card grids), 880px (desktop nav).

Rhythm: 4 / 6 / 8 / 10 / 14 / 18px. 8px between chips and inline rows, 14px between cards and inside cards, 18px card padding, 22px hero padding (28px from 640px).

## Elevation & Depth

Mostly flat colour, with one soft ambient lift. Cards, tool tiles, tips and the active top tab share a single two-layer shadow. Overlays are the only things that cast real shadows. In dark mode the ambient shadow becomes a deep, near-invisible drop and cards gain a 1px hairline (#24262D) to carry the edge instead.

### Shadow Vocabulary
- **Ambient** (`box-shadow: 0 1px 2px rgba(18,19,24,.05), 0 10px 26px -14px rgba(18,19,24,.18)`): cards, tool tiles, tips, active top tab.
- **Hero lift** (`box-shadow: 0 16px 32px -22px rgba(18,19,24,.35)`): the corner-red hero when inset as a card. Removed when it runs full-bleed.
- **Floating rope** (`box-shadow: 0 14px 34px -14px rgba(0,0,0,.55)`): the bottom nav. The rest bar uses `0 14px 30px -14px rgba(0,0,0,.5)`.
- **Raised go button** (`box-shadow: 0 0 0 5px var(--bg), 0 10px 18px -10px rgba(0,0,0,.45)`): the centre train button. A 5px canvas-coloured ring cuts it out of the rope bar.

### Named Rules
**The One Lift Rule.** Resting surfaces share one ambient shadow. Deeper shadows belong only to things that float over content (nav, rest bar, raised button). The modal scrim blurs instead of shadowing.

## Shapes

Generously rounded, never sharp. Radius grows with the size of the surface: 10px for icon tiles and the logo, 12px for set dots, list rows and small tiles, 14px for buttons, inputs, notes and week days, 16px for large buttons, KPI tiles and figure panels, 18-20px for options, tool tiles, tips and the rest bar, 22px for cards and the rest timer, 24px for the nav bar, 26px for modals, and 28px for the hero (30px on its full-bleed bottom edge). Chips, segments, round pills, top tabs and progress bars are full pills (999px), and round numbers in the round strip and legend dots are circles. Borders are 1px hairlines in line colour. 1.5px strokes mark a selectable state (option cards, week days, set dots, which are dashed until done).

## Components

### Buttons
Upright Kanit labels on soft 14px slabs, with a press that shrinks them slightly.
- **Shape:** 14px radius, minimum 44px tall. Small is 11px / 36px, big is 16px / 54px. `wide` is full width.
- **Default:** surface fill, 1px line border, ink text. Hover darkens the border to muted.
- **Primary:** blue-corner fill and border, white text. Hover brightens it to 1.08.
- **Go:** corner-red fill with corner-red-ink text. Used for "start setup", the onboarding next button, and the primary action on rope surfaces (rest timer, HIIT).
- **On the hero:** buttons go transparent with a 22% ink border. The primary and go buttons become a solid corner-red-ink slab with white text: the start bell.
- **Danger:** transparent with bad-colour text and border. **Ghost:** transparent default. **Disabled:** 40% opacity.
- **Press:** `scale(.97)` over 0.12s. Focus uses the global 2px blue outline offset 2px.

### Chips
- **Style:** full pill, 0.8rem 600, sunk fill and muted text. The `acc` variant is soft blue with ink text; `hot` is ember-soft with ember text. The good, warn and bad variants recolour only the text.
- **State:** a button chip is 34px tall. When pressed it fills blue-corner with white text.

### Cards / Containers
- **Corner Style:** 22px.
- **Background:** surface, with sunk tiles inside for KPIs, targets and "why" boxes.
- **Shadow Strategy:** Ambient (see Elevation). Dark mode adds the hairline.
- **Border:** transparent in light mode, #24262D in dark.
- **Internal Padding:** 18px, with a 14px column gap.

### Inputs / Fields
- **Style:** full width, 1px line stroke, surface fill, 14px radius, 11px × 13px padding, 46px minimum height, and a 16px font so iOS never zooms. Big-number inputs use Kanit 600 at 1.25rem.
- **Segments and options:** segments are 40px pills that fill blue when checked. Option cards have 18px radius and a 1.5px line border, turning blue-bordered on soft blue when checked.
- **Focus:** 2px blue-corner outline offset 2px (also drawn on the visible span when the native input is hidden).

### Navigation
- **Phone:** a floating rope bar with 24px radius and five columns. Each column is a 23px stroke icon over a 0.72rem label in rope-fg. The active label turns white and its icon corner-red. The centre "train" item is a 56px corner-red square (19px radius) raised 28px above the bar, with a dark icon, a canvas cut-out ring, and a press scale of 0.94.
- **Desktop (880px and up):** pill tabs in the frosted top bar. Muted text darkens to ink on hover; the active tab gets a surface fill and the ambient shadow.
- **Top bar:** sticky, 56px, frosted canvas glass (saturate 1.4, blur 16px). On the today view it turns solid corner-red with corner-red-ink text, so the hero reads as one continuous block.

### The Bout (signature)
The today hero: corner-red field and corner-red-ink text. It carries a meta line, the session name in Display, an "x moves · y min" line, the **round strip**, the start bell button, and a demo figure tinted near-black. The round strip is a horizontally scrolling row of pills, each on a 24% white wash with a 26px circle numbered in Kanit (corner-red-ink fill, corner-red numeral). The row scroll-snaps and fades at its right edge.

### Live counters (signature)
The rep stepper is a 64px / 1fr / 64px grid with a 3.2rem 800 numeral. Set dots are 40px squares, dashed while pending, solid good when done, and solid blue for the current set. The rest timer is a rope card with a 4.2rem 800 countdown. The HIIT overlay is full-screen rope with a clock up to 8rem and a phase label that turns corner-red during work. A corner-red rest bar floats above the nav while you rest away from the player.

### Week strip and rings
The week strip is seven sunk tiles: soft blue on training days, solid blue when done, and a 1.5px corner-red border on today. The daily rings are three concentric SVG rings (blue-corner, good, ember) over a sunk track, with a Kanit tabular legend.

## Do's and Don'ts

### Do:
- **Do** keep corner-red (#FB4620) for today's bout and the go action only; route selection, progress and data through blue-corner.
- **Do** set every counted or logged number in Kanit with tabular figures, and make the live number the largest element (3.2rem or more, weight 800).
- **Do** let colour fields carry content (the red bout, the rope rest timer) instead of adding chrome to secondary actions.
- **Do** keep touch targets at 44px or more (36px for small chips and buttons) and form inputs at 16px text.
- **Do** keep the figure tinted by its surface by overriding `--fig` and `--prop` rather than adding new figure colours.
- **Do** put every theme-dependent colour on the `:root` tokens so the dark-mode override covers it.

### Don't:
- **Don't** use gradients as decoration. The only gradient in the system is the fade mask at the end of the round strip.
- **Don't** put red on informational or selected states, or blue on the today/go action.
- **Don't** set body copy in Kanit or headings in Plex Sans Thai.
- **Don't** add deeper shadows to resting cards; only floating elements cast real shadows.
- **Don't** recolour corner-red for dark mode; the brand red is the same in both themes.
