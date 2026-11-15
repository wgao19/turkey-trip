# Design handoff: the day view restyle

For engineers picking this up and for the pull request that brings it into the repo. The artifact is the reference implementation. Open it, scroll, resize, switch theme. This file explains what you are looking at and why, so you can keep the intent when you change things. `docs/DESIGN.md` still tells you where each kind of change lives.

Design prototype with the original three directions and the mobile and desktop boards: the Turkey Trip design canvas (https://claude.ai/artifact/CjyXDfughbZBd53qpnrxE4).

## What changed

1. **A new look.** Archivo (display and interface, with its width axis) and Literata (story text). A marbled banner in six colours. Warm paper and deep ink surfaces, with an ink-and-saffron dark theme. Square corners.
2. **The By day view is now one scroll through the trip.** Each day opens with a coloured panel and an arched cover photo, then one full-height panel per stop. The map and stop list stay fixed beside it. Day tabs, map pins, the stop list and Previous / Next all move the same scroll.
3. **The story reads as writing.** The summary is the italic lead line. The old "Highlights" list is set as serif paragraphs under it. The collapsible on By place cards is now called "The story".
4. **Auto, Light and Dark.** Follows the device by default, with a switch in the banner. The choice is remembered in the browser (`localStorage`, key `turkey-trip-theme`).
5. **Smaller things.** Labels are sentence case, not uppercase mono. Day 1's title typo ("Sutanahmet") is fixed in `content/site.json`.

By place keeps its card grid, filters, badges and notes; it only picks up the new tokens, type and story styling.

## Files

| File | Change |
| --- | --- |
| `css/tokens.css` | New palette, fonts, sizes and tokens (list below). `:root`, the dark media block and `[data-theme="dark"]` keep their structure, so `tools/site.py` still adds categories. |
| `css/page.css` | Sections 12 to 15 are new: topbar, day view, stories, display type. Older sections edited lightly. |
| `css/daymap.css` | Rewritten for the new map (pin states, live map). |
| `js/dayview.js` | New. Builds the By day view and tracks scroll. |
| `js/daymap.js` | Rewritten. `DayMap.create()` replaces `DayMap.markup()` and `mount()`. |
| `js/app.js` | Day view hands off to `DayView`; theme switch; brand slots; `The story` label. |
| `index.html` | Banner, marbling filter, theme bootstrap, new fonts, two scripts. The `views` switch moved from the collection bar into the banner. |
| `content/site.json` | One typo fixed. |
| `docs/DESIGN.md` | Updated for all of the above. |

No content shape changed, so `tools/site.py`, `AGENTS.md` and the editor keep working.

## Design decisions to keep

- **The map and stop list never scroll with the story.** The stage (`.dayview__stage`) is the only scrolling element. The side panel is a fixed-height sibling; only its stop list scrolls, inside itself.
- **The arch is for day openers only.** It marks a day. On every photo it was too repetitive. It is a `clip-path` polygon in `--arch`; do not apply it to cards or gallery images.
- **One banner colour per day.** `--day-1-*` to `--day-5-*`, repeating. Pairs are chosen for contrast (white or ink text). If you add colours, check text contrast.
- **The marbling is generated, not an image.** Stripes (`repeating-linear-gradient`) warped by the SVG filter `#ebru` in `index.html`. It is decoration: `aria-hidden`, never behind text without a plate. Keep the filter id.
- **Serif for the story, Archivo for everything else.** Literata pairs with Archivo's wide display weights: it is built for screen reading, has an italic that suits the lead line, and a sturdy enough stroke to sit beside heavy headings.
- **Current stop is saffron; stops already passed are teal** (`--color-action`, `--color-done`). The same colours mean the same thing on the map, the stop list, the progress bar and the day tabs.

## New and changed tokens

- Colour: `--color-action`, `--color-on-action`, `--color-done`, `--color-on-done`, `--marble-*` (six), `--day-1-bg` to `--day-5-bg` and `--day-*-ink`. Category colours changed; light-theme Food and Modern day were darkened for text contrast on white.
- Type: `--font-story`, `--stretch-display`, `--stretch-display-wide`, `--text-lead`, `--text-story`, `--text-day-title`, `--text-stop-title`, `--text-side-title`, `--leading-story`, `--leading-lead`, `--transform-label` (set to `uppercase` to restore the old labels).
- Shape and size: `--arch`, `--size-banner`, `--size-topbar`, `--size-side`, `--stop-media-max`, `--size-pin-current`, `--size-tap`. Radii are now `0`.

Archivo's width axis is set with `font-stretch`, in section 15 of `page.css`. The `font:` shorthand resets it, so that rule must stay after the others. If you add a new heading style that uses `--font-display`, add its selector there.

## How the day view works

- **Panels.** Every day opener and stop panel carries `data-panel`, in page order. The final "On the list" day holds the upcoming places.
- **Current panel.** On scroll (throttled with `requestAnimationFrame`) the current panel is the last one whose `offsetTop` is at or above 40% down the stage. Day tabs, the side panel, pins, stop list and Previous / Next are all redrawn from that one number (`update()` in `dayview.js`). There is no second source of truth.
- **Going to a panel.** `goTo(i)` scrolls the stage (smooth, or instant under `prefers-reduced-motion`) and updates immediately. Scroll events are ignored for 900 ms after a jump so the UI does not flicker through the panels it passes.
- **Side panel.** Rebuilt only when the day changes. Within a day only the pin and stop-list states change (`data-state`).
- **Snap.** `scroll-snap-type: y proximity` on the stage, `scroll-snap-align: start` on panels. Panels are `min-height: 100%`, so a long story scrolls inside its panel and then snaps on. The photo column is `position: sticky`, so photos stay while the story scrolls.
- **Page scroll.** The stage does not trap scrolling. At its end the wheel moves on to the page below it (progress, notes, badges).
- **Filters** are hidden in the day view on purpose: a filtered day would break the route and the stop numbers. They apply in By place.
- **Narrow screens (under 1100px).** One breakpoint covers the banner, the day strip (a horizontal scroll under the banner), and the side panel, which becomes a bottom sheet opened from the Map button. The sheet closes on the scrim, the Close button, Escape, or choosing a stop.

## Content mapping

| Content field | Where it shows |
| --- | --- |
| `summary` | Italic lead line |
| `details[]` | Story paragraphs, in order |
| `media[]` | Photo column (existing gallery: swipe, dots, arrows, video, lightbox) |
| `area`, `period` | Dateline under "Stop n of N" |
| `category` | Coloured chips; first one is the accent |
| `status` | A "Partly visited" or "Not visited" chip |
| `mapLink` or `geo` | "Google Maps" or "Map" link |
| No `media` | The place's emblem stands in as the picture |
| No `geo` anywhere | No pin; the map note says how many stops have none |

## Known gaps and open decisions

- **Photos are not tied to paragraphs.** The prototype showed a small thumbnail beside each story paragraph, and tapping it switched the big photo. The content has no link between a note and a photo. If you want it, add an optional `photo` index to each detail (`{ "text": "...", "photo": 1 }`) and keep plain strings working. It needs a change to `tools/site.py` and `AGENTS.md`.
- **Pull-quotes** (a visitor's own words, such as "the spinach pancake was really good") are not a content type yet. The prototype set them large. Today they are ordinary paragraphs.
- **Live map** (OpenStreetMap) is built but cannot be tested in the Claude artifact, which blocks tiles. Test on GitHub Pages: pins should show the same current, passed and coming states, and pressing a pin should move the scroll. Pin buttons use `iconSize: [44, 44]`; keep that for tap targets.
- **Persisting the theme** uses `localStorage` in a `try` block, so a blocked store only means the choice is not remembered.
- **Fonts** load from Google Fonts (Archivo with the `wdth` axis, Literata). Both are on the artifact's allowed hosts. If you self-host, keep the width axis.
- **Videos** show in the same gallery as photos; the day opener uses a video's poster if a day's first stop only has video.

## Accessibility

- Every button is at least 44px, including map pins (28px marker inside a 44px target).
- Focus rings use `--color-focus` on every new control; the stage is focusable so the keyboard can scroll it.
- Current day and current stop use `aria-current`. Pin labels read "3, Sultan Ahmed Mosque (Blue Mosque)".
- Text on day openers and the saffron button was chosen for contrast. Check again after changing any of `--day-*` or `--color-action`.
- `prefers-reduced-motion` turns off the sheet slide and makes scroll jumps instant.
- Layout works from 360px wide with no sideways page scroll.

## Checking your changes

Use the list at the end of `docs/DESIGN.md`. For this restyle in particular:

1. Wheel-scroll the whole trip on desktop, then click a day tab, a pin, a stop in the list, and Next. The highlighted day, stop and pin should never disagree with what is on screen.
2. Resize across 1100px, and to 390px. Open and close the map sheet.
3. Switch Auto, Light, Dark. Open each day's opener (five colours) in both themes.
4. Day 2 (a stop with no photos), Day 4 (a stop with no position), Day 6 (video and a no-position stop), and the last day, "On the list".
5. Keyboard only: tab to the banner, tabs, map pins, stop list and bottom bar.

## Bringing it into the repo

The artifact and the GitHub repo are separate copies (see `docs/DESIGN.md`). To land this: copy the files in the table above into the repo, run it with `python3 -m http.server`, check the list above, and open a pull request. Content edits made in the meantime only touch `content/` and photos, so they will not conflict, except for the one-line `site.json` typo fix.
