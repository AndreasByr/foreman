# Design first

Applies to a milestone or fix item with new or changed UI: page, tab, dialog, component, control, layout. The board is made in the chat before the order goes out. The Agent never creates boards and never builds UI without an approved one.

1. **Read what exists:** the design reference (artifact or `docs/design-reference/`) and `design.md`. Find the affected boards.
2. **Create or change the board.** Take existing screens over and add only what is new. Show every state: normal, empty, loading, error, permissions (who sees what), focus, mobile at 320 px. If WCAG is required, recompute token contrasts and plan click targets of at least 24 x 24 px. Follow the project's design rules from `design.md`. Texts: no explanatory sentence under a heading, no eyebrow labels, no hint without an action. Default rules unless `design.md` says otherwise: no sliders or carousels without a requirement, no disabled buttons (leave them clickable and show the missing input at the field on click), font sizes relative (`rem`), never `px`. New tokens or components also go into `design.md`.
3. **Role review on the boards,** then fix the findings, then show the board. One sentence per board on what is new. Wait for explicit approval ("approved", "looks good", "go"). Apply change requests and show again. Without approval no order with this UI goes out.
4. **After approval:** commit the board sources and a changed `design.md` to the batch branch of the order under `docs/design-reference/` (work branch from the batch branch, push to the batch branch, no PR). Name the boards in the order and add "board approved on <date>".
5. Pure text, spacing or error fixes without a new element need no new board. The order names the existing board and the Agent keeps it up to date.
