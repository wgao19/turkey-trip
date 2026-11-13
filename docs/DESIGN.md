# Design guide

How the Turkey Trip site is styled, and how to restyle it. The site is plain HTML, CSS and JavaScript with no build step. Edit a file, reload the page, and you see the change.

## Run it locally

```sh
python3 -m http.server      # in the repo root
# open http://localhost:8000
```

Opening `index.html` directly from disk will not work, because the page fetches its content from `content/*.json`. Push to `main` and GitHub Pages publishes the site at https://wgao19.github.io/turkey-trip/ within a minute or two.

## Working in the Claude artifact

The site is also published as a private Claude artifact, the Turkey Trip page: https://claude.ai/artifact/QBEo6i545XST7p37cCCaUR. You can restyle it there by asking Claude to change the files below and republish. Two things to know:

- **The artifact and the GitHub repo are separate copies.** When the restyle is done, ask Claude to bring the artifact's style changes back into the repo as a pull request. While a restyle is in progress, keep content edits (text, photos) to one place, so the two copies don't drift apart.
- **Map tiles don't load in the artifact.** The day maps show the drawn route sketch there. The live OpenStreetMap view only appears on GitHub Pages.

## Where things live

| File | What to change there |
| --- | --- |
| `css/tokens.css` | **Start here.** Colours (light and dark), fonts, type sizes, weights, line heights, letter spacing, spacing, radii, sizes, shadows, motion. |
| `css/page.css` | Layout and components, in page order (see the table of contents at its top). Reads tokens only. |
| `css/daymap.css` | The day map in the By day view: the SVG route sketch and the live OpenStreetMap view. |
| `index.html` | Page shell and the Google Fonts `<link>`. Change the font link here when you change `--font-*`. |
| `js/emblems.js` | The hand-drawn badge artwork (small SVGs). Conventions are at the top of the file. |
| `js/app.js` | Builds all markup from the content. Read it to see which classes an element gets; changing it is not usually needed for a restyle. |
| `icons/` | Favicon (SVG plus PNG fallbacks), built from the Süleymaniye badge. |

The editor (`cms/index.html`) is a separate tool with its own small style block. It is not part of the public site.

## Tokens

All tokens live in `css/tokens.css`, grouped and commented. In short:

- **Colour.** Surfaces and text (`--color-page`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`), interaction (`--color-focus`, `--color-highlight`), things over photos (`--color-overlay`, `--color-lightbox*`), and one colour per category (`--category-roman`, `--category-food`, …).
- **Type.** `--font-display`, `--font-body`, `--font-label`. Sizes run from `--text-micro` to `--text-name`. Weights are by role (`--weight-label`, `--weight-strong`, `--weight-heading`, `--weight-display`), followed by line heights (`--leading-*`) and letter spacing (`--tracking-*`).
- **Spacing.** A scale from `--space-1` (4px) to `--space-7` (44px), plus layout tokens such as `--gap-grid`, `--gap-sections`, `--pad-card` and `--pad-bar`.
- **Shape and size.** Radii (`--radius-card`, `--radius-badge`, `--radius-pill`), border and focus widths, and control sizes (`--size-control*`, `--size-avatar`, `--size-dot`, `--size-progress`, `--size-play`, `--size-pin`).
- **Layout.** `--content-max`, `--gutter`, `--card-min` (card column width), `--badge-min`, `--note-min`, and aspect ratios for photos and the map.
- **Motion.** `--motion-fast` and `--lift` (how far cards rise on hover).

### Light and dark

`tokens.css` has three blocks:

1. `:root`: light colours and every non-colour token.
2. `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`: dark colours when the device is in dark mode.
3. `:root[data-theme="dark"]`: the same dark colours, for an explicit theme switch.

Blocks 2 and 3 only redefine colours and must stay identical. To preview dark mode, use your browser's dev tools ("Emulate CSS prefers-color-scheme: dark").

### Category colours

Each place has one or more categories (tags). The first one sets the card's accent. `js/app.js` sets `--accent` on each card and badge, for example `--accent: var(--category-roman, var(--category-default))`. Inside a card, use `var(--accent)` for anything that should follow the place's colour. Tints of it are made with `color-mix()` in `page.css`.

`tools/site.py` adds a `--category-<id>` line to all three blocks when a new category is created. Keep each block's `--category-*` lines together so it can find them.

## Components

Class names are BEM: `block`, `block__element`, `block--modifier`. The main blocks are `.profile`, `.collection-bar`, `.trip` and `.destination`, `.card`, `.gallery`, `.emblem`, `.badge`, `.note`, `.lightbox` and `.daymap`.

States you will want to style:

| State | Selector |
| --- | --- |
| Visited / partly visited / not visited | `.card[data-status="collected" \| "partial" \| "missed"]` |
| "On the list" slot (no photos yet) | `.card--placeholder` |
| Badge not yet earned | `.badge--dim` |
| Selected filter or view button | `.filter[aria-pressed="true"]`, `.view-btn[aria-pressed="true"]` |
| Current photo dot | `.gallery__dot[aria-current="true"]` |
| Video playing | `.gallery__slide--video[data-playing="true"]` |
| Highlights expanded | `.card__details[open]` |
| Photo viewer open | `body.lightbox-open` |

## Please keep

- **Class names the JavaScript uses.** `js/app.js` and `js/daymap.js` find these elements by class: `.card`, `.trip`, `.destination`, `.filter`, `.view-btn`, `.badges`, `.notes`, `.gallery`, `.gallery__track`, `.gallery__image`, `.gallery__dot`, `.gallery__nav--prev` and `--next`, `.gallery__play`, `.gallery__zoom`, `.gallery__caption`, `.lightbox__img`, `.lightbox__caption`, `.lightbox__close`, `.lightbox__nav--prev` and `--next`, `.daymap__canvas`, `.daymap__svg`, `.daymap__summary`. Restyle them freely, but rename one only together with the JavaScript.
- **`data-slot` attributes** in `index.html`. That is where `js/app.js` puts generated content.
- **Gallery scrolling.** Swiping is native CSS scroll-snap on `.gallery__track`. Keep its `overflow-x:auto`, `scroll-snap-type` and the slides' `scroll-snap-align`.
- **Inline values from content.** `--accent`, `--ring` (the avatar's ring) and a photo's `object-position` are set inline from the content. Style with them; don't override them.
- **Accessibility.** Visible focus rings (`--color-focus`), readable contrast in both themes, the `prefers-reduced-motion` rules, and a layout that works from 360px wide with no sideways scrolling.

## Checking a restyle

Look at these before calling it done, in light and dark, on desktop and phone width:

- By place and By day views (switch at the top). By day shows the day maps.
- A card with several photos (swipe, dots, arrows), a video card (Süleymaniye), a card without photos (The Harem, Not visited), and the "on the list" slot (Grand Bazaar).
- The photo viewer (zoom button on a photo).
- Highlights expanded, the filters, the badge shelf and "Picked up along the way".
