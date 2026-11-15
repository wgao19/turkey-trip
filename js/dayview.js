/*
  DAY VIEW
  The By day view: one vertical scroll through the whole trip. Each day opens with a title panel (one banner
  colour, one arched cover photo), followed by one panel per stop with its photos and story. Beside it, a map
  and stop list stay fixed while the story scrolls; they follow whichever panel is in view.
  The day tabs, the map pins, the stop list and the Previous / Next buttons all scroll to a panel.

  app.js calls DayView.render(container, ctx). ctx supplies the shared helpers (see the list in app.js).
  Panels are the elements with [data-panel], in page order. Which one is current is worked out from the
  scroll position of .dayview__stage, so scrolling and clicking always agree.
*/
(function () {
  'use strict';

  const DAY_COLOURS = 5;   // --day-1-* to --day-5-* in css/tokens.css

  const LABELS = {
    dayOf: 'Day {n} of {total}',
    stats: '{stops} in a straight line',
    stopCount: 'Stop {n} of {total}',
    scrollHint: 'Scroll for the first stop',
    prevStop: 'Previous stop',
    prevDay: 'Day start',
    nextStop: 'Next stop',
    nextDay: 'Next day',
    firstStop: 'First stop',
    startOfTrip: 'Start',
    endOfTrip: 'End',
    days: 'Days',
    mapButton: 'Map',
    showMap: 'See the day’s map',
    closeMap: 'Close',
    list: 'List',
    stillToFind: 'Still to find',
    listTitle: 'On the list',
    undated: 'Undated',
    stopsOnDay: 'Stops on this day'
  };

  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const rad = d => d * Math.PI / 180;

  function distKm(a, b) {
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  const geoOf = m => {
    if (Array.isArray(m.geo) && m.geo.length === 2) return m.geo;
    const it = (m.media || []).find(i => Array.isArray(i.geo) && i.geo.length === 2);
    return it ? it.geo : null;
  };

  function render(container, ctx) {
    const esc = ctx.esc;
    const L = LABELS;

    /* ---- 1. Days ---- Oldest first. Within a day, cards without a photo time come first (file order),
       then cards with one in time order. The upcoming "on the list" slots become a last day. */
    const days = [];
    ctx.trips.forEach(t => {
      const items = (t.destinations || []).flatMap(d => (d.memories || []).map(m => ({ m: m })));
      items.forEach((x, i) => { x.i = i; x.t = ctx.firstTaken(x.m); });
      const byDate = {};
      items.forEach(x => { const k = x.m.date || ''; (byDate[k] = byDate[k] || []).push(x); });
      const keys = Object.keys(byDate).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (a < b ? -1 : a > b ? 1 : 0)));
      const titles = {};
      (t.days || []).forEach(x => { titles[x.date] = x.title; });
      keys.forEach(k => {
        const list = byDate[k].slice().sort((a, b) => {
          if (a.t && b.t) return a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i;
          if (!a.t && !b.t) return a.i - b.i;
          return a.t ? 1 : -1;
        }).map(x => x.m);
        days.push({
          kind: k ? 'day' : 'undated',
          iso: k,
          label: k ? ctx.dayLabel(k) : L.undated,
          short: k ? ctx.dayLabel(k).split(' ').slice(1).join(' ') : '?',
          title: titles[k] || Array.from(new Set(list.map(m => m.place))).join(', '),
          memories: list
        });
      });
    });
    const upcoming = ctx.trips.flatMap(t => (t.destinations || []).flatMap(d => d.upcoming || []));
    if (upcoming.length) {
      days.push({ kind: 'list', iso: '', label: L.listTitle, short: L.list, title: L.listTitle, memories: [], upcoming: upcoming });
    }
    let n = 0;
    days.forEach(d => { d.n = d.kind === 'list' ? '+' : ++n; });
    const total = n;

    const summaryOf = d => {
      if (d.kind === 'list') return plural(d.upcoming.length, 'place', 'places') + ' still to find';
      const g = d.memories.map(geoOf).filter(Boolean);
      let km = 0;
      for (let i = 1; i < g.length; i++) km += distKm(g[i - 1], g[i]);
      const stops = plural(d.memories.length, 'stop', 'stops');
      if (g.length < 2 || km < 0.1) return stops;
      const kmText = (km < 10 ? Math.round(km * 10) / 10 : Math.round(km)) + ' km';
      return stops + ', ' + fill(L.stats, { stops: kmText });
    };

    /* ---- 2. Panels ---- */
    const panels = [];   // { type: 'day' | 'stop', di, si }
    const openers = [];
    days.forEach((d, di) => {
      openers.push(panels.length);
      panels.push({ type: 'day', di: di, si: -1 });
      if (d.kind === 'list') panels.push({ type: 'list', di: di, si: 0 });
      else d.memories.forEach((m, si) => panels.push({ type: 'stop', di: di, si: si }));
    });
    const stopPanel = (di, si) => openers[di] + 1 + si;

    const colour = di => 'style="--day-bg:var(--day-' + (di % DAY_COLOURS + 1) + '-bg);--day-ink:var(--day-' + (di % DAY_COLOURS + 1) + '-ink)"';

    const coverOf = d => {
      for (let i = 0; i < d.memories.length; i++) {
        const it = (d.memories[i].media || [])[0];
        if (it && it.type !== 'video') return it;
        if (it && it.poster) return { file: it.poster, alt: it.alt };
      }
      return null;
    };

    const openerMarkup = (d, di) => {
      const cover = d.kind === 'list' ? null : coverOf(d);
      return '<section class="dayopen' + (cover ? '' : ' dayopen--text') + '" data-panel aria-label="' + esc(fill(L.dayOf, { n: d.n, total: total }) + ', ' + d.title) + '" ' + colour(di) + '>' +
        '<div class="dayopen__text">' +
          '<p class="dayopen__kicker">' + (d.kind === 'list' ? '' : '<b>' + esc(fill(L.dayOf, { n: d.n, total: total })) + '</b> ') + '<span>' + esc(d.kind === 'day' ? d.label : '') + '</span></p>' +
          '<h2 class="dayopen__title">' + esc(d.title) + '</h2>' +
          '<p class="dayopen__summary">' + esc(summaryOf(d)) + '</p>' +
          '<p class="dayopen__hint"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>' + esc(L.scrollHint) + '</p>' +
        '</div>' +
        (cover ? '<figure class="dayopen__cover"><div class="dayopen__arch"><img src="' + esc(cover.file) + '" alt="' + esc(cover.alt || '') + '"' +
          (cover.focus ? ' style="object-position:' + esc(cover.focus) + '"' : '') + ' draggable="false"></div></figure>' : '') +
        '</section>';
    };

    const stopMarkup = (m, si, d) => {
      const cats = ctx.cats(m);
      const chips = cats.map(c => '<li style="--accent:var(--category-' + esc(c) + ',var(--category-default))"><i></i>' + esc(ctx.categoryLabel(c)) + '</li>');
      if (m.status === 'partial') chips.push('<li class="is-status"><i></i>' + esc(ctx.LABELS.statusPartial) + '</li>');
      if (m.status === 'missed') chips.push('<li class="is-status"><i></i>' + esc(ctx.LABELS.statusMissed) + '</li>');
      const geo = geoOf(m);
      const link = m.mapLink
        ? '<a class="stop__map" href="' + esc(m.mapLink) + '" target="_blank" rel="noopener">' + esc(ctx.LABELS.googleMap) + '</a>'
        : geo ? '<a class="stop__map" href="' + esc(ctx.mapUrl(geo)) + '" target="_blank" rel="noopener">' + esc(ctx.LABELS.map) + '</a>' : '';
      return '<section class="stop" id="' + esc(m.id) + '" data-panel data-category="' + esc(cats.join(' ')) + '" data-status="' + esc(m.status || 'collected') + '" ' + ctx.accentStyle(cats[0]) + '>' +
        '<div class="stop__media">' + ctx.galleryMarkup(m) + ctx.captionMarkup(m) + '</div>' +
        '<article class="stop__story">' +
          '<header class="stop__head">' +
            '<p class="stop__meta"><b>' + esc(fill(L.stopCount, { n: si + 1, total: d.memories.length })) + '</b> <span>' + esc([m.area, m.period].filter(Boolean).join(', ')) + '</span></p>' +
            '<h3 class="stop__title">' + esc(m.title) + '</h3>' +
            '<ul class="stop__chips">' + chips.join('') + '</ul>' +
          '</header>' +
          '<p class="stop__lead">' + esc(m.summary) + '</p>' +
          ((m.details || []).length ? '<div class="stop__beats">' + m.details.map(t => '<p class="stop__beat">' + esc(t) + '</p>').join('') + '</div>' : '') +
          link +
        '</article></section>';
    };

    const listMarkup = (d, di) =>
      '<section class="stop stop--list" data-panel aria-label="' + esc(L.listTitle) + '">' +
        '<ul class="stop__upcoming">' + d.upcoming.map(u =>
          '<li><h3 class="stop__title">' + esc(u.title) + '</h3><p class="stop__lead">' + esc(u.hint) + '</p></li>').join('') + '</ul></section>';

    const nameOfPanel = q => q.type === 'day'
      ? (days[q.di].kind === 'day' ? 'Day ' + days[q.di].n + ', ' + days[q.di].title : days[q.di].title)
      : q.type === 'list' ? L.listTitle : days[q.di].memories[q.si].title;

    // On narrow screens there is no bottom bar and no Previous / Next: you scroll. The one extra control is a
    // "Show map" button at the end of each panel, which opens the map and stop list sheet. Hidden on wide screens.
    const navMarkup = () => '<button type="button" class="showmap" data-nav="map">' + esc(L.showMap) + '</button>';

    const stageHtml = panels.map((p, i) => {
      const d = days[p.di];
      const html = p.type === 'day' ? openerMarkup(d, p.di)
        : p.type === 'list' ? listMarkup(d, p.di)
        : stopMarkup(d.memories[p.si], p.si, d);
      return html.replace(/<\/section>$/, navMarkup() + '</section>');
    }).join('');

    const arrowDown = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
    const arrowUp = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

    container.innerHTML =
      '<div class="dayview">' +
        '<button type="button" class="dayview__scrim" tabindex="-1" aria-label="' + esc(L.closeMap) + '"></button>' +
        '<aside class="dayview__side" aria-label="' + esc(L.stopsOnDay) + '">' +
          '<div class="dayview__sidehead">' +
            '<button type="button" class="dayview__close">' + esc(L.closeMap) + '</button>' +
            '<p class="dayview__kicker"></p><h2 class="dayview__title"></h2><p class="dayview__summary"></p>' +
          '</div>' +
          '<div class="dayview__mapwrap"><div class="dayview__map daymap__canvas"></div>' +
            '<p class="dayview__mapnote"><span></span><a class="dayview__maplink" target="_blank" rel="noopener">' + esc(ctx.dayMapLabels.open) + '</a></p></div>' +
          '<div class="dayview__railwrap"><ol class="dayview__rail"></ol></div>' +
        '</aside>' +
        '<div class="dayview__main">' +
          '<div class="dayview__stage" tabindex="0" role="region" aria-label="Trip days">' + stageHtml + '</div>' +
          '<footer class="dayview__bar">' +
            '<button type="button" class="dayview__prev"></button>' +
            '<div class="dayview__where"><span class="dayview__wheretext"></span><span class="dayview__pips" aria-hidden="true"></span>' +
              '<button type="button" class="dayview__sheetbtn">' + esc(L.mapButton) + '</button></div>' +
            '<button type="button" class="dayview__next"></button>' +
          '</footer>' +
        '</div>' +
      '</div>';

    const root = container.querySelector('.dayview');
    const stage = root.querySelector('.dayview__stage');
    const side = root.querySelector('.dayview__side');
    const els = {
      kicker: side.querySelector('.dayview__kicker'),
      title: side.querySelector('.dayview__title'),
      summary: side.querySelector('.dayview__summary'),
      map: side.querySelector('.dayview__map'),
      note: side.querySelector('.dayview__mapnote span'),
      link: side.querySelector('.dayview__maplink'),
      rail: side.querySelector('.dayview__rail'),
      prev: root.querySelector('.dayview__prev'),
      next: root.querySelector('.dayview__next'),
      where: root.querySelector('.dayview__wheretext'),
      pips: root.querySelector('.dayview__pips')
    };
    const panelEls = Array.from(stage.querySelectorAll('[data-panel]'));

    /* ---- 3. Day tabs (in the banner) ---- */
    if (ctx.tabs) {
      ctx.tabs.innerHTML = '<nav class="daytabs" aria-label="' + esc(L.days) + '">' + days.map((d, di) =>
        '<button type="button" class="daytab" data-day="' + di + '" aria-label="' + esc((d.kind === 'day' ? fill(L.dayOf, { n: d.n, total: total }) + ', ' + d.label + ', ' : '') + d.title) + '">' +
        '<b>' + esc(d.n) + '</b><span>' + esc(d.short) + '</span></button>').join('') + '</nav>';
      ctx.tabs.querySelectorAll('.daytab').forEach(b => b.addEventListener('click', () => goTo(openers[Number(b.dataset.day)])));
    }
    const tabEls = ctx.tabs ? Array.from(ctx.tabs.querySelectorAll('.daytab')) : [];

    /* ---- 4. Current panel ---- */
    let cur = -1;
    let shownDay = -1;
    let map = null;
    let lock = 0;

    function buildSide(di) {
      const d = days[di];
      if (map) map.destroy();
      els.kicker.textContent = d.kind === 'day' ? fill(L.dayOf, { n: d.n, total: total }) + ', ' + d.label : '';
      els.title.textContent = d.title;
      els.summary.textContent = summaryOf(d);
      els.rail.innerHTML = d.memories.map((m, si) =>
        '<li><button type="button" class="rail__stop" data-stop="' + si + '" data-state="todo">' +
        '<span class="rail__dot">' + (si + 1) + '</span>' +
        '<span class="rail__text"><span class="rail__title">' + esc(m.title) + '</span><span class="rail__area">' + esc(m.area) + '</span></span></button></li>').join('');
      els.rail.querySelectorAll('.rail__stop').forEach(b => b.addEventListener('click', () => goTo(stopPanel(di, Number(b.dataset.stop)))));
      map = ctx.DayMap.create(els.map, d.memories, {
        onPick: si => goTo(stopPanel(di, si)),
        onNote: t => { els.note.textContent = t; }
      });
      els.note.textContent = map.note || '';
      els.link.hidden = !map.href;
      if (map.href) els.link.href = map.href;
      side.querySelector('.dayview__mapwrap').hidden = !d.memories.length;
      side.querySelector('.dayview__railwrap').hidden = !d.memories.length;
      shownDay = di;
    }

    function update(idx) {
      const p = panels[idx];
      const di = p.di;
      const d = days[di];
      const si = p.type === 'stop' ? p.si : -1;
      if (di !== shownDay) buildSide(di);
      if (map) map.setCurrent(si);
      els.rail.querySelectorAll('.rail__stop').forEach(b => {
        const i = Number(b.dataset.stop);
        b.setAttribute('data-state', i === si ? 'current' : i < si ? 'done' : 'todo');
        if (i === si) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      tabEls.forEach((t, i) => { if (i === di) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
      // On narrow screens the day strip scrolls sideways; keep the current day in view without moving the page.
      const strip = ctx.tabs;
      if (strip && tabEls[di] && strip.scrollWidth > strip.clientWidth) {
        strip.scrollTo({ left: tabEls[di].offsetLeft - (strip.clientWidth - tabEls[di].offsetWidth) / 2, behavior: 'auto' });
      }
      els.pips.innerHTML = d.memories.map((m, i) => '<i data-state="' + (i === si ? 'current' : i < si ? 'done' : 'todo') + '"></i>').join('');
      els.where.textContent = p.type === 'stop'
        ? 'Day ' + d.n + ', stop ' + (si + 1) + ' of ' + d.memories.length
        : d.kind === 'day' ? fill(L.dayOf, { n: d.n, total: total }) : d.title;

      const prev = panels[idx - 1], next = panels[idx + 1];
      const nameOf = q => q.type === 'day'
        ? (days[q.di].kind === 'day' ? 'Day ' + days[q.di].n + ', ' + days[q.di].title : days[q.di].title)
        : q.type === 'list' ? L.listTitle : days[q.di].memories[q.si].title;
      els.prev.disabled = !prev;
      els.prev.innerHTML = arrowUp + '<span><small>' + esc(prev ? (prev.type === 'day' ? L.prevDay : L.prevStop) : L.startOfTrip) + '</small><strong>' + esc(prev ? nameOf(prev) : 'Day 1') + '</strong></span>';
      els.next.disabled = !next;
      els.next.innerHTML = '<span><small>' + esc(next ? (next.type === 'day' ? L.nextDay : next.type === 'list' ? L.stillToFind : (p.type === 'day' ? L.firstStop : L.nextStop)) : L.endOfTrip) + '</small><strong>' + esc(next ? nameOf(next) : 'Last stop') + '</strong></span>' + arrowDown;
      cur = idx;
    }

    function goTo(idx) {
      idx = Math.max(0, Math.min(panels.length - 1, idx));
      closeSheet();
      lock = Date.now() + (ctx.reduceMotion() ? 0 : 900);
      stage.scrollTo({ top: panelEls[idx].offsetTop, behavior: ctx.reduceMotion() ? 'auto' : 'smooth' });
      update(idx);
    }

    // The current panel is the last one whose top has passed 40% of the way down the stage.
    let raf = 0;
    stage.addEventListener('scroll', () => {
      if (Date.now() < lock) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const probe = stage.scrollTop + stage.clientHeight * 0.4;
        let idx = 0;
        for (let i = 0; i < panelEls.length; i++) { if (panelEls[i].offsetTop <= probe) idx = i; }
        if (idx !== cur) update(idx);
      });
    }, { passive: true });

    stage.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-nav]');
      if (!b) return;
      openSheet();
    });
    els.prev.addEventListener('click', () => goTo(cur - 1));
    els.next.addEventListener('click', () => goTo(cur + 1));

    /* ---- 5. Map sheet on narrow screens ---- */
    function openSheet() { root.setAttribute('data-sheet', 'open'); }
    function closeSheet() { root.removeAttribute('data-sheet'); }
    root.querySelector('.dayview__sheetbtn').addEventListener('click', openSheet);
    root.querySelector('.dayview__close').addEventListener('click', closeSheet);
    root.querySelector('.dayview__scrim').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function onKey(e) {
      if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') closeSheet();
    });

    update(0);
    const galleries = Array.from(container.querySelectorAll('.gallery[data-index]')).map(ctx.initGallery);
    return {
      galleries: galleries,
      destroy: () => { if (map) map.destroy(); if (ctx.tabs) ctx.tabs.innerHTML = ''; }
    };
  }

  window.DayView = { render: render, labels: LABELS };
})();
