/*
  APP
  Loads content/site.json and content/destinations/*.json and renders the page into the slots in index.html.
  Nothing here is specific to Istanbul or Türkiye: add content in the JSON files only.
  Visible interface strings are collected in LABELS so they can be reworded in one place.
  Swiping is native scroll-snap on .gallery__track; this file only keeps dots and arrows
  in sync with where the track has scrolled. A memory's category may be one id or a list of ids:
  the first is its main one (card colour, avatar ring), and filters match any of them.
*/
(function () {
  'use strict';

  const SITE_URL = 'content/site.json';
  const DESTINATIONS_DIR = 'content/destinations/';

  const LABELS = {
    loadError: 'The collection could not be loaded. Check that the JSON files in content/ are valid.',
    keepsake: 'Highlights',
    statusCollected: 'Visited',
    statusPartial: 'Partly visited',
    statusMissed: 'Not visited',
    progressMissed: 'not visited',
    upcomingTag: 'On the list',
    upcomingStatus: 'Not visited yet',
    filterAll: 'All',
    statMemories: 'Memories',
    statCity: 'City',
    statCities: 'Cities',
    statCategories: 'Categories',
    statDays: 'Days',
    viewsLabel: 'Group by',
    viewPlace: 'By place',
    viewDay: 'By day',
    undated: 'Undated',
    day: 'Day',
    onTheList: 'On the list',
    map: 'Map',
    googleMap: 'Google Maps',
    progressCollected: 'visited',
    progressUpcoming: 'on the list',
    badgesTitle: 'Badges',
    badgesLit: 'lit',
    badgesDim: 'still to find',
    previous: 'Previous',
    next: 'Next',
    viewFull: 'View the whole photo',
    closePhoto: 'Close',
    play: 'Play video',
    pause: 'Pause video'
  };

  const slot = name => document.querySelector('[data-slot="' + name + '"]');
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad = n => String(n).padStart(2, '0');
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accentStyle = id => 'style="--accent:var(--category-' + esc(id) + ',var(--category-default))"';

  // content/site.json lists each trip's destination ids; each destination is its own file.
  async function loadContent() {
    const get = async url => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
      return res.json();
    };
    const site = await get(SITE_URL);
    const ids = Array.from(new Set((site.trips || []).flatMap(t => t.destinations || [])));
    const loaded = await Promise.all(ids.map(id => get(DESTINATIONS_DIR + id + '.json')));
    const byId = {};
    loaded.forEach(d => { byId[d.id] = d; });
    (site.trips || []).forEach(t => { t.destinations = (t.destinations || []).map(id => byId[id]); });
    return site;
  }

  /* ---------- Gallery ---------- */

  // One slide per media item: a photo, or a video with a poster and a custom play button.
  function mediaSlide(item, first) {
    if (item.type === 'video') {
      return '<div class="gallery__slide gallery__slide--video" data-playing="false" data-caption="' + esc(item.alt) + '">' +
        '<video class="gallery__video" src="' + esc(item.file) + '" poster="' + esc(item.poster || '') +
        '" muted loop playsinline preload="' + (first ? 'metadata' : 'none') + '" aria-label="' + esc(item.alt) + '"></video>' +
        '<button type="button" class="gallery__play" aria-label="' + LABELS.play + '"></button></div>';
    }
    return '<div class="gallery__slide" data-caption="' + esc(item.alt) + '"><img class="gallery__image" src="' + esc(item.file) + '" alt="' + esc(item.alt) +
      '" draggable="false" loading="' + (first ? 'eager' : 'lazy') + '"' +
      (item.focus ? ' style="object-position:' + esc(item.focus) + '"' : '') + '>' +
      '<button type="button" class="gallery__zoom" aria-label="' + LABELS.viewFull + '"></button></div>';
  }

  // The line under the gallery. It follows the photo in view and shows that item's `alt` text, which is its caption.
  function captionMarkup(m) {
    const first = (m.media || [])[0];
    if (!first) return '';
    return '<p class="gallery__caption" aria-live="polite">' + esc(first.alt) + '</p>';
  }

  // A memory with photos or videos shows only those. With none, its drawn artwork stands in as the picture.
  function galleryMarkup(m) {
    const media = m.media || [];
    if (!media.length) {
      return '<div class="gallery" data-count="1"><div class="gallery__track"><div class="gallery__slide gallery__slide--emblem">' +
        Emblems.render(m.emblem) + '</div></div></div>';
    }
    const many = media.length > 1;
    const slides = media.map((item, i) => mediaSlide(item, i === 0)).join('');
    const controls = many
      ? '<button type="button" class="gallery__nav gallery__nav--prev" aria-label="' + LABELS.previous + '" disabled>&#8249;</button>' +
        '<button type="button" class="gallery__nav gallery__nav--next" aria-label="' + LABELS.next + '">&#8250;</button>' +
        '<div class="gallery__dots">' + media.map((item, i) =>
          '<button type="button" class="gallery__dot" aria-label="' + (item.type === 'video' ? 'Video ' : 'Photo ') + (i + 1) + ' of ' + media.length + '"' +
          (i === 0 ? ' aria-current="true"' : '') + '></button>').join('') + '</div>'
      : '';
    return '<div class="gallery" data-count="' + media.length + '" data-index="0"' +
      ' role="group" aria-roledescription="carousel" aria-label="' + esc(m.title) + '">' +
      '<div class="gallery__track"' + (many ? ' tabindex="0"' : '') + '>' + slides + '</div>' + controls + '</div>';
  }


  /* ---------- Lightbox: tap a photo to see the whole picture ---------- */
  const lightbox = (function () {
    let root, img, caption, prevBtn, nextBtn, items = [], at = 0, opener = null;
    const build = () => {
      root = document.createElement('div');
      root.className = 'lightbox';
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Photo');
      root.innerHTML =
        '<button type="button" class="lightbox__close" aria-label="' + LABELS.closePhoto + '">&times;</button>' +
        '<button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="' + LABELS.previous + '">&#8249;</button>' +
        '<figure class="lightbox__figure"><img class="lightbox__img" alt=""><figcaption class="lightbox__caption"></figcaption></figure>' +
        '<button type="button" class="lightbox__nav lightbox__nav--next" aria-label="' + LABELS.next + '">&#8250;</button>';
      document.body.appendChild(root);
      img = root.querySelector('.lightbox__img');
      caption = root.querySelector('.lightbox__caption');
      prevBtn = root.querySelector('.lightbox__nav--prev');
      nextBtn = root.querySelector('.lightbox__nav--next');
      root.querySelector('.lightbox__close').addEventListener('click', close);
      prevBtn.addEventListener('click', e => { e.stopPropagation(); show(at - 1); });
      nextBtn.addEventListener('click', e => { e.stopPropagation(); show(at + 1); });
      root.addEventListener('click', e => { if (e.target === root || e.target.classList.contains('lightbox__figure')) close(); });
      document.addEventListener('keydown', e => {
        if (root.hidden) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(at - 1);
        else if (e.key === 'ArrowRight') show(at + 1);
      });
    };
    function show(i) {
      if (i < 0 || i >= items.length) return;
      at = i;
      img.src = items[i].src;
      img.alt = items[i].alt;
      caption.textContent = items[i].alt + (items.length > 1 ? '  (' + (i + 1) + '/' + items.length + ')' : '');
      prevBtn.hidden = nextBtn.hidden = items.length < 2;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === items.length - 1;
    }
    function open(list, index, from) {
      if (!root) build();
      items = list; opener = from;
      show(index);
      root.hidden = false;
      document.documentElement.classList.add('lightbox-open');
      root.querySelector('.lightbox__close').focus();
    }
    function close() {
      root.hidden = true;
      img.removeAttribute('src');
      document.documentElement.classList.remove('lightbox-open');
      if (opener && opener.focus) opener.focus();
    }
    return { open: open };
  })();

  function initGallery(el) {
    const track = el.querySelector('.gallery__track');
    const slides = Array.from(track.children);
    const dots = Array.from(el.querySelectorAll('.gallery__dot'));
    const prev = el.querySelector('.gallery__nav--prev');
    const next = el.querySelector('.gallery__nav--next');

    const videoSlides = slides.filter(s => s.classList.contains('gallery__slide--video'));
    videoSlides.forEach(s => {
      const v = s.querySelector('video');
      const btn = s.querySelector('.gallery__play');
      v.muted = true;
      const toggle = () => { if (v.paused) { s.dataset.held = ''; v.play().catch(() => {}); } else { s.dataset.held = '1'; v.pause(); } };
      const state = () => {
        const playing = !v.paused && !v.ended;
        s.dataset.playing = String(playing);
        btn.setAttribute('aria-label', playing ? LABELS.pause : LABELS.play);
      };
      v.addEventListener('play', state);
      v.addEventListener('pause', state);
      v.addEventListener('ended', state);
      v.addEventListener('click', toggle);
      btn.addEventListener('click', toggle);
    });

    // Tapping a photo (or its corner button) opens it whole in a lightbox. Only photos are listed, so arrows skip clips.
    const photos = slides.filter(s => s.querySelector('.gallery__image')).map(s => {
      const im = s.querySelector('.gallery__image');
      return { src: im.getAttribute('src'), alt: im.getAttribute('alt') || '' };
    });
    slides.forEach(s => {
      const im = s.querySelector('.gallery__image');
      if (!im) return;
      const openIt = e => {
        const n = photos.findIndex(p => p.src === im.getAttribute('src'));
        lightbox.open(photos, Math.max(0, n), e.currentTarget);
      };
      im.addEventListener('click', openIt);
      s.querySelector('.gallery__zoom').addEventListener('click', openIt);
    });

    // Videos play silently on a loop while their card is on screen and the clip is the slide in view.
    // A viewer who pauses one keeps it paused until they swipe away.
    let onScreen = false;
    const autoplay = () => {
      const i = Number(el.dataset.index) || 0;
      videoSlides.forEach(s => {
        const v = s.querySelector('video');
        const wanted = onScreen && s === slides[i];
        if (!wanted) { s.dataset.held = ''; if (!v.paused) v.pause(); }
        else if (v.paused && !s.dataset.held) v.play().catch(() => {});
      });
    };
    if (videoSlides.length && 'IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
        autoplay();
      }, { threshold: 0.5 }).observe(el);
    }

    const current = () => {
      const w = track.clientWidth;
      if (!w) return Number(el.dataset.index) || 0;
      return Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / w)));
    };
    const sync = () => {
      const i = current();
      el.dataset.index = String(i);
      const card = el.closest('.card');
      const cap = card && card.querySelector('.gallery__caption');
      if (cap && slides[i] && slides[i].dataset.caption !== undefined && cap.textContent !== slides[i].dataset.caption) cap.textContent = slides[i].dataset.caption;
      videoSlides.forEach(s => {
        const v = s.querySelector('video');
        if (s !== slides[i] && !v.paused) v.pause();
      });
      dots.forEach((d, n) => {
        if (n === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
      autoplay();
    };
    const go = i => {
      const target = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: target * track.clientWidth, behavior: reduceMotion() ? 'auto' : 'smooth' });
    };

    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    }, { passive: true });
    if (prev) prev.addEventListener('click', () => go(current() - 1));
    if (next) next.addEventListener('click', () => go(current() + 1));
    dots.forEach((d, n) => d.addEventListener('click', () => go(n)));
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
    });

    return {
      sync,
      realign: () => { track.scrollTo({ left: (Number(el.dataset.index) || 0) * track.clientWidth, behavior: 'auto' }); }
    };
  }

  /* ---------- Cards ---------- */

  const cats = m => (Array.isArray(m.category) ? m.category : [m.category]).filter(Boolean);

  // Dates and places come from the photos (takenAt, geo) or from a memory's own `date`.
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayLabel(iso) {
    const p = iso.split('-').map(Number);
    return WEEKDAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + p[2] + ' ' + MONTHS[p[1] - 1];
  }
  const firstTaken = m => (m.media || []).map(i => i.takenAt).filter(Boolean).sort()[0] || '';
  const clock = iso => (iso ? iso.slice(11, 16) : '');
  const firstGeo = m => { const it = (m.media || []).find(i => i.geo); return it ? it.geo : null; };
  const mapUrl = g => 'https://www.openstreetmap.org/?mlat=' + g[0] + '&mlon=' + g[1] + '#map=17/' + g[0] + '/' + g[1];

  // A card counts as visited unless its status is "missed" (planned or nearby, but not gone into).
  const visited = m => m.status !== 'missed';

  function cardMarkup(m, categoryLabel) {
    const statusText =
      (m.status === 'partial' ? LABELS.statusPartial : m.status === 'missed' ? LABELS.statusMissed : LABELS.statusCollected);
    const taken = clock(firstTaken(m));
    const geo = firstGeo(m);
    const details = (m.details || []).length
      ? '<details class="card__details"><summary class="card__details-summary label">' + LABELS.keepsake + '</summary>' +
        '<ul class="card__details-list">' + m.details.map(d => '<li>' + esc(d) + '</li>').join('') + '</ul></details>'
      : '';
    return '<article class="card" id="' + esc(m.id) + '" data-category="' + esc(cats(m).join(' ')) + '" data-status="' + esc(m.status || 'collected') + '" ' + accentStyle(cats(m)[0]) + '>' +
      '<div class="card__media">' +
        '<span class="card__number label">No. ' + pad(m.number) + '</span>' +
        '<span class="card__category label">' + esc(categoryLabel) + '</span>' +
        galleryMarkup(m) +
      '</div>' +
      captionMarkup(m) +
      '<div class="card__body">' +
        '<div class="card__meta label"><span>' + esc(m.area) + '</span><span>' + esc(m.period) + '</span></div>' +
        '<h4 class="card__title">' + esc(m.title) + '</h4>' +
        '<p class="card__summary">' + esc(m.summary) + '</p>' +
        '<p class="card__status label"><i class="card__status-dot"></i>' + esc(statusText) + (m.collectedOn ? ' · ' + esc(m.collectedOn) : '') + (taken ? ' · ' + taken : '') +
          (m.mapLink ? '<a class="card__map" href="' + esc(m.mapLink) + '" target="_blank" rel="noopener">' + LABELS.googleMap + '</a>'
            : geo ? '<a class="card__map" href="' + mapUrl(geo) + '" target="_blank" rel="noopener">' + LABELS.map + '</a>' : '') + '</p>' +
        details +
      '</div></article>';
  }

  function placeholderMarkup(u) {
    return '<article class="card card--placeholder">' +
      '<div class="card__media"><div class="gallery" data-count="1"><div class="gallery__track"><div class="gallery__slide gallery__slide--emblem">' + Emblems.render('plus') + '</div></div></div></div>' +
      '<div class="card__body">' +
        '<div class="card__meta label"><span>' + LABELS.upcomingTag + '</span></div>' +
        '<h4 class="card__title">' + esc(u.title) + '</h4>' +
        '<p class="card__summary">' + esc(u.hint) + '</p>' +
        '<p class="card__status label"><i class="card__status-dot"></i>' + LABELS.upcomingStatus + '</p>' +
      '</div></article>';
  }

  /* ---------- Badges ---------- */

  // One badge per place: lit (in its era colour) once visited, dimmed while it is still on the list or was not visited.
  function badgeMarkup(title, emblem, accent, lit, href, note) {
    const inner = '<span class="badge__art">' + Emblems.render(emblem) + '</span><span class="badge__name">' + esc(title) + '</span>';
    const cls = 'badge' + (lit ? '' : ' badge--dim');
    const label = esc(title) + (lit ? (note ? ', ' + esc(note) : '') : ', ' + LABELS.badgesDim);
    return '<li class="badge-list__item">' + (lit
      ? '<a class="' + cls + '" href="#' + esc(href) + '" ' + accentStyle(accent) + ' aria-label="' + label + '">' + inner + '</a>'
      : '<span class="' + cls + '" ' + accentStyle(accent) + ' aria-label="' + label + '">' + inner + '</span>') + '</li>';
  }

  /* ---------- Page ---------- */

  function render(data) {
    const profile = data.profile || {};
    const categories = data.categories || [];
    const categoryLabel = id => (categories.find(c => c.id === id) || {}).label || id;
    const trips = data.trips || [];
    const destinations = trips.flatMap(t => t.destinations || []);
    const memories = destinations.flatMap(d => d.memories || []);
    destinations.forEach(d => (d.memories || []).forEach(m => { m.place = d.name; }));
    memories.forEach((m, i) => { m.number = i + 1; });
    const upcomingCount = destinations.reduce((n, d) => n + (d.upcoming || []).length, 0);

    /* Profile */
    slot('initial').textContent = profile.initial || (profile.name || '?').charAt(0);
    slot('eyebrow').textContent = profile.eyebrow || '';
    slot('name').textContent = profile.title || profile.name || '';
    slot('tagline').textContent = profile.tagline || '';

    const counts = {};
    categories.forEach(c => { counts[c.id] = 0; });
    const ringCounts = {};
    memories.forEach(m => {
      cats(m).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
      ringCounts[cats(m)[0]] = (ringCounts[cats(m)[0]] || 0) + 1;
    });

    if (memories.length) {
      let acc = 0;
      const stops = categories.map(c => {
        const start = acc;
        acc += ((ringCounts[c.id] || 0) / memories.length) * 100;
        return 'var(--category-' + c.id + ',var(--category-default)) ' + start + '% ' + acc + '%';
      });
      slot('avatar').style.setProperty('--ring', 'conic-gradient(' + stops.join(',') + ')');
    }

    const cityCount = destinations.filter(d => (d.memories || []).length).length;
    const usedCategories = categories.filter(c => counts[c.id]).length;
    const dayCount = new Set(memories.map(m => m.date).filter(Boolean)).size;
    slot('stats').innerHTML = [
      [LABELS.statMemories, memories.length],
      [cityCount === 1 ? LABELS.statCity : LABELS.statCities, cityCount],
      [profile.categoryLabel || LABELS.statCategories, usedCategories],
      [LABELS.statDays, dayCount]
    ].map(s => '<div class="stat"><dt class="stat__label label">' + esc(s[0]) + '</dt><dd class="stat__value">' + s[1] + '</dd></div>').join('');

    const visitedCount = memories.filter(visited).length;
    const missedCount = memories.length - visitedCount;

    /* Progress */
    slot('progress-slots').innerHTML =
      memories.map(m => '<li class="progress__slot' + (visited(m) ? '' : ' progress__slot--empty') + '" ' + accentStyle(cats(m)[0]) + ' title="No. ' + pad(m.number) + ' ' + esc(m.title) + '"></li>').join('') +
      Array.from({ length: upcomingCount }, () => '<li class="progress__slot progress__slot--empty" title="' + LABELS.upcomingTag + '"></li>').join('');
    slot('progress-caption').textContent = visitedCount + ' ' + LABELS.progressCollected +
      (missedCount ? ' · ' + missedCount + ' ' + LABELS.progressMissed : '') + ' · ' + upcomingCount + ' ' + LABELS.progressUpcoming;

    /* Badges */
    const badges = destinations.flatMap(d =>
      (d.memories || []).map(m => badgeMarkup(m.title, m.emblem, cats(m)[0], visited(m), m.id))
        .concat((d.upcoming || []).map(u => badgeMarkup(u.title, u.emblem, null, false)))
    );
    slot('badges').innerHTML = badges.join('');
    slot('badges-caption').textContent = visitedCount + ' ' + LABELS.badgesLit + ' · ' + (upcomingCount + missedCount) + ' ' + LABELS.badgesDim;
    if (!badges.length) slot('badges').closest('.badges').hidden = true;

    /* Filters */
    const filterDefs = [{ id: 'all', label: LABELS.filterAll, n: memories.length }]
      .concat(categories.map(c => ({ id: c.id, label: c.label, n: counts[c.id] || 0 })));
    slot('filters').innerHTML = filterDefs.map(f =>
      '<button type="button" class="filter" data-filter="' + esc(f.id) + '" aria-pressed="' + (f.id === 'all') + '"' + (f.id !== 'all' ? ' ' + accentStyle(f.id) : '') + '>' +
      (f.id !== 'all' ? '<i class="filter__swatch"></i>' : '') + esc(f.label) + ' <b class="filter__count">' + f.n + '</b></button>'
    ).join('');

    /* Trips: grouped by place or by day */
    const labelsOf = m => cats(m).map(categoryLabel).join(' · ');
    const tripHead = t => {
      const n = (t.destinations || []).reduce((sum, d) => sum + (d.memories || []).filter(visited).length, 0);
      return '<div class="trip__header"><h2 class="trip__title">' + esc(t.name) + '</h2>' +
        '<p class="trip__meta label">' + esc(t.dates) + ' · ' + n + ' ' + LABELS.progressCollected + '</p></div>';
    };
    const placeTrip = t => '<section class="trip" id="trip-' + esc(t.id) + '">' + tripHead(t) +
      (t.destinations || []).map(d =>
        '<div class="destination" id="destination-' + esc(d.id) + '">' +
        '<div class="destination__header"><h3 class="destination__title">' + esc(d.name) + '</h3>' +
        '<p class="destination__meta label">' + esc(d.dates) + '</p></div>' +
        '<div class="card-grid">' +
          (d.memories || []).map(m => cardMarkup(m, labelsOf(m))).join('') +
          (d.upcoming || []).map(placeholderMarkup).join('') +
        '</div></div>'
      ).join('') + '</section>';

    // Days run oldest first. Within a day, cards without a photo time come first (in file order),
    // then cards with one in time order.
    const dayTrip = t => {
      const items = (t.destinations || []).flatMap(d => (d.memories || []).map(m => ({ m: m })));
      items.forEach((x, i) => { x.i = i; x.t = firstTaken(x.m); });
      const days = {};
      items.forEach(x => { const k = x.m.date || ''; (days[k] = days[k] || []).push(x); });
      const keys = Object.keys(days).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (a < b ? -1 : a > b ? 1 : 0)));
      const block = (id, title, meta, cards, map) =>
        '<div class="destination day" id="' + id + '"><div class="destination__header"><h3 class="destination__title">' + esc(title) +
        '</h3><p class="destination__meta label">' + esc(meta) + '</p></div>' + (map || '') + '<div class="card-grid">' + cards + '</div></div>';
      const dayTitles = {};
      (t.days || []).forEach(x => { dayTitles[x.date] = x.title; });
      const dayBlocks = keys.map(k => {
        const list = days[k].slice().sort((a, b) => {
          if (a.t && b.t) return a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i;
          if (!a.t && !b.t) return a.i - b.i;
          return a.t ? 1 : -1;
        });
        const places = Array.from(new Set(list.map(x => x.m.place))).join(', ');
        const heading = k ? LABELS.day + ' ' + (keys.indexOf(k) + 1) + ' · ' + dayLabel(k) : LABELS.undated;
        return block('day-' + (k || 'undated'), heading,
          (dayTitles[k] ? dayTitles[k] + ' · ' : '') + places + ' · ' + list.filter(x => visited(x.m)).length + ' ' + LABELS.progressCollected,
          list.map(x => cardMarkup(x.m, labelsOf(x.m))).join(''),
          k && window.DayMap ? window.DayMap.markup(list.map(x => x.m)) : '');
      }).join('');
      const upcoming = (t.destinations || []).flatMap(d => d.upcoming || []);
      return '<section class="trip" id="trip-' + esc(t.id) + '">' + tripHead(t) + dayBlocks +
        (upcoming.length ? block('day-list', LABELS.onTheList, upcoming.length + ' ' + LABELS.progressUpcoming, upcoming.map(placeholderMarkup).join('')) : '') +
        '</section>';
    };

    /* Notes */
    const notes = data.fieldNotes || [];
    slot('notes').innerHTML = notes.map(n =>
      '<li class="note"><span class="note__label label">' + esc(n.label) + '</span><p class="note__text">' + esc(n.text) + '</p></li>'
    ).join('');
    if (!notes.length) slot('notes').closest('.notes').hidden = true;

    /* Drawing, filtering and the place/day switch */
    let galleries = [];
    let mode = 'day';
    let current = 'all';
    const apply = () => {
      document.querySelectorAll('.card').forEach(c => {
        const placeholder = c.classList.contains('card--placeholder');
        c.hidden = current === 'all' ? false : (placeholder || !c.dataset.category.split(' ').includes(current));
      });
      document.querySelectorAll('.destination').forEach(d => { d.hidden = !d.querySelector('.card:not([hidden])'); });
      document.querySelectorAll('.trip').forEach(t => { t.hidden = !t.querySelector('.card:not([hidden])'); });
      document.querySelectorAll('.filter').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === current)));
      requestAnimationFrame(() => galleries.forEach(g => g.sync()));
    };
    const draw = () => {
      slot('trips').innerHTML = trips.map(mode === 'day' ? dayTrip : placeTrip).join('');
      galleries = Array.from(document.querySelectorAll('.gallery[data-index]')).map(initGallery);
      apply();
      if (window.DayMap) window.DayMap.mount();
    };
    window.addEventListener('resize', () => galleries.forEach(g => g.realign()));
    slot('filters').addEventListener('click', e => {
      const b = e.target.closest('.filter');
      if (!b) return;
      current = b.dataset.filter;
      apply();
    });
    slot('views').innerHTML = [['day', LABELS.viewDay], ['place', LABELS.viewPlace]].map(v =>
      '<button type="button" class="view-btn" data-view="' + v[0] + '" aria-pressed="' + (v[0] === mode) + '">' + v[1] + '</button>').join('');
    slot('views').addEventListener('click', e => {
      const b = e.target.closest('.view-btn');
      if (!b || b.dataset.view === mode) return;
      mode = b.dataset.view;
      slot('views').querySelectorAll('.view-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    });
    draw();
  }

  loadContent().then(render).catch(err => {
    const target = slot('trips');
    if (target) target.innerHTML = '<p class="status-message">' + LABELS.loadError + '</p>';
    if (window.console) console.error(err);
  });
})();
