/*
  DAY MAP
  Draws a small route map for one day: numbered pins joined by a dashed line, a scale bar and a stop list.
  The SVG is a to-scale sketch that works anywhere. Where the page can reach OpenStreetMap (GitHub Pages
  can; the Claude artifact frame cannot), mount() swaps it for a live Leaflet map with real tiles.
  A stop's position is the memory's own `geo` ([lat, lon]) or the first photo's `geo`. Memories with
  neither are left off the map and named underneath. app.js calls DayMap.markup(memories) once per day.
*/
(function () {
  'use strict';

  const W = 640, H = 360, PAD = 48, BOTTOM = 22, MIN_SPAN_KM = 1;
  const NICE_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20];

  const LABELS = {
    title: 'Route of the day',
    open: 'Open in Maps',
    stop: 'stop',
    stops: 'stops',
    straight: 'in a straight line',
    unmapped: 'Not on the map',
    north: 'N',
    note: 'To-scale sketch, north up. Positions are approximate.',
    liveNote: 'Positions are approximate.'
  };

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cats = m => (Array.isArray(m.category) ? m.category : [m.category]).filter(Boolean);
  const accent = m => 'var(--category-' + esc(cats(m)[0] || 'default') + ',var(--category-default))';
  const rad = d => d * Math.PI / 180;
  const r1 = n => Math.round(n * 10) / 10;

  function geoOf(m) {
    if (Array.isArray(m.geo) && m.geo.length === 2) return m.geo;
    const it = (m.media || []).find(i => Array.isArray(i.geo) && i.geo.length === 2);
    return it ? it.geo : null;
  }

  function distKm(a, b) {
    const dLat = rad(b[0] - a[0]);
    const dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  const lengthLabel = km => (km < 1 ? Math.round(km * 1000) + ' m' : (Math.round(km * 10) / 10) + ' km');
  const point = g => g[0] + ',' + g[1];

  function mapsUrl(stops) {
    if (stops.length === 1) {
      return 'https://www.google.com/maps/search/?api=1&query=' + point(stops[0].g);
    }
    const mid = stops.slice(1, -1).slice(0, 9).map(s => point(s.g)).join('|');
    return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=' + point(stops[0].g) +
      '&destination=' + point(stops[stops.length - 1].g) + (mid ? '&waypoints=' + encodeURIComponent(mid) : '');
  }

  // Lay the stops out in an equal-area sketch: kilometres east and north of the average position.
  function layout(stops) {
    const lat0 = stops.reduce((n, s) => n + s.g[0], 0) / stops.length;
    const lon0 = stops.reduce((n, s) => n + s.g[1], 0) / stops.length;
    const kx = 111.32 * Math.cos(rad(lat0));
    const ky = 110.57;
    stops.forEach(s => { s.x = (s.g[1] - lon0) * kx; s.y = -(s.g[0] - lat0) * ky; });
    const xs = stops.map(s => s.x), ys = stops.map(s => s.y);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const spanX = Math.max(maxX - minX, MIN_SPAN_KM), spanY = Math.max(maxY - minY, MIN_SPAN_KM);
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD - BOTTOM) / spanY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    stops.forEach(s => {
      s.ox = W / 2 + (s.x - cx) * scale;
      s.oy = (H - BOTTOM) / 2 + (s.y - cy) * scale;
      s.px = s.ox;
      s.py = s.oy;
    });
    // Pins that land on top of each other fan out around the first one.
    stops.forEach((s, i) => {
      let n = 0, base = null;
      for (let j = 0; j < i; j++) {
        if (Math.hypot(s.ox - stops[j].ox, s.oy - stops[j].oy) < 24) { n++; base = base || stops[j]; }
      }
      if (n) {
        const a = rad(-40 + n * 75);
        s.px = base.ox + 24 * Math.cos(a);
        s.py = base.oy + 24 * Math.sin(a);
      }
    });
    return { scale: scale, cx: cx, cy: cy };
  }

  function svgMarkup(stops, geo, titleText) {
    const scale = geo.scale;
    let bar = NICE_KM[0];
    NICE_KM.forEach(k => { if (k * scale <= 150) bar = k; });
    const barPx = bar * scale;

    // Faint grid, one square per scale-bar length, so distances can be read off.
    const kmLeft = geo.cx - (W / 2) / scale, kmRight = geo.cx + (W / 2) / scale;
    const kmTop = geo.cy - ((H - BOTTOM) / 2) / scale, kmBottom = geo.cy + ((H - BOTTOM) / 2) / scale;
    let grid = '';
    for (let gx = Math.ceil(kmLeft / bar) * bar; gx < kmRight; gx += bar) {
      const x = r1(W / 2 + (gx - geo.cx) * scale);
      grid += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>';
    }
    for (let gy = Math.ceil(kmTop / bar) * bar; gy < kmBottom; gy += bar) {
      const y = r1((H - BOTTOM) / 2 + (gy - geo.cy) * scale);
      grid += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';
    }

    let route = '', arrows = '';
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      route += '<line x1="' + r1(a.px) + '" y1="' + r1(a.py) + '" x2="' + r1(b.px) + '" y2="' + r1(b.py) + '"/>';
      const len = Math.hypot(b.px - a.px, b.py - a.py);
      if (len > 44) {
        const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
        const ang = Math.atan2(b.py - a.py, b.px - a.px) * 180 / Math.PI;
        arrows += '<polygon points="6,0 -5,-5 -5,5" transform="translate(' + r1(mx) + ' ' + r1(my) + ') rotate(' + r1(ang) + ')"/>';
      }
    }

    const pins = stops.map((s, i) =>
      '<g><circle class="daymap__pin" cx="' + r1(s.px) + '" cy="' + r1(s.py) + '" r="13" style="fill:' + accent(s.m) + '"/>' +
      '<text class="daymap__num" x="' + r1(s.px) + '" y="' + r1(s.py) + '">' + (i + 1) + '</text></g>').join('');

    const sx = 18, sy = H - 12;
    const scaleBar =
      '<path class="daymap__scale" d="M' + sx + ' ' + (sy - 5) + 'V' + sy + 'H' + r1(sx + barPx) + 'V' + (sy - 5) + '"/>' +
      '<text class="daymap__scale-text" x="' + sx + '" y="' + (sy - 9) + '">' + lengthLabel(bar) + '</text>';
    const north =
      '<g transform="translate(' + (W - 22) + ' 26)"><path class="daymap__north-arrow" d="M0 -12L6 6L0 2L-6 6Z"/>' +
      '<text class="daymap__north" x="0" y="22">' + LABELS.north + '</text></g>';

    return '<svg class="daymap__svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(titleText) + '">' +
      '<title>' + esc(titleText) + '</title>' +
      '<g class="daymap__grid">' + grid + '</g>' +
      '<g class="daymap__route">' + route + '</g>' +
      '<g class="daymap__arrows">' + arrows + '</g>' +
      pins + scaleBar + north + '</svg>';
  }

  // Returns the map block for one day, or '' when none of that day's stops has a position.
  function markup(memories) {
    const stops = [], missing = [];
    (memories || []).forEach(m => {
      const g = geoOf(m);
      if (g) stops.push({ m: m, g: g }); else missing.push(m);
    });
    if (!stops.length) return '';

    const geo = layout(stops);
    let total = 0;
    for (let i = 1; i < stops.length; i++) total += distKm(stops[i - 1].g, stops[i].g);

    const count = stops.length + ' ' + (stops.length === 1 ? LABELS.stop : LABELS.stops);
    const summary = stops.length > 1 ? count + ' · ' + lengthLabel(total) + ' ' + LABELS.straight : count;
    const titleText = LABELS.title + ': ' + stops.map((s, i) => (i + 1) + ' ' + s.m.title).join(', ');

    const list = stops.map((s, i) =>
      '<li><a class="daymap__stop" href="#' + esc(s.m.id) + '">' +
      '<i class="daymap__dot" style="background:' + accent(s.m) + '">' + (i + 1) + '</i>' +
      '<span class="daymap__stop-title">' + esc(s.m.title) + '</span>' +
      '<span class="daymap__stop-area label">' + esc(s.m.area) + '</span></a></li>').join('');

    return '<div class="daymap">' +
      '<div class="daymap__head"><span class="label">' + LABELS.title + '</span>' +
      '<a class="daymap__link label" href="' + esc(mapsUrl(stops)) + '" target="_blank" rel="noopener">' + LABELS.open + '</a></div>' +
      '<div class="daymap__canvas" data-stops="' + esc(JSON.stringify(stops.map((s, i) => [s.g[0], s.g[1], i + 1, cats(s.m)[0] || 'default']))) + '">' +
      svgMarkup(stops, geo, titleText) + '</div>' +
      '<p class="daymap__summary label">' + esc(summary) + ' · ' + LABELS.note + '</p>' +
      '<ol class="daymap__stops">' + list + '</ol>' +
      (missing.length
        ? '<p class="daymap__missing label">' + LABELS.unmapped + ': ' + missing.map(m => esc(m.title)).join(', ') + '</p>'
        : '') +
      '</div>';
  }

  /* Live map: loads Leaflet and OpenStreetMap tiles when the page allows it.
     If the tiles cannot load, the sketch above simply stays. */
  const LEAFLET = 'vendor/leaflet/'; // Leaflet 1.9.4, bundled in the repo
  let leafletReady = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
      if (!document.querySelector('link[href$="leaflet.css"]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = LEAFLET + 'leaflet.css';
        document.head.appendChild(css);
      }
      const js = document.createElement('script');
      js.src = LEAFLET + 'leaflet.js';
      js.onload = () => resolve();
      js.onerror = () => reject(new Error('leaflet'));
      document.head.appendChild(js);
    });
    return leafletReady;
  }

  function mountOne(box) {
    if (box.dataset.live) return;
    box.dataset.live = '1';
    let pts;
    try { pts = JSON.parse(box.dataset.stops); } catch (e) { return; }
    loadLeaflet().then(() => {
      const L = window.L;
      const el = document.createElement('div');
      el.className = 'daymap__live';
      el.style.visibility = 'hidden';
      box.appendChild(el);
      const map = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomSnap: 0.5 });
      const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);
      const ll = pts.map(p => [p[0], p[1]]);
      // The route takes its colour from the --color-highlight token, so it follows the theme.
      const route = getComputedStyle(box).getPropertyValue('--color-highlight').trim() || '#0E8F8C';
      if (ll.length > 1) L.polyline(ll, { color: route, weight: 3, dashArray: '7 6' }).addTo(map);
      pts.forEach(p => L.marker([p[0], p[1]], {
        icon: L.divIcon({
          className: 'daymap__marker',
          html: '<span style="background:var(--category-' + esc(p[3]) + ',var(--category-default))">' + p[2] + '</span>',
          iconSize: [26, 26], iconAnchor: [13, 13]   // match --size-pin in css/tokens.css
        })
      }).addTo(map));
      map.fitBounds(ll, { padding: [36, 36], maxZoom: 16 });
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        el.style.visibility = '';
        const svg = box.querySelector('.daymap__svg');
        if (svg) svg.style.display = 'none';
        const note = box.parentNode.querySelector('.daymap__summary');
        if (note) note.textContent = note.textContent.replace(LABELS.note, LABELS.liveNote);
        map.invalidateSize();
      };
      layer.on('tileload', show);
      setTimeout(() => { if (!shown) { map.remove(); el.remove(); } }, 15000);
    }).catch(() => {});
  }

  function mount() {
    document.querySelectorAll('.daymap__canvas').forEach(mountOne);
  }

  window.DayMap = { markup: markup, mount: mount };
})();
