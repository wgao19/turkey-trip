/*
  DAY MAP
  The map beside the day view (js/dayview.js). DayMap.create(box, memories, options) draws numbered pins
  joined by a dashed line, a scale bar and a north arrow into `box`, and returns a handle:
    setCurrent(i)   mark stop i (index into the day's memories) as current; earlier stops as done
    destroy()       remove the live map, if one was mounted
    href            a Google Maps link for the day's route, or ''
    note            one line for under the map
    mapped          how many stops have a position
  The SVG is a to-scale sketch that works anywhere. Where the page can reach OpenStreetMap (GitHub Pages
  can; the Claude artifact frame cannot), the sketch is swapped for a live Leaflet map with real tiles.
  A stop's position is the memory's own `geo` ([lat, lon]) or the first photo's `geo`. Memories with
  neither have no pin. options.onPick(i) is called when a pin is pressed.
*/
(function () {
  'use strict';

  const W = 500, H = 400, PAD = 56, FAN = 40, FAN_RADIUS = 30, MIN_SPAN_KM = 0.6;
  const NICE_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

  const LABELS = {
    open: 'Open in Maps',
    sketch: 'Sketch to scale, north up',
    live: 'Positions are approximate',
    noPin: ' has no pin',
    noPins: ' have no pin',
    stop: 'stop',
    stops: 'stops',
    none: 'No locations for this day',
    north: 'N'
  };

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rad = d => d * Math.PI / 180;
  const r1 = n => Math.round(n * 10) / 10;
  const point = g => g[0] + ',' + g[1];

  function geoOf(m) {
    if (Array.isArray(m.geo) && m.geo.length === 2) return m.geo;
    const it = (m.media || []).find(i => Array.isArray(i.geo) && i.geo.length === 2);
    return it ? it.geo : null;
  }

  function mapsUrl(stops) {
    if (stops.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + point(stops[0].g);
    const mid = stops.slice(1, -1).slice(0, 9).map(s => point(s.g)).join('|');
    return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=' + point(stops[0].g) +
      '&destination=' + point(stops[stops.length - 1].g) + (mid ? '&waypoints=' + encodeURIComponent(mid) : '');
  }

  // An equal-area sketch: kilometres east and north of the average position, scaled to fit.
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
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    stops.forEach(s => {
      s.ox = W / 2 + (s.x - cx) * scale;
      s.oy = H / 2 + (s.y - cy) * scale;
      s.px = s.ox;
      s.py = s.oy;
    });
    // Pins that land on top of each other fan out around the first one.
    stops.forEach((s, i) => {
      let n = 0, base = null;
      for (let j = 0; j < i; j++) {
        if (Math.hypot(s.ox - stops[j].ox, s.oy - stops[j].oy) < FAN_RADIUS) { n++; base = base || stops[j]; }
      }
      if (n) {
        const a = rad(-40 + n * 75);
        s.px = base.ox + FAN * Math.cos(a);
        s.py = base.oy + FAN * Math.sin(a);
      }
    });
    return scale;
  }

  const stateOf = (i, cur) => (i === cur ? 'current' : i < cur ? 'done' : 'todo');
  const pinInner = n => '<span class="daymap__pin-dot">' + n + '</span>';

  /* Live map: loads Leaflet and OpenStreetMap tiles when the page allows it.
     If the tiles cannot load, the sketch simply stays. */
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

  function create(box, memories, options) {
    const opts = options || {};
    const stops = [];
    let unmapped = 0;
    (memories || []).forEach((m, i) => {
      const g = geoOf(m);
      if (g) stops.push({ i: i, m: m, g: g }); else unmapped++;
    });
    const handle = { setCurrent: function () {}, destroy: function () {}, href: '', mapped: stops.length };
    if (!stops.length) {
      box.innerHTML = '<p class="daymap__empty">' + LABELS.none + '</p>';
      handle.note = LABELS.none;
      return handle;
    }

    const scale = layout(stops);
    let bar = NICE_KM[0];
    NICE_KM.forEach(k => { if (k * scale <= 120) bar = k; });
    const barPx = bar * scale;
    const unmappedNote = unmapped ? '. ' + unmapped + (unmapped === 1 ? LABELS.noPin : LABELS.noPins) : '';
    handle.href = mapsUrl(stops);
    handle.note = LABELS.sketch + unmappedNote;
    const liveNote = LABELS.live + unmappedNote;

    const line = (from, to) => stops.slice(from, to + 1).map((s, k) => (k ? 'L' : 'M') + r1(s.px) + ' ' + r1(s.py)).join(' ');
    const label = s => (s.i + 1) + ', ' + s.m.title;

    box.innerHTML =
      '<div class="daymap__sketch">' +
        '<svg class="daymap__svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
          '<defs><pattern id="daymap-grid" width="' + r1(barPx) + '" height="' + r1(barPx) + '" patternUnits="userSpaceOnUse">' +
            '<path class="daymap__grid" d="M' + r1(barPx) + ' 0H0V' + r1(barPx) + '"/></pattern></defs>' +
          '<rect width="' + W + '" height="' + H + '" fill="url(#daymap-grid)"/>' +
          '<path class="daymap__todo" d=""/><path class="daymap__done" d=""/>' +
          '<path class="daymap__scalebar" d="M16 ' + (H - 12) + 'V' + (H - 6) + 'H' + r1(16 + barPx) + 'V' + (H - 12) + '"/>' +
          '<text class="daymap__scaletext" x="16" y="' + (H - 18) + '">' + (bar < 1 ? Math.round(bar * 1000) + ' m' : bar + ' km') + '</text>' +
          '<g class="daymap__northmark" transform="translate(' + (W - 22) + ' 28)"><path d="M0 -12L6 6L0 2L-6 6Z"/><text x="0" y="26">' + LABELS.north + '</text></g>' +
        '</svg>' +
        stops.map(s =>
          '<button type="button" class="daymap__pin" data-stop="' + s.i + '" data-state="todo" aria-label="' + esc(label(s)) + '"' +
          ' style="left:' + r1(s.px / W * 100) + '%;top:' + r1(s.py / H * 100) + '%">' + pinInner(s.i + 1) + '</button>').join('') +
      '</div>';

    const todoPath = box.querySelector('.daymap__todo');
    const donePath = box.querySelector('.daymap__done');
    const pins = Array.from(box.querySelectorAll('.daymap__pin'));
    let live = null;      // { map, markers, todo, done }
    let current = -1;
    let destroyed = false;

    const pick = i => { if (opts.onPick) opts.onPick(i); };
    pins.forEach(b => b.addEventListener('click', () => pick(Number(b.dataset.stop))));

    function paint() {
      // k = the last mapped stop at or before the current one
      let k = -1;
      stops.forEach((s, n) => { if (s.i <= current) k = n; });
      const last = stops.length - 1;
      const from = Math.max(k, 0);
      todoPath.setAttribute('d', last > from ? line(from, last) : '');
      donePath.setAttribute('d', k >= 1 ? line(0, k) : '');
      pins.forEach(b => b.setAttribute('data-state', stateOf(Number(b.dataset.stop), current)));
      if (live) {
        const ll = stops.map(s => [s.g[0], s.g[1]]);
        live.todo.setLatLngs(last > from ? ll.slice(from) : []);
        live.done.setLatLngs(k >= 1 ? ll.slice(0, k + 1) : []);
        live.markers.forEach((mk, n) => {
          const el = mk.getElement();
          if (el) el.setAttribute('data-state', stateOf(stops[n].i, current));
        });
      }
    }
    handle.setCurrent = i => { current = i; paint(); };

    loadLeaflet().then(() => {
      if (destroyed) return;
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
      const ll = stops.map(s => [s.g[0], s.g[1]]);
      // Route colours come from design tokens, so they follow the theme.
      const css = getComputedStyle(box);
      const todoColor = css.getPropertyValue('--color-text-muted').trim() || '#4D5664';
      const doneColor = css.getPropertyValue('--color-done').trim() || '#1F4E5F';
      const todo = L.polyline([], { color: todoColor, weight: 3, dashArray: '7 6' }).addTo(map);
      const done = L.polyline([], { color: doneColor, weight: 6 }).addTo(map);
      const markers = stops.map(s => {
        const mk = L.marker([s.g[0], s.g[1]], {
          icon: L.divIcon({
            className: 'daymap__marker',
            html: '<button type="button" class="daymap__pin" aria-label="' + esc(label(s)) + '">' + pinInner(s.i + 1) + '</button>',
            iconSize: [44, 44], iconAnchor: [22, 22]
          }),
          keyboard: false
        }).addTo(map);
        mk.on('click', () => pick(s.i));
        return mk;
      });
      map.fitBounds(ll, { padding: [40, 40], maxZoom: 16 });
      live = { map: map, markers: markers, todo: todo, done: done };
      let shown = false;
      const show = () => {
        if (shown || destroyed) return;
        shown = true;
        el.style.visibility = '';
        const sketch = box.querySelector('.daymap__sketch');
        if (sketch) sketch.style.display = 'none';
        map.invalidateSize();
        paint();
        if (opts.onNote) opts.onNote(liveNote);
      };
      layer.on('tileload', show);
      setTimeout(() => { if (!shown) { map.remove(); el.remove(); live = null; } }, 15000);
    }).catch(() => {});

    handle.destroy = () => {
      destroyed = true;
      if (live) { live.map.remove(); live = null; }
    };
    return handle;
  }

  window.DayMap = { create: create, labels: LABELS };
})();
