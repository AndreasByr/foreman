# Recommended third-party skills

Ask before installing anything. The human can say yes per skill, "all recommended" or none. Then ask the scope:

- **Global:** available in every project. Directory `~/.claude/skills`; for `npx skills add` the flag `-g` (`--global`).
- **Per project:** only in this repo. Directory `<repo>/.claude/skills`; `npx skills add` without `-g`, run inside the repo.

If `skills.recommended.json` exists in the foreman checkout or the project, read it: it holds name, repo URL, purpose and the global and project command for each skill, and it is the source of truth. Otherwise use this list.

| Skill | Source | Purpose | Command (project; add `-g` for global) |
|---|---|---|---|
| no-ai-slop | https://github.com/petergyang/no-ai-slop | sharper, more human texts; UI and landing copy | `npx skills add petergyang/no-ai-slop --skill no-ai-slop` |
| humanizer | https://github.com/blader/humanizer | rewrite text that reads machine-made | `git clone https://github.com/blader/humanizer.git <skills-dir>/humanizer` |
| hallmark | https://github.com/nutlope/hallmark | designed-looking pages and landing pages | `npx skills add nutlope/hallmark` |
| better-* | https://github.com/jakubkrehel/skills | interface review, accessibility, layout, typography, color, UI polish, writing, build from design | `npx skills add jakubkrehel/skills` |

`<skills-dir>` is `~/.claude/skills` (global) or `<repo>/.claude/skills` (project).

## How to run

1. Ask: which of the four (or "all recommended"), then global or per project. One question each, at most 3 at once.
2. After a yes and with a shell: run the command. Check the skill folder exists afterwards. Report the result in one line.
3. Without a shell: print the exact command for the chosen scope and say where to run it.
4. Skills copied into a project are project files. Mention that they follow their own licenses and are not part of foreman.
5. In the project `CLAUDE.md`, UI work reads the installed design skills and visible text follows the installed writing skills. The project's own design rules (`docs/design.md`) win on conflict. A skill suggestion for a disabled button state yields to the project rule when the project forbids disabled buttons.

When the installer was given `--recommended-skills`, do not run the commands again; confirm what it installed.
