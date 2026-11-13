# Turkey Trip Editor (CMS)

A private Claude artifact where Wei edits the text on the site: card titles, summaries, notes, photo captions and descriptions, day titles, field notes and so on. Edits are saved as drafts, so she can stop and come back. When she presses **Ship**, Claude turns the drafts into a pull request.

- Editor: https://claude.ai/artifact/BzbJGtK2NjTGdP1MYn5ftT
- Page source: `cms/index.html` (published as the artifact's `index.html`)
- Helper: `tools/cms.py` (`snapshot` builds the artifact files, `apply` writes edits into `content/`)

## How it fits together

```
 GitHub main ──snapshot──▶ editor artifact (content copy + thumbnails)
                               │  Wei edits → drafts in the artifact database (collection "edits")
                               │  Ship → ship/request = "requested" + message to the Claude session
                               ▼
 Claude: read drafts → tools/cms.py apply → commit → PR → mark drafts "shipped"
                               │
 PR merged ──────────────────▶ Claude: snapshot main again → republish → clear merged drafts
```

The artifact cannot fetch from GitHub itself (its sandbox blocks other hosts), so Claude re-publishes the content copy after each merge or when Wei presses **Sync from GitHub**. Until then the page still works out what's live: a draft whose value already matches the content copy is treated as done, and one whose starting value no longer matches is shown as "Changed on GitHub" for Wei to resolve.

## Database layout

| Path | Body |
| --- | --- |
| `edits/<id>` | `{path, value, base, state: "draft"\|"shipped", pr?, updatedAt}`. `path` addresses the value (see `tools/cms.py`), `base` is the value when editing started. |
| `ship/request` | `{status, requestedAt, updatedAt, count, note, editIds, notified, prUrl, prNumber, message}`. `status` is `requested`, `in_progress`, `pr_open`, `merged`, `error` or `sync_requested`. |

Only Editors and the owner can write (`write: "admin"`).

## Runbook for Claude: ship request

1. Read `ship/request` and list `edits` with the ArtifactData tool on the editor URL. Set `ship/request` to `{status: "in_progress", updatedAt}`.
2. Branch: `git fetch origin main` and start the designated branch from `origin/main`. If an earlier editor PR is still open, add to that branch instead.
3. Save the records with `state: "draft"` as a JSON list of `{id, path, value, base}` (`id` is the doc id) and run `python3 tools/cms.py apply <file>`.
4. Look at `git diff`. Check copy against AGENTS.md content rules, but do not rewrite Wei's wording. Report anything odd rather than changing it.
5. Commit ("Editor: …" summary of what changed), push, and open a PR. List conflicts and missing paths in the PR body.
6. In one ArtifactData batch: update each applied edit to `{state: "shipped", pr: <number>}`, delete the `unchanged` ones, and set `ship/request` to `{status: "pr_open", prUrl, prNumber, message: "<n> edits in PR #<n>. Merge it on GitHub to publish.", updatedAt}`. On failure set `{status: "error", message}`.
7. Subscribe to the PR's activity so the merge wakes the session.

Conflicts (`base` no longer matches the file) are skipped. Leave them as drafts. The editor shows them as "Changed on GitHub" so Wei can choose.

## Runbook for Claude: sync (after a merge, or on request)

1. `git fetch origin main` and check out `origin/main` (or the designated branch reset to it).
2. `python3 tools/cms.py snapshot <scratch dir>` prints `FILES={…}`.
3. Publish with the Artifact tool: `url` = the editor URL, `file_path` = `<scratch dir>/index.html`, `files` = the FILES map. Omit `capabilities` to keep them. Changes to `cms/index.html` ship the same way.
4. Delete `edits` docs whose `value` now equals the content (the merged ones). Set `ship/request` to `{status: "merged", message: "Live on the site. Editor synced to <short sha>.", updatedAt}`, or for a plain sync, back to its previous status (`idle` if none).

## Capabilities the page declares

```json
{
  "db": {"rules": [{"path": "", "read": "view", "write": "admin"}]},
  "user": {},
  "mcp": {"servers": [{"server": "Claude Code Remote", "tools": ["send_message"]}]}
}
```

`mcp` lets the Ship and Sync buttons message the Claude Code session named in `SESSION_ID` in `cms/index.html`. If that fails (connector not allowed, session gone), the page shows a sentence to paste into any Claude chat. A new session can pick up the work from this file.
