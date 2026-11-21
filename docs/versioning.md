# Versioning, tags and changelog

Single source for version numbers, tags and the changelog process. Other files point here.

## Scheme

`0.MINOR.PATCH` until launch. The minor stands for the roadmap phase, not for size.

| State | Version |
|---|---|
| Before production: each milestone of the first roadmap | `0.0.1`, `0.0.2`, ... (counting only, no tags) |
| First merge to `prod` | `0.1.0` |
| Fix for the released line after the first release | `0.1.1`, `0.1.2`, ... |
| Collected release of the next roadmap (`dev` to `main` to `prod`) | `0.2.0` |
| Each further roadmap | `0.N.0`, then patches |
| Launch | `1.0.0` |

Rules:

1. The minor changes only when the roadmap phase changes. The patch rises only for fixes of the current line. The next roadmap is collected and released as one version.
2. A release is a deploy to `prod`. Whether it holds a milestone, several small tasks or a hotfix does not change the number; the changelog tells the difference.
3. `0.0.x` versions before the first production deploy are not tags.
4. After launch SemVer applies: patch for fixes, minor for features, major for breaking changes.
5. **The human sets the number.** From `0.1.0` on, an Agent never decides a version itself (tag, changelog file name and header). It proposes one with a reason and asks before it creates a tag or changelog file, also for patch releases. Only the `0.0.x` counting needs no question.

## Tags

1. Tags exist only for production states, on commits of `prod`. Never on `dev` or `main`.
2. Format `vMAJOR.MINOR.PATCH`, for example `v0.1.0`.
3. A tag means "ran on production": it is set only after the production verify job is green.
4. CI sets the tag (`tag-release`). Without it, the Agent sets a tag only when the release order names it; otherwise the report says the tag is missing and which version it should carry.
5. The proposal for the next version is the last tag plus patch for a fix of the released line, and the planned minor for the collected release.
6. Tags are never moved or deleted.

## Changelog

1. One file per production release: `docs/changelog/vX.Y.Z.md`.
2. It is created on the branch that is released (fix: work branch from `main`; collected release: `dev`) and travels to `prod`. The version is the one agreed with the human.
3. Layout:
   ```markdown
   ---
   version: 0.1.1
   date: 2026-01-31
   milestone: M022        # optional, only if the release completes a milestone
   ---

   ## English
   ### New
   - ...
   ### Improved
   - ...
   ### Fixed
   - ...
   ```
   Add further language sections after `## English` if the project needs them, in the same order every time. Optionally group points by app area with `#### <Area>` under a category; then every point of that category sits under an area, never mixed with points directly under the `###`. Area names are free text and appear in the same order in every language.
4. Write for users, not developers. Internal changes (CI, refactoring, tooling, tests) do not appear. Empty categories are left out.
5. Technical details belong in the agent reports under `docs/agent-reports/`, not in the changelog.
6. The Agent drafts it from the changes brought to `main` since the last tag. The human approves it; it goes with the release PR.
7. The files are the data source for a possible in-app changelog page, so header fields and layout must not vary.
