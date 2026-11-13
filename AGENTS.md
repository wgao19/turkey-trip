# AGENTS.md

How to add places, photos and videos to Wei's Turkey Trip page. The page lists the trip by place and by day, and shows a badge shelf at the bottom.
Live page (private artifact): https://claude.ai/artifact/QBEo6i545XST7p37cCCaUR

Content is data. `tools/site.py` compresses media, edits the content files and validates them. You write a small spec. For normal additions you do not read or hand-edit content files.

## Fast path (one fetch, one script run, one publish)

1. Fetch in ONE Artifact `read` call: `url` = the link above, `paths` = `["tools/site.py", "content/site.json"]`, plus `"content/destinations/<id>.json"` for each destination you will touch that already exists (skip it for a brand-new destination), plus `"css/tokens.css"` only if the spec adds a `categories` entry. Note the folder they are saved in. The script prints in FILES every file it changed. Artifact refuses a publish that overwrites a published file you have not read, so every changed file other than photos and videos must be in this first read.
2. Fetch the page shell: Artifact `read` with `url` only. It gives you a local `index.html`.
3. Write `spec.json` (format below). Use the attachment paths from the chat as `src`.
4. Run `python3 <folder>/tools/site.py apply spec.json`. It resizes photos, compresses videos, makes video posters, writes the content files, validates, and prints `FILES={...}`. On an error, fix the spec and rerun.
5. Publish once: Artifact with `url`, `file_path` = the local `index.html`, `files` = the printed FILES map. Files you leave out are kept.
6. Reply in one sentence. Do not paste the URL.

Do not open attached photos or videos with Read: you can already see images in the chat, and the script works from the file path. Do not read css/, js/ or other content files.

## Spec

A list with one block per destination (a single block also works):

```json
[{
  "trip": "turkey",
  "destination": "antalya",
  "memories": [{
    "id": "aspendos",
    "title": "Aspendos",
    "area": "Near Antalya",
    "category": "roman",
    "period": "2nd c. CE",
    "summary": "One or two sentences: what it is and why it matters.",
    "details": ["Short note.", "Short note."],
    "fills": "First Antalya memory",
    "media": [
      {"src": "/mnt/user-data/attachments/.../a.jpg", "alt": "What the photo shows", "focus": "50% 40%"},
      {"src": "/mnt/user-data/attachments/.../clip.mov", "alt": "What the clip shows"}
    ]
  }]
}]
```

