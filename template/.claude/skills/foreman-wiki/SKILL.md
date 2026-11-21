---
name: foreman-wiki
description: Write and maintain the user wiki in docs/wiki/ when wiki.enabled is true in .foreman.json and a milestone or release changes what users see, or when the maintainer asks for wiki pages. Sources come only from internal docs; pages are checked and published by hand at release time.
---

# Wiki pages

## When

- Load when `wiki.enabled` is `true` in `.foreman.json` and a milestone or release changes what users see, or when the maintainer asks for wiki pages.
- If `wiki.enabled` is not `true`, this skill does not apply.

## Sources

- Write only from internal docs that exist: `docs/requirements.md`, `docs/design.md`, `CHANGELOG.md`, and the user-facing parts of the change.
- Never invent a feature. If the sources do not say it, leave it out.
- Every page lists its sources in the head (`source:`).

## Audience and language

- One folder per audience: `docs/wiki/<audience-slug>/<page>.md`. Audience names come from `wiki.audiences` in `.foreman.json`.
- Slug: lowercase; ä becomes ae, ö oe, ü ue, ß ss; every other non-alphanumeric character becomes `-`. Example: "Spieler und Tester" becomes `spieler-und-tester`.
- Language: `wiki.language`, else `context.language`.
- Write for that audience's level. Short sentences. No internal vocabulary: no milestone, slice, fix pack, brief, ticket or STATE.

## Page format

```
---
audience: <name exactly as in .foreman.json>
source: <comma separated repo paths>
checked: no-ai-slop, humanizer
---

<body>
```

- The head is removed before upload. Readers see only the body.
- Write the `checked` line only after the text check below has run.

## Text check

- Run `/no-ai-slop` on every new or changed page, then `/humanizer`. Fix what they flag.
- Only then write `checked: no-ai-slop, humanizer`.
- Unchanged pages are not checked again.

## Never in the wiki

- Roast notes, open questions, logic gaps, briefs, fix packs, agent reports, roadmap details.
- Credentials, internal hosts or paths.
- Real project or person names. The repo is public: use placeholders.
- The publish scan refuses the whole run on a hit (terms from `wiki.forbidden`, hosts, secrets). Do not work around it. Remove the term and run again.

## Publishing

- Never automatic. Not from the post-merge hook, not from a batch run.
- Look first: `node scripts/docs-notion.mjs --wiki --dry-run`.
- Publish at release time: `node scripts/docs-notion.mjs --wiki`. Needs `NOTION_API_KEY` and `wiki.rootPageId`.
- Making the Notion page public (Notion Sites or a share link) is done by hand in Notion. The script cannot do it.

## Milestone todo

- Every milestone asks: does the wiki need an update?
- Write one line into its `STATE.md`: `Wiki: <pages affected>` or `Wiki: no change`. Only when the wiki is on.
