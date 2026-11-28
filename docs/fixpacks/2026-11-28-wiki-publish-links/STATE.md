Status: fixpack · since 2026-11-28T08:41Z · plan written
Target: dev
Branch: claude/project-thread-octwvv
PR: -
Next: F1 test red, then fix
Batch-branch: batch/dev
Lock: free
Tracker: -
Pretest-round: 0

# Fix pack 2026-11-28-wiki-publish-links

Start commit: 4936e5a

## Points

| # | Type (fix / analysis) | Title | Status (open / in progress / done / blocked) | Check (test file or command) | Red → green (SHA) | Commit |
|---|---|---|---|---|---|---|
| F1 | fix | Database root (Notion wiki) | open | template/scripts/test-docs-wiki.mjs | - | - |
| F2 | fix | Links between wiki pages | open | template/scripts/test-docs-wiki.mjs, test-docs-notion.mjs | - | - |
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
