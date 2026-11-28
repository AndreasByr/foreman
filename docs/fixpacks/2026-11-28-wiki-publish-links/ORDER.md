Target: dev
Milestone: -
Batch-branch: batch/dev
Urgent: no
Mode: fix pack
Fix-pack: 2026-11-28-wiki-publish-links
Version: patch (Unreleased)
Tracker: -

(Project names and hosts left out: the repo is public. Module: `docs-notion`, files under `template/scripts/`.)

F1 Fix: Wiki root that is a Notion wiki (database). `createPage` posts `parent: {page_id: root}` and gets 404; the sync archives orphans first, then fails to create, ends with exit 0 and an empty wiki.
  Expected: top-level pages try `page_id` first. On 400/404 ask `GET /databases/<root>` once; if a database, read the name of the `title` property and create with `parent: {database_id}` and `properties: {<titleName>: {title: [...]}}`. Result cached for the run. Subpages stay `page_id`. Page roots cost no extra request.
  Acceptance: fake Notion with database root (title property `Seite`, `page_id` on root = 404): audience pages created with `database_id`, subpages with `page_id`, second run `unchanged` without new POST.

F2 Fix: Relative `.md` links between wiki pages stay plain text in Notion.
  Expected: `transformWikiLinks`, `resolveWikiTarget`, `wikiLinkProblems` in `docs-wiki.mjs`. Relative `.md` links resolve against the source file; anchors dropped, titles ("..", '..', (..)) removed, `%20` decoded; code spans and fenced code untouched (same fence rule as the markdown converter); code spans in link text allowed. Scan: link to a file that is no wiki page = `broken link` with line number (CRLF safe via `parseHead` `bodyLine`), exit 4 before any request, also with `--dry-run`. Publish: links rewritten to `https://www.notion.so/<id>`; targets not yet existing are written in a second pass using only the IDs `runSync` returns (no new readExisting, no create, no archive, never delete `child_page` blocks, each page counted once). Still open links: `unresolved link`, exit 1. `runSync` also returns `ids`. `richText` normalizes link URLs for comparison (`/<32hex>`, `/<uuid>`, `https://www.notion.so/[title-]<id>`), so the next run is `unchanged`.
  Acceptance: cross-audience links, next run unchanged, broken link exit 4 without request, external links untouched, anchors, titles, code spans, CRLF, `/<id>` read-back. Tests red before, green after; `test-docs-notion.mjs` stays green.

F3 Fix (optional, small): Link to the audience overview. A relative link to the audience folder (`./` or `../<slug>/`) is rewritten at publish to the audience page ID that `runSync` knows. Folder without audience = `broken link`. Next run `unchanged`.

F4 Fix (optional, recommended, keep small): archive only after all new pages are created; exit 1 when pages failed. Today a run can empty the wiki and end green.

F5 Docs: skill `foreman-wiki`: relative `.md` links allowed (become Notion links), link to a missing page stops the run, `wiki.rootPageId` may be a page or a Notion wiki (database); optional pattern for multilingual wikis (one audience per language, switcher line `**A** · [B](../b/<file>)`). No project-specific wording. CHANGELOG: Unreleased entry for a patch version (New/Fixed/Upgrade), mention F3 and F4 if built.
