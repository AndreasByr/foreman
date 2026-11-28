Status: uat-ready · since 2026-11-28T10:21Z · merged to dev, waiting for UAT
Target: dev
Branch: claude/project-thread-octwvv
PR: #42 (merged to dev a5f4473)
Next: UAT by the human; release only on go
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-28-wiki-publish-links

Start commit: 4936e5a

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F1 | fix | Database root (Notion wiki) | done | template/scripts/test-docs-wiki.mjs | rc=1 on lib at 4936e5a, rc=0 on b9b3772 | b9b3772 |
| F2 | fix | Links between wiki pages | done | test-docs-wiki.mjs, test-docs-notion.mjs | rc=1 (20 not ok) on lib of b9b3772, rc=0 on cdd40a1 | cdd40a1 |
| F3 | fix | Link to audience overview | done | test-docs-wiki.mjs | rc=1 (7 not ok) on lib of ed23c40+F2, rc=0 on b8c9766 | b8c9766 |
| F4 | fix | No archiving of file-less pages after a failed run | done | test-docs-wiki.mjs | same run as F3; R1 test red/green on 1a4dddc | b8c9766, 1a4dddc |
| F5 | docs | Skill foreman-wiki, CHANGELOG | done | bash scripts/test-changelog.sh | ok | e7befbd |

Note: path correction, the sources live in `template/scripts/` (shipped to projects), not `scripts/`.

## Review

Round 1 (validation, opus): F2 pass, F3 pass, F5 pass, F1 needs-attention (low: real-Notion check of reading a database root, UAT), F4 needs-attention (medium A: moved page copied again on every failed run). Rework R1 (1a4dddc): fixed A, fixed D (folder links need a slash). Open, low: B (code span containing ']' in a link label is not a link in Notion), C (failed pass-2 update leaves an empty page; existing updatePage pattern). Reported, not changed.

## Inherited red

-

## Log

- 08:41Z · plan written
