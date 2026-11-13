#!/usr/bin/env python3
"""
Turkey Trip editor (CMS) helper. See cms/README.md for the whole flow.

  python3 tools/cms.py snapshot <out_dir>
      Builds the editor artifact's files in <out_dir>: the page (cms/index.html), a copy of
      content/, small photo thumbnails, and content/meta.json with the commit it came from.
      Prints FILES={published path: local path} for the Artifact publish call.

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
"""
import json
import os
import shutil
import subprocess
import sys

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
        report['applied'].append(e['id'])
    for fname, data in cache.items():
        save(fname, data)
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
    elif len(sys.argv) >= 3 and sys.argv[1] == 'apply':
        apply(sys.argv[2], force='--force' in sys.argv)
    else:
        print(__doc__)
        sys.exit(1)
