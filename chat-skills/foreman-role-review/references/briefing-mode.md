# Briefing mode

`foreman-brief` calls this before a milestone brief, or an order with a user interface, is written and shown for approval.

1. **Existing state.** If the affected area already runs on staging or dev (a predecessor milestone, a page the milestone changes), run all five roles on those screens. Ask for the test environment as in the prerequisites. Nothing running yet: skip and say so.
2. **Boards.** Check new or changed boards in the design reference with role 1 (UX), role 2 (UI against reference and design file) and role 5 (focus states present, token contrasts computed, target sizes, labels, error and status states). No staging needed.
3. **Risk preview.** Roles 3 and 4 cannot try anything on a board. They name the edges, error paths, permissions and tenant boundaries that the brief must cover as success criteria.
4. **Result.** Report `docs/role-reviews/<unit>-briefing.md` in three parts: findings on the boards (work in before the board is approved), findings on the existing state (into the brief or a separate fix pack after approval), risk preview (becomes success criteria in the brief).

The approval gate holds here too: in briefing mode nothing goes to the coding side. The report feeds `foreman-brief` and the human.
