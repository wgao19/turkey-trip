# Reference

Read this only when AGENTS.md does not cover the task.

## Files

```
index.html                       Page shell with data-slot hooks.
content/site.json                profile, categories, fieldNotes, and each trip's list of destination ids.
content/destinations/<id>.json   One destination: its memories and upcoming slots.
photos/, videos/                 Compressed media, referenced by path from the memories.
js/app.js                        Loads the content and renders it. Gallery swipe, filters, progress.
js/emblems.js                    Hand-drawn artwork, one drawing per place.
css/tokens.css, css/page.css     Design tokens, then component styles.
tools/site.py                    Adds content from a spec. See AGENTS.md.
AGENTS.md, docs/REFERENCE.md     Instructions.
```

## Data format

`content/site.json`:

```
profile       title (page heading), initial, eyebrow, tagline, categoryLabel (plural noun for categories, e.g. "Eras")
categories[]  id, label
trips[]       id, name, dates, destinations: ["istanbul", "antalya"], days: [{date, title}] (short title per travel day, shown in the By day view)
fieldNotes[]  label, text
```

`content/destinations/<id>.json`:

```
id, name, dates
memories[]   the cards, in collection order
upcoming[]   empty "on the list" slots: title, hint
```

A memory: `id`, `title`, `area`, `category` (one id, or a list of ids when it spans eras; the first is the main one), `period`, `date` (YYYY-MM-DD, drives the By day view), `collectedOn` (display text such as "25 Oct"), `status` (`collected` or `partial`), optional `statusLabel`, optional `emblem`, `summary`, `details[]`, `media[]`.

A media item: a photo is `{file, alt, focus?, takenAt?, geo?}`; `takenAt` is an ISO time with UTC offset and `geo` is `[lat, lon]`, both read from the original photo's metadata. The card shows the earliest time and a Map link to the first position. In the By day view cards are ordered by earliest `takenAt`; cards with no time come first, in file order. A video is `{type: "video", file, poster, alt}`. The first item shows on the card and swiping moves through the rest. A memory with no media shows its artwork instead. Every place also gets a badge (its artwork) on the Badges shelf: lit when collected, dimmed while it is an `upcoming` slot. Card numbers ("No. 07") come from the order of memories across trips and destinations, so they are never written by hand.

## Editing by hand (only if Python or ffmpeg is unavailable)

Edit `content/destinations/<id>.json` with small exact edits, not by rewriting the file. Compress photos to 1200 px JPEG without metadata, videos to H.264 MP4 under 14 MB with a poster JPG, and name files `photos/<memory-id>-<n>.jpg`, `videos/<memory-id>-<n>.mp4`, `photos/<memory-id>-<n>-poster.jpg`. Keep ids unique and categories valid. A new destination also needs its id added to a trip in `content/site.json`.

## Categories and artwork

A new category needs an entry in `site.json` and a `--category-<id>` colour in `css/tokens.css`, in the light block and both dark blocks. Without it the category is grey.

Emblems are drawn in `js/emblems.js` (conventions at the top of that file). A memory with no emblem shows a map pin, so new places do not need artwork. Draw one only if Wei asks, and never copy a specific protected artwork, logo or character.

## Publishing

Publish to the same artifact `url`; a publish without it makes a separate artifact. If a publish is refused because the page changed since you read it, read it again, merge your change and publish again. To delete an old file, pass `null` for its path in `files`.

## Restyling (for designers)

- Colours, fonts, type scale, spacing, radii and widths are tokens in `css/tokens.css`. Start there.
- `css/page.css` styles components by BEM class names (`card`, `card__title`, `gallery__dot`). A component map is at the top of that file.
- Markup comes from `js/app.js`. Inline styles exist only for data: `--accent` (category colour), `--ring` (avatar ring) and `object-position` (photo focus).
- Keep the `data-slot` attributes in `index.html`.
- The page runs in a locked-down frame. Scripts and stylesheets load from the artifact's own files, or from cdnjs, jsDelivr, unpkg and Google Fonts (stylesheets only). It must work at 400 px wide, in light and dark themes, without sideways scrolling.
- Swiping is native CSS scroll-snap on `.gallery__track`. Restyle freely, but keep `overflow-x:auto`, `scroll-snap-type` and `scroll-snap-align`.
- Videos use a custom play button (`.gallery__play`), no native controls, and are paused when swiped away.