- New place: `id` (lowercase-hyphen), `title`, `area`, `category`, `period`, `summary` are required. Date and place come from the photos: the script reads the date taken and GPS position from each original photo, stores them as `takenAt` and `geo` (about 100 m precision) on the media item, sets the memory's `date` and `collectedOn` from the earliest photo, and then drops all metadata from the published image. Only if the photos have no date (chat apps often strip it), add `"date": "YYYY-MM-DD"` yourself, taken from what Wei said. `category` is one era id, or a list when a place spans several (Hagia Sophia is `["byzantine", "ottoman"]`; the first is its main colour). Add `details` (2 or 3 notes). `status` defaults to `collected`; use `partial` plus `statusLabel` (for example "Seen from outside") when Wei only saw part of it. `fills` names the "on the list" slot this place replaces (matched by title as well).
- Existing place: give its `id` plus only what you add (`media`, `details`). Media and details are appended; nothing is removed. Other fields you include overwrite.
- New destination: `"destination": {"id": "...", "name": "...", "dates": "..."}`. New trip: `"trip": {"id": "...", "name": "...", "dates": "..."}`.
- Optional at block level: `upcomingAdd` `[{title, hint}]`, `upcomingRemove` `[title]`, `categories` `[{id, label}]` (the script adds its colour to css/tokens.css; pass `color` and `colorDark` to choose it), `fieldNotes` `[{label, text}]`, `profile` `{tagline}`, `days` `[{date, title}]` (a short title for a new travel day, for example `{"date": "2026-10-31", "title": "Antalya old town"}`; Wei's own wording if she gave one).
- A `src` ending in .mp4, .mov, .m4v, .webm and similar is treated as a video automatically.
- `mapLink` is optional on any memory: a Google Maps link Wei pasted. The card then shows "Google Maps" in place of the default map link, which is built from photo GPS. Every food place should have one. Store the link exactly as Wei gave it. Short links (maps.app.goo.gl) cannot be opened from the workspace, so the restaurant name must come from Wei; never guess it. If he gave no name, use a plain title such as "Breakfast before Side" and ask.
- `emblem` is optional. A missing emblem shows a map pin. The drawing appears on the Badges shelf (lit once the place is collected, dimmed while it is on the list) and on the card only when it has no photos or videos.
- `focus` is where to centre the crop in the 4:5 photo frame, as "x% y%". Omit for centre.
- `alt` is required on every photo and video. It is also the caption shown under the photo and in the full-size view, so keep it to one plain sentence. There is no separate `caption` field.

## Food places

- Category is `["food","modern"]` (Food is the main colour, and gives the Food filter). Use it for restaurants, street food, markets where Wei ate, breakfast and snacks. A fish market she only walked through is not Food.
- Each food card needs the dish Wei called out (quote what she said, e.g. "the spinach pancake was really good"), a `mapLink`, and the restaurant's own name as the title (for example "Sultanyar Kebap"). Ask for any missing link or name in the reply, naming the cards that lack one.
- Menu photos go on the same card as the meal. Read the menu only to describe it; do not invent prices or dishes.

## Photos from chat, and videos

- Chat-uploaded photos have no EXIF. Set `date` from what Wei said and do not invent a time. Always let the script try first; it reads EXIF when a photo has it. Add a date only when it finds none.
- Videos are processed but the script does not store their date or GPS. If the original has them, add `takenAt` and `geo` to the video's media item by hand in the destination file after `apply`, since the by-day order uses `takenAt`.
- Videos autoplay muted on a loop while on screen and fill the frame (cropped). Photos open full-size in a lightbox when tapped. Nothing to configure.
- Move a photo between cards only by editing the two destination files; the script only appends.

## Order, days and the day map

- Card numbers follow order across destinations. In the By day view, cards with no `takenAt` come first in file order, then timed cards by their first `takenAt`. To make an untimed card come before another one (breakfast before the theatre), place it earlier in the destination's `memories` list.
- Add a `days` entry for each new travel day with a short title. Each day gets a to-scale route sketch with numbered pins and an "Open in Maps" link, built from the cards' `geo`. Cards without `geo` are listed under "Not on the map". On the GitHub Pages site the sketch is replaced by a live OpenStreetMap view (no API key). The Claude artifact frame blocks map tiles, so there it stays a sketch.
- Give each placeable memory a memory-level `geo` (about 100 m is fine) when the photos carry none.

## People, names and journal notes

- Wei is the woman in the photos. The man is Szu Ker, who travels with her. Name him in photo `alt` text where he appears, and Wei where she does. Do not call him a stranger or a random person.
- Wei's side questions during the trip (what a dish is, what a theatre was for) can become short `fieldNotes` when she asks, or when it is clearly worth keeping. Only use facts that were checked; mark disputed ones as disputed. Examples already there: theatre capacities, the Side pomegranate story.
- Do not store anything private (health, money) in the page or in memory.

## Publishing

- Publish only the files `apply` printed in FILES. Artifact refuses a file already published that you have not read this session. Read it with `path` and an `out_dir` of its own (not over your working copy), check it matches your copy except for your change, then publish again.
- The page shell (`index.html`) must be the `file_path`. Use the same URL every time.
- Keep the reply to one or two sentences. Name what changed and anything still missing (a link, a name). Do not paste the URL.

## Media limits

Photos become 1200 px JPEGs. Videos become H.264 MP4, at most 720 px wide (portrait) or 1280 px (landscape), and must come out under 14 MB; the artifact allows 15 MB per file and 64 MB per publish. Long clips will fail: ask Wei for a shorter clip. Metadata (location, camera) is stripped. File names are automatic.

## Content rules

1. Record only what Wei said or sent. Never invent visits, dates or opinions.
2. Background facts must be accurate. Search if unsure. Mark disputed facts as disputed.
3. Be honest about status: `collected` means Wei went, `partial` means part of it.
4. If a photo clearly shows, or its GPS position says, a different place than Wei labelled, put it where it belongs and say so in your reply so Wei can overrule it.
5. Write short, plain copy. No em-dash asides or marketing tone. Match the existing cards.
6. Keep diacritics (Süleymaniye, Topkapı, İznik). Use "Türkiye".
7. Never remove existing content unless Wei asks.

## Text edits from the editor

Wei edits captions and other text in the Turkey Trip Editor artifact. Ship and sync requests from it follow `cms/README.md`.

## More

`docs/REFERENCE.md` covers the data format, doing it by hand if Python is unavailable, new categories and artwork, publishing conflicts and restyling. Read it only when this file does not cover the task.
