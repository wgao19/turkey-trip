#!/usr/bin/env python3
"""Add photos, videos and places to the collection from a small spec.

  python3 tools/site.py apply spec.json    compress media, upsert memories, validate
  python3 tools/site.py check              validate only

The root folder is the parent of tools/ (override with --root). It must contain
content/site.json, and content/destinations/<id>.json for any destination that
already exists. See AGENTS.md for the spec format.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

PHOTO_MAX = 1200          # longest side in px
PHOTO_QUALITY = 74
VIDEO_MAX_MB = 14         # the artifact allows 15 MB per file
VIDEO_EXT = ('.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv', '.3gp')
# (crf, max width for portrait video, max width for landscape video)
VIDEO_ATTEMPTS = [(28, 720, 1280), (32, 540, 960)]
GEO_DECIMALS = 3          # about 100 m: enough to find the place, not an exact doorstep
MEMORY_REQUIRED = ('title', 'area', 'category', 'period', 'summary')
MEMORY_ORDER = ('id', 'title', 'area', 'category', 'period', 'date', 'collectedOn', 'status',
                'statusLabel', 'emblem', 'summary', 'details', 'media')
SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
DATE = re.compile(r'^\d{4}-\d\d-\d\d$')
# (light, dark) colours handed out to new categories that do not name their own
CATEGORY_PALETTE = [('#0B7A5A', '#5FD2A7'), ('#B26A00', '#F2B45A'), ('#0A7EA4', '#6CCBEA'),
                    ('#A12B7C', '#E88CC8'), ('#5C6B00', '#C5D86A')]


def fail(msg):
    sys.exit('error: ' + msg)


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def ffmpeg_exe():
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        fail('ffmpeg not found. Run: pip install --break-system-packages imageio-ffmpeg')


def read_exif(src):
    """Date taken (ISO, with UTC offset) and rounded GPS position from the ORIGINAL photo, if present."""
    out = {}
    try:
        from PIL import Image
        ex = Image.open(src).getexif()
        sub = ex.get_ifd(0x8769)
        gps = ex.get_ifd(0x8825)
    except Exception:
        return out
    m = re.match(r'(\d{4}):(\d\d):(\d\d) (\d\d:\d\d:\d\d)', str(sub.get(36867) or ex.get(306) or ''))
    if m:
        out['takenAt'] = '%s-%s-%sT%s%s' % (m.group(1), m.group(2), m.group(3), m.group(4), sub.get(36880) or '')
    try:
        def deg(v, ref):
            d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
            return -d if ref in ('S', 'W') else d
        if gps.get(2) and gps.get(4):
            out['geo'] = [round(deg(gps[2], gps.get(1)), GEO_DECIMALS), round(deg(gps[4], gps.get(3)), GEO_DECIMALS)]
    except Exception:
        pass
    return out


def short_date(iso):
    d = datetime.date.fromisoformat(iso)
    return '%d %s' % (d.day, d.strftime('%b'))


def add_category_tokens(root, c, index):
    """Add --category-<id> to css/tokens.css (light block and both dark blocks). True if written."""
    path = os.path.join(root, 'css/tokens.css')
    if not os.path.exists(path):
        return False
    css = open(path, encoding='utf-8').read()
    if '--category-%s:' % c['id'] in css:
        return False
    light, dark = CATEGORY_PALETTE[index % len(CATEGORY_PALETTE)]
    light, dark = c.get('color', light), c.get('colorDark', dark)
    try:
        cuts = [css.index(':root{'), css.index(':root:not([data-theme="light"]){'), css.index(':root[data-theme="dark"]{')]
    except ValueError:
        return False
    cuts.append(len(css))
    for n in (2, 1, 0):
        lo, hi = cuts[n], cuts[n + 1]
        last = None
        for m in re.finditer(r'^([ \t]*)--category-[a-z0-9-]+:[^;]+;[ \t]*\n', css[lo:hi], re.M):
            last = m
        if last is None:
            return False
        at = lo + last.end()
        css = css[:at] + '%s--category-%s:%s;\n' % (last.group(1), c['id'], light if n == 0 else dark) + css[at:]
    open(path, 'w', encoding='utf-8').write(css)
    return True


def process_photo(src, dest):
    from PIL import Image, ImageOps
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    im.thumbnail((PHOTO_MAX, PHOTO_MAX), Image.LANCZOS)
    # No exif argument: location and camera metadata are dropped.
    im.save(dest, 'JPEG', quality=PHOTO_QUALITY, optimize=True, progressive=True)


def process_video(src, dest, poster):
    ff = ffmpeg_exe()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    ok = False
    for crf, pw, lw in VIDEO_ATTEMPTS:
        vf = "scale=w='if(gt(iw,ih),min(%d,iw),min(%d,iw))':h=-2" % (lw, pw)
        cmd = [ff, '-y', '-loglevel', 'error', '-i', src, '-vf', vf,
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf), '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-map_metadata', '-1', dest]
        subprocess.run(cmd, check=True)
        if os.path.getsize(dest) <= VIDEO_MAX_MB * 1024 * 1024:
            ok = True
            break
    if not ok:
        fail('%s is still over %d MB after compression. Trim it to a shorter clip.' % (os.path.basename(src), VIDEO_MAX_MB))
    for t in ('0.5', '0'):
        subprocess.run([ff, '-y', '-loglevel', 'error', '-ss', t, '-i', dest, '-frames:v', '1', '-q:v', '4', poster], check=True)
        if os.path.exists(poster) and os.path.getsize(poster) > 0:
            break


def used_paths(dest):
    used = set()
    for m in dest.get('memories', []):
        for it in m.get('media', []):
            used.add(it.get('file'))
            used.add(it.get('poster'))
    return used


def add_media(root, dest, mem, item, changed):
    src = item.get('src')
    if not src or not os.path.exists(src):
        fail('media source not found: %s' % src)
    if not item.get('alt'):
        fail('every media item needs "alt" (what it shows): %s' % src)
    kind = item.get('type') or ('video' if src.lower().endswith(VIDEO_EXT) else 'photo')
    used = used_paths(dest)
    n = len(mem['media']) + 1
    while True:
        photo = 'photos/%s-%d.jpg' % (mem['id'], n)
        video = 'videos/%s-%d.mp4' % (mem['id'], n)
        poster = 'photos/%s-%d-poster.jpg' % (mem['id'], n)
        taken = {photo, video, poster}
        if not (taken & used) and not any(os.path.exists(os.path.join(root, p)) for p in taken):
            break
        n += 1
    if kind == 'video':
        process_video(src, os.path.join(root, video), os.path.join(root, poster))
        changed[video] = os.path.join(root, video)
        changed[poster] = os.path.join(root, poster)
        mem['media'].append({'type': 'video', 'file': video, 'poster': poster, 'alt': item['alt']})
    else:
        meta = read_exif(src)          # read before the copy drops it
        meta.update({k: item[k] for k in ('takenAt', 'geo') if item.get(k)})
        process_photo(src, os.path.join(root, photo))
        changed[photo] = os.path.join(root, photo)
        entry = {'file': photo, 'alt': item['alt']}
        if item.get('focus'):
            entry['focus'] = item['focus']
        entry.update(meta)
        mem['media'].append(entry)


def upsert_memory(root, dest, spec, changed):
    mid = spec.get('id')
    if not mid or not SLUG.match(mid):
        fail('memory needs a lowercase-hyphen "id", got %r' % mid)
    mem = next((m for m in dest['memories'] if m['id'] == mid), None)
    if mem is None:
        missing = [k for k in MEMORY_REQUIRED if not spec.get(k)]
        if missing:
            fail('memory "%s" is not in destination "%s", so it is treated as new and is missing: %s. '
                 'To extend an existing place, use the spec block for the destination it lives in.'
                 % (mid, dest['id'], ', '.join(missing)))
        mem = {'id': mid, 'status': 'collected', 'details': [], 'media': []}
        dest['memories'].append(mem)
        gone = {str(spec['title']).lower(), str(spec.get('fills', '')).lower()}
        dest['upcoming'] = [u for u in dest.get('upcoming', []) if u['title'].lower() not in gone]
    for k, v in spec.items():
        if k in ('id', 'media', 'details', 'fills'):
            continue
        mem[k] = v
    for line in spec.get('details', []):
        if line not in mem['details']:
            mem['details'].append(line)
    for item in spec.get('media', []):
        add_media(root, dest, mem, item, changed)
    if not mem.get('date'):
        taken = sorted(i['takenAt'] for i in mem['media'] if i.get('takenAt'))
        if taken:
            mem['date'] = taken[0][:10]
    if not DATE.match(str(mem.get('date', ''))):
        fail('memory "%s" needs "date" (YYYY-MM-DD): its photos carry no date taken' % mid)
    if not mem.get('collectedOn'):
        mem['collectedOn'] = short_date(mem['date'])
    ordered = {k: mem[k] for k in MEMORY_ORDER if k in mem}
    ordered.update({k: v for k, v in mem.items() if k not in ordered})
    mem.clear()
    mem.update(ordered)


def find_trip(site, t):
    tid = t.get('id') if isinstance(t, dict) else t
    if not tid:
        return site['trips'][-1] if site['trips'] else None
    return next((x for x in site['trips'] if x['id'] == tid), None)


def apply_one(root, spec, changed):
    site_path = os.path.join(root, 'content/site.json')
    site = load(site_path)
    site_dirty = False

    t = spec.get('trip')
    trip = find_trip(site, t)
    if isinstance(t, dict):
        if trip is None:
            if not t.get('name'):
                fail('a new trip needs "name"')
            trip = {'id': t['id'], 'name': t['name'], 'dates': t.get('dates', ''), 'destinations': []}
            site['trips'].append(trip)
        else:
            for k in ('name', 'dates'):
                if t.get(k):
                    trip[k] = t[k]
        site_dirty = True
    if trip is None:
        fail('trip not found; pass "trip": {"id", "name", "dates"} to create one')

    for dd in spec.get('days', []):
        days = trip.setdefault('days', [])
        hit = next((x for x in days if x['date'] == dd['date']), None)
        if hit:
            hit['title'] = dd['title']
        else:
            days.append({'date': dd['date'], 'title': dd['title']})
            days.sort(key=lambda x: x['date'])
        site_dirty = True

    d = spec.get('destination')
    if not d:
        fail('spec needs "destination": an id, or {"id","name","dates"} for a new one')
    did = d if isinstance(d, str) else d.get('id')
    if not did or not SLUG.match(did):
        fail('destination needs a lowercase-hyphen id, got %r' % did)
    dpath = os.path.join(root, 'content/destinations/%s.json' % did)
    if os.path.exists(dpath):
        dest = load(dpath)
        if isinstance(d, dict):
            for k in ('name', 'dates'):
                if d.get(k):
                    dest[k] = d[k]
    else:
        if not isinstance(d, dict) or not d.get('name'):
            fail('destination %s does not exist yet: pass {"id","name","dates"}' % did)
        dest = {'id': did, 'name': d['name'], 'dates': d.get('dates', ''), 'memories': [], 'upcoming': []}
    if not any(did in x['destinations'] for x in site['trips']):
        trip['destinations'].append(did)
        site_dirty = True

    for ms in spec.get('memories', []):
        upsert_memory(root, dest, ms, changed)
    for u in spec.get('upcomingAdd', []):
        if not any(x['title'].lower() == u['title'].lower() for x in dest['upcoming']):
            dest['upcoming'].append({'title': u['title'], 'hint': u.get('hint', '')})
    for title in spec.get('upcomingRemove', []):
        dest['upcoming'] = [u for u in dest['upcoming'] if u['title'].lower() != title.lower()]

    for c in spec.get('categories', []):
        if not any(x['id'] == c['id'] for x in site['categories']):
            if not SLUG.match(c['id']):
                fail('category id must be lowercase-hyphen, got %r' % c['id'])
            site['categories'].append({'id': c['id'], 'label': c['label']})
            site_dirty = True
            if add_category_tokens(root, c, len(site['categories']) - 1):
                changed['css/tokens.css'] = os.path.join(root, 'css/tokens.css')
            else:
                print('note: add --category-%s to css/tokens.css (light and both dark blocks) or it shows grey' % c['id'])
    if spec.get('profile'):
        site['profile'].update(spec['profile'])
        site_dirty = True
    for n in spec.get('fieldNotes', []):
        site.setdefault('fieldNotes', []).append(n)
        site_dirty = True

    save(dpath, dest)
    changed['content/destinations/%s.json' % did] = dpath
    if site_dirty:
        save(site_path, site)
        changed['content/site.json'] = site_path


def apply(root, spec):
    """spec is one destination block, or a list of them (one run, one publish)."""
    changed = {}
    for block in (spec if isinstance(spec, list) else [spec]):
        apply_one(root, block, changed)
    problems = check(root, quiet=True)
    if problems:
        fail('validation failed:\n  ' + '\n  '.join(problems))
    print('ok: %d changed files' % len(changed))
    print('FILES=' + json.dumps(changed, ensure_ascii=False))


def check(root, quiet=False):
    problems = []
    site = load(os.path.join(root, 'content/site.json'))
    cats = {c['id'] for c in site['categories']}
    seen = set()
    for tr in site['trips']:
        for did in tr['destinations']:
            p = os.path.join(root, 'content/destinations/%s.json' % did)
            if not os.path.exists(p):
                continue  # not downloaded here; nothing to check
            dest = load(p)
            if dest.get('id') != did:
                problems.append('%s: id does not match file name' % did)
            for m in dest.get('memories', []):
                mid = m.get('id')
                if mid in seen:
                    problems.append('duplicate memory id %s' % mid)
                seen.add(mid)
                mcats = m.get('category')
                for cid in (mcats if isinstance(mcats, list) else [mcats]):
                    if cid not in cats:
                        problems.append('%s: unknown category %r' % (mid, cid))
                if m.get('status') not in ('collected', 'partial', 'missed'):
                    problems.append('%s: status must be collected, partial or missed' % mid)
                for k in MEMORY_REQUIRED:
                    if not m.get(k):
                        problems.append('%s: missing %s' % (mid, k))
                if not DATE.match(str(m.get('date', ''))):
                    problems.append('%s: date must be YYYY-MM-DD' % mid)
                for it in m.get('media', []):
                    if not it.get('alt'):
                        problems.append('%s: media without alt (%s)' % (mid, it.get('file')))
                    if it.get('type') == 'video' and not it.get('poster'):
                        problems.append('%s: video without poster' % mid)
    if not quiet:
        if problems:
            print('\n'.join(problems))
            sys.exit(1)
        print('ok: %d memories checked' % len(seen))
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('apply')
    a.add_argument('spec')
    sub.add_parser('check')
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    if args.cmd == 'apply':
        apply(root, load(args.spec))
    else:
        check(root)


if __name__ == '__main__':
    main()
