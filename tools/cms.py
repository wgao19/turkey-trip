#!/usr/bin/env python3
"""
Turkey Trip editor (CMS) helper. See cms/README.md for the whole flow.

  python3 tools/cms.py snapshot <out_dir>
      Builds the editor artifact's files in <out_dir>: the page (cms/index.html), a copy of
      content/, small photo thumbnails, and content/meta.json with the commit it came from.
      Prints FILES={published path: local path} for the Artifact publish call.

  python3 tools/cms.py addspec <adds.json> <asset_dir> <spec.json>
      Turns additions from the editor (new days, new places, photos for existing places) into a
      spec for tools/site.py. <adds.json> is a list of the editor's `adds` records, each with its
      doc `id`. Uploaded files must be in <asset_dir> named <asset id>.<ext>. Prints a JSON report:
      `slugs` (new place doc id -> card id), `skipped` (doc id -> what is missing).
      Then run: python3 tools/site.py apply <spec.json>

  python3 tools/cms.py apply <edits.json> [--force]
      Applies edits exported from the editor's database to content/*.json.
      <edits.json> is a list of {"id", "path", "value", "base"} records.
      An edit whose `base` no longer matches the file is a conflict and is skipped unless --force.
      Prints a JSON report: applied, unchanged, conflicts, missing.

Paths address a value inside the content files:
  ["destinations/istanbul.json", "memories", "id=blue-mosque", "media", "file=photos/blue-mosque-1.jpg", "alt"]
  first segment   file under content/
  "key=value"     the list item whose `key` equals value (id, file, date)
  "#n"            the list item at index n (field notes, upcoming slots)
  anything else   an object key
Setting an optional field to "" removes it, so the page falls back to its default.
Changing a card's `date` also updates its `collectedOn` display text.
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content')
OPTIONAL = {'hint'}
THUMB_PX = 480


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def step(node, seg):
    """Return the child of node at seg, or raise KeyError."""
    if isinstance(node, list):
        if seg.startswith('#'):
            return node[int(seg[1:])]
        key, _, val = seg.partition('=')
        for item in node:
            if isinstance(item, dict) and str(item.get(key)) == val:
                return item
        raise KeyError(seg)
    if isinstance(node, dict):
        return node[seg]
    raise KeyError(seg)


def norm(v):
    return None if v in (None, '') else v


def apply(edits_file, force=False):
    edits = load(edits_file)
    report = {'applied': [], 'unchanged': [], 'conflicts': [], 'missing': []}
    cache = {}
    for e in edits:
        path = e['path']
        try:
            fname = os.path.normpath(os.path.join(CONTENT, path[0]))
            if fname not in cache:
                cache[fname] = load(fname)
            node = cache[fname]
            for seg in path[1:-1]:
                node = step(node, seg)
            key = path[-1]
            if not isinstance(node, dict):
                raise KeyError(key)
        except (KeyError, IndexError, ValueError, OSError):
            report['missing'].append(e['id'])
            continue
        current = norm(node.get(key))
        value, base = norm(e.get('value')), norm(e.get('base'))
        if current == value:
            report['unchanged'].append(e['id'])
            continue
        if current != base and not force:
            report['conflicts'].append({'id': e['id'], 'path': path, 'base': base, 'current': current, 'value': value})
            continue
        if value is None and key in OPTIONAL:
            node.pop(key, None)
        else:
            node[key] = value if value is not None else ''
        if key == 'date' and value and 'collectedOn' in node:
            node['collectedOn'] = short_date(value)
        report['applied'].append(e['id'])
    for fname, data in cache.items():
        save(fname, data)
    print(json.dumps(report, ensure_ascii=False, indent=2))


def short_date(iso):
    d = datetime.date.fromisoformat(iso)
    return '%d %s' % (d.day, d.strftime('%b'))


def slugify(text):
    t = unicodedata.normalize('NFKD', text.replace('ı', 'i')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-') or 'place'


PLACE_REQUIRED = ('dest', 'date', 'title', 'area', 'category', 'period', 'summary')


def addspec(adds_file, asset_dir, out):
    adds = load(adds_file)
    site = load(os.path.join(CONTENT, 'site.json'))
    trip = site['trips'][-1]
    dests = [d for t in site['trips'] for d in t['destinations']]
    taken = set()
    for d in dests:
        taken |= {m['id'] for m in load(os.path.join(CONTENT, 'destinations', d + '.json'))['memories']}
    files = {os.path.splitext(f)[0]: os.path.join(asset_dir, f) for f in os.listdir(asset_dir)} if os.path.isdir(asset_dir) else {}
    blocks, report = {}, {'slugs': {}, 'skipped': {}}

    def block(dest):
        return blocks.setdefault(dest, {'trip': trip['id'], 'destination': dest, 'memories': []})

    def media_of(doc):
        items, missing = [], []
        for m in doc.get('media') or []:
            src = files.get(m.get('asset'))
            if not src:
                missing.append('file for %s' % (m.get('name') or m.get('asset')))
            elif not (m.get('alt') or '').strip():
                missing.append('caption for %s' % (m.get('name') or m.get('asset')))
            else:
                items.append({'src': src, 'alt': m['alt'].strip()})
        return items, missing

    for doc in adds:
        if doc.get('state', 'draft') != 'draft':
            continue
        kind = doc.get('kind')
        if kind == 'day':
            if doc.get('date') and (doc.get('title') or '').strip():
                block(dests[-1]).setdefault('days', []).append({'date': doc['date'], 'title': doc['title'].strip()})
            else:
                report['skipped'][doc['id']] = ['title']
        elif kind == 'photos':
            items, missing = media_of(doc)
            if missing or doc.get('dest') not in dests:
                report['skipped'][doc['id']] = missing or ['destination']
            elif items:
                block(doc['dest'])['memories'].append({'id': doc['memoryId'], 'media': items})
        elif kind == 'place':
            missing = [k for k in PLACE_REQUIRED if not doc.get(k)]
            items, mmissing = media_of(doc)
            if missing or mmissing or doc.get('dest') not in dests:
                report['skipped'][doc['id']] = missing + mmissing
                continue
            base = slugify(doc['title'])
            slug, n = base, 2
            while slug in taken:
                slug, n = '%s-%d' % (base, n), n + 1
            taken.add(slug)
            mem = {'id': slug, 'title': doc['title'].strip(), 'area': doc['area'].strip(),
                   'category': doc['category'] if len(doc['category']) > 1 else doc['category'][0],
                   'period': doc['period'].strip(), 'date': doc['date'], 'summary': doc['summary'].strip(),
                   'status': doc.get('status') or 'collected',
                   'details': [x for x in (doc.get('details') or []) if x.strip()], 'media': items}
            block(doc['dest'])['memories'].append(mem)
            report['slugs'][doc['id']] = slug
    save(out, list(blocks.values()))
    print(json.dumps(report, ensure_ascii=False, indent=2))


def thumb(src, dst):
    try:
        from PIL import Image
        with Image.open(src) as im:
            im.thumbnail((THUMB_PX, THUMB_PX))
            im.convert('RGB').save(dst, 'JPEG', quality=78, optimize=True)
    except ImportError:
        shutil.copyfile(src, dst)


def snapshot(out):
    os.makedirs(out, exist_ok=True)
    files = {}
    # Page
    shutil.copyfile(os.path.join(ROOT, 'cms', 'index.html'), os.path.join(out, 'index.html'))
    # Content
    site = load(os.path.join(CONTENT, 'site.json'))
    dests = [d for t in site.get('trips', []) for d in t.get('destinations', [])]
    paths = ['content/site.json'] + ['content/destinations/%s.json' % d for d in dests]
    for p in paths:
        os.makedirs(os.path.dirname(os.path.join(out, p)), exist_ok=True)
        shutil.copyfile(os.path.join(ROOT, p), os.path.join(out, p))
        files[p] = os.path.join(out, p)
    # Thumbnails: photos and video posters
    for d in dests:
        for m in load(os.path.join(CONTENT, 'destinations', d + '.json')).get('memories', []):
            for item in m.get('media', []):
                img = item.get('poster') if item.get('type') == 'video' else item.get('file')
                if not img or not os.path.exists(os.path.join(ROOT, img)):
                    continue
                rel = 'thumbs/' + os.path.basename(img)
                dst = os.path.join(out, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                thumb(os.path.join(ROOT, img), dst)
                files[rel] = dst
    # Where this snapshot came from
    def git(*args):
        return subprocess.run(['git', '-C', ROOT] + list(args), capture_output=True, text=True).stdout.strip()
    meta = {
        'commit': git('rev-parse', 'HEAD'),
        'commitDate': git('log', '-1', '--format=%cI'),
        'branch': git('rev-parse', '--abbrev-ref', 'HEAD'),
    }
    meta_path = os.path.join(out, 'content', 'meta.json')
    save(meta_path, meta)
    files['content/meta.json'] = meta_path
    print('FILES=' + json.dumps(files, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'snapshot':
        snapshot(sys.argv[2])
    elif len(sys.argv) >= 5 and sys.argv[1] == 'addspec':
        addspec(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) >= 3 and sys.argv[1] == 'apply':
        apply(sys.argv[2], force='--force' in sys.argv)
    else:
        print(__doc__)
        sys.exit(1)
