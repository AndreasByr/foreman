Status: fixpack · since 2026-11-28T08:41Z · plan written
Target: dev
Branch: claude/project-thread-octwvv
PR: -
Next: F3, F4
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
| F3 | fix | Link to audience overview | open | template/scripts/test-docs-wiki.mjs | - | - |
| F4 | fix | Archive last, exit 1 on failed pages | open | template/scripts/test-docs-wiki.mjs | - | - |
| F5 | docs | Skill foreman-wiki, CHANGELOG | open | bash scripts/test-changelog.sh | - | - |

Note: path correction, the sources live in `template/scripts/` (shipped to projects), not `scripts/`.

## Review

-

## Inherited red

-

## Log

- 08:41Z · plan written
