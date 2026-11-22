# Rolling out a foreman update to existing projects

For anyone who runs foreman in one or more projects and wants to bring them to a newer version (for example 0.2.x). The update itself is `./install.sh <project path> --update`; the chat skill `foreman-update` compares versions, lists the changes and writes the order. This folder holds the generic order and checklist.

Nothing here runs against a project by itself. Copy `update-order.md` once per project, fill in the placeholders, and work through it.

## Order of rollout

With more than one project:

1. Start with the project that is cheapest to break (a test project, a copy, or a small project). Its result is the go/no-go for the rest.
2. Go only when every box under "After the update" is checked and no own edit was lost. No-go: stop, report what failed, do not retry on a live project.
3. Then the next project, fully done before the one after it.

## How to use it

1. In the chat say "update foreman" (skill `foreman-update`) and name the project and the foreman version or checkout.
2. Copy `docs/rollout/update-order.md` per project, fill in the header, paste the order into Claude Code.
3. Work the checklist outside the repo, then the "After the update" checks.
4. Optional: run `node scripts/measure.mjs` in the project to get its own numbers (`docs/metrics.md`).

The foreman version and the release are separate decisions of the maintainer; an update order never sets a version, tag or release.
