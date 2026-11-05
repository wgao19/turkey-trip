/*
  EMBLEMS
  The hand-drawn artwork for each place, as small SVG drawings on a 120 x 80 canvas.
  A memory picks one with "emblem": "<name>" in content/trips.json.
  Unknown or missing names fall back to "pin", so a new place never needs new artwork.

  Drawing conventions for a new emblem:
  - Add a function to SHAPES that returns SVG shapes (no <svg> wrapper).
  - Use these class names on shapes, nothing else:
      f    solid accent fill          f3   mid tint fill        f2   soft tint fill
      ln   accent outline, no fill    cut  thin surface-coloured detail line
      bg   surface-coloured fill      gem  highlight-coloured fill
  - Keep the drawing inside x 0-120, y 0-80 and sit it on y = 76.
  - Add the name to GROUND if it should stand on a faint ground line.
  render() rewrites the short class names into the BEM names that css/page.css styles.
*/
(function () {
  const CLASS_MAP = {
    f: 'emblem__fill',
    f2: 'emblem__fill-soft',
    f3: 'emblem__fill-mid',
    ln: 'emblem__line',
    cut: 'emblem__cut',
    bg: 'emblem__paper',
    gem: 'emblem__gem'
  };

  // A slim minaret: x position, top y, optional balcony y positions.
  const mnr = (x, top, bal) => {
    const b = (bal || []).map(y => `<rect class="f" x="${x - 1.4}" y="${y}" width="6.4" height="1.8" rx=".6"/>`).join('');
    return `<path class="f" d="M${x} 76V${top + 9}h3.6V76z"/><path class="f" d="M${x - 0.4} ${top + 9}l2.2-9 2.2 9z"/>${b}`;
  };

  const SHAPES = {
    obelisk: () =>
      `<path class="f2" d="M40 76h40v-7H40z"/><path class="f3" d="M48 69h24v-7H48z"/>` +
      `<path class="f" d="M55 62L57.4 14h5.2L65 62z"/><path class="f" d="M57.4 14L60 4l2.6 10z"/>` +
      `<path class="cut" d="M60 22v6M58.6 34h2.8M59.4 42v5M60 54v4"/>`,

    hagia: () =>
      mnr(6, 24) + mnr(110, 24) +
      `<path class="f2" d="M22 76V56h76v20z"/>` +
      `<path class="f3" d="M22 56Q24 44 38 46v10z"/><path class="f3" d="M98 56Q96 44 82 46v10z"/>` +
      `<path class="f" d="M38 56a22 22 0 0 1 44 0z"/>` +
      `<path class="cut" d="M44 52v-4M50 52v-6M56 52v-7M64 52v-7M70 52v-6M76 52v-4"/>` +
      `<path class="ln" d="M60 34v-6"/>`,

    blue: () =>
      mnr(6, 18) + mnr(16, 24) + mnr(30, 32) + mnr(86, 32) + mnr(100, 24) + mnr(110, 18) +
      `<path class="f2" d="M34 76V58h52v18z"/>` +
      `<path class="f3" d="M34 58a9 9 0 0 1 18 0z"/><path class="f3" d="M68 58a9 9 0 0 1 18 0z"/>` +
      `<path class="f" d="M43 58a17 17 0 0 1 34 0z"/>` +
      `<path class="ln" d="M60 41v-6"/>`,

    cistern: () => {
      const xs = [24, 48, 72, 96];
      const cols = xs.map(x =>
        `<path class="f" d="M${x - 3} 26h6v34h-6z"/><path class="f" d="M${x - 5} 22h10v4H${x - 5}z"/><path class="f" d="M${x - 4} 60h8v3h-8z"/>` +
        `<path class="f2" d="M${x - 3} 67h6v9h-6z"/>`).join('');
      const arches = xs.slice(0, -1).map((x, i) =>
        `<path class="ln" d="M${x} 22Q${x + 12} 8 ${xs[i + 1]} 22"/>`).join('');
      return arches + cols +
        `<path class="ln" d="M6 64.5h108"/>` +
        `<path class="ln" opacity=".5" d="M8 72q4-3 8 0t8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0 8 0"/>` +
        `<ellipse class="f" cx="60" cy="70" rx="4.4" ry="1.9"/><path class="f" d="M55.8 70l-3.6-2.2v4.4z"/>`;
    },

    suleymaniye: () =>
      mnr(6, 14, [26, 36, 46]) + mnr(18, 24, [34, 44]) + mnr(98, 24, [34, 44]) + mnr(110, 14, [26, 36, 46]) +
      `<path class="f3" d="M28 76V58h64v18z"/>` +
      `<path class="f2" d="M28 58a12 12 0 0 1 24 0z"/><path class="f2" d="M68 58a12 12 0 0 1 24 0z"/>` +
      `<path class="f" d="M40 58a20 20 0 0 1 40 0z"/>` +
      `<path class="ln" d="M60 38v-6"/><circle class="f" cx="60" cy="30" r="1.8"/>`,

    treasure: () =>
      `<g transform="rotate(-28 44 42)">` +
      `<path class="f" d="M44 6l7 38H37z"/>` +
      `<path class="cut" d="M44 12v28"/>` +
      `<rect class="f2" x="33" y="44" width="22" height="4" rx="1"/>` +
      `<rect class="f3" x="40" y="48" width="8" height="18" rx="2"/>` +
      `<circle class="gem" cx="44" cy="53" r="2.4"/><circle class="gem" cx="44" cy="60" r="2.4"/>` +
      `<circle class="f" cx="44" cy="70" r="5"/><circle class="gem" cx="44" cy="70" r="2"/>` +
      `</g>` +
      `<path class="f2" d="M88 14c12 14 20 26 12 40-4 8-20 8-24 0-8-14 0-26 12-40z"/>` +
      `<path class="cut" d="M88 14v42M76 54l12 2 12-2M80 32h16M78 44h20"/>` +
      `<path class="ln" d="M88 14c12 14 20 26 12 40-4 8-20 8-24 0-8-14 0-26 12-40z"/>`,

    harem: () =>
      `<rect class="f2" x="25" y="34" width="5" height="42"/><rect class="f2" x="90" y="34" width="5" height="42"/>` +
      `<path class="f2" d="M36 76V36Q36 16 60 6Q84 16 84 36V76z"/>` +
      `<path class="f" d="M46 76V40Q46 26 60 18Q74 26 74 40V76z"/>` +
      `<rect class="bg" x="53" y="37" width="14" height="14" rx="1"/>` +
      `<rect class="bg" x="53" y="37" width="14" height="14" rx="1" transform="rotate(45 60 44)"/>` +
      `<path class="cut" d="M60 56v18M54 62h12M54 70h12"/>`,

    // Generic fallback: a map pin. Used when a place has no emblem of its own.
    pin: () =>
      `<path class="f" d="M60 4c-12 0-20 9-20 20 0 15 20 36 20 36s20-21 20-36c0-11-8-20-20-20z"/>` +
      `<circle class="bg" cx="60" cy="24" r="8"/>` +
      `<ellipse class="ln" opacity=".5" cx="60" cy="68" rx="22" ry="5"/>`,

    // Used by the empty "upcoming" cards.
    plus: () =>
      `<circle class="ln" cx="60" cy="40" r="20" stroke-dasharray="3 5"/><path class="ln" d="M60 31v18M51 40h18"/>`
  };

  const GROUND = { obelisk: 1, hagia: 1, blue: 1, suleymaniye: 1, harem: 1 };

  function render(name) {
    const key = SHAPES[name] ? name : 'pin';
    const inner = SHAPES[key]() + (GROUND[key] ? '<path class="ln" opacity=".5" d="M2 76.5h116"/>' : '');
    const body = inner.replace(/class="(f|f2|f3|ln|cut|bg|gem)"/g, (_, k) => `class="${CLASS_MAP[k]}"`);
    return `<svg class="emblem" viewBox="0 0 120 80" aria-hidden="true">${body}</svg>`;
  }

  window.Emblems = { render, names: Object.keys(SHAPES) };
})();
