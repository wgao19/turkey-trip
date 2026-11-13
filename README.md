# Turkey Trip

Wei's Türkiye travel log (Istanbul and Antalya, Oct–Nov 2026): every stop kept as a card, grouped by place or by day, with a route map per day and a badge shelf.

Originally built as a Claude artifact, now published with GitHub Pages.

## View it

Static site, no build step. GitHub Pages serves the repo root (`index.html`).

Locally: `python3 -m http.server` in this folder, then open http://localhost:8000 (opening the file directly won't work because the page fetches its JSON).

## Maps

The "By day" view draws a route map for each day. It uses [Leaflet](https://leafletjs.com/) (bundled in `vendor/leaflet/`) with standard OpenStreetMap tiles, which need no API key. If the tiles can't load, the page falls back to an offline SVG sketch of the route.

## Design

Restyling starts in `css/tokens.css`. See `docs/DESIGN.md` for the guide.

## Layout

```
index.html                      page shell
content/site.json               profile, categories, trips and days, field notes
content/destinations/*.json     one file per destination, its cards
photos/, videos/                compressed media
js/, css/                       rendering and styles
vendor/leaflet/                 Leaflet 1.9.4 (BSD-2-Clause)
tools/site.py                   adds new cards from a spec (see AGENTS.md)
```
