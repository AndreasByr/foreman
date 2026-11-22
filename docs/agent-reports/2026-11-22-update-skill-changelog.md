# Fix: foreman-update finds the changelog itself

**Cause:** the skill read `VERSION` and `CHANGELOG.md` only from "the foreman checkout or release the human names". In chat there is no checkout and the skill did not know the source repository, so it asked the human.

**Fix:** the skill fetches `VERSION`, `CHANGELOG.md`, `update-classes.json` and `docs/MODULES.md` from the public raw URLs of `AndreasByr/foreman`. Tag from the latest release (`tag_name`, no `v` prefix), fallback `main`. It asks only if both lookups fail.

**Evidence:** `bash scripts/test-update-skill.sh` red at ae8bacb (check F), green after the fix; `bash scripts/test-all.sh` exit 0. Roles: `execution_simple` (two tasks), no escalation.

**Changelog lines:** Fixed: `foreman-update` in chat fetches the changelog, version and module list from GitHub instead of asking for them.

**Open:** the plugin already says 0.2.2 (`plugin.json`, `VERSION`). Users with an older installed plugin must update it; the skill fix reaches them only in a release (0.2.3 recommended).

## Learned

- A chat skill must name its source repo and fetch files itself; "the checkout the human names" does not exist in chat.
