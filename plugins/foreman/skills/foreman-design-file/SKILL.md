---
name: foreman-design-file
description: Use when a project needs a token-based docs/design.md as single source for agents: from a palette, reference design, URL or description. Covers colors, type, spacing, radius, shadows, breakpoints, component states, naming, CSS properties, Tailwind excerpt.
---

# Design file

Answer in the preferred language (`.foreman.json` `context.language`, set by foreman-setup), else in the language the human writes in. The file follows the project's document language.

Write a complete `docs/design.md`: the project's design system as a machine-readable, commented Markdown file. It is the single source of truth for every agent that builds UI, so colors, spacing and components stay consistent and nothing is guessed.

An agent reads this file as context and derives all visual decisions from it without questions. Every token has a name, a value and a usage rule.

## Inputs

| Input | Result |
|---|---|
| Hex palette (3 to 10 colors) | Full token system derivable |
| Screenshot or design-tool description | Tokens and component patterns derivable |
| URL of an existing site | Tokens extractable and documentable |
| Moodboard or style description | Tokens are interpreted; ask follow-ups |
| Project description only | Derive a palette yourself and have the human confirm it explicitly |

If `docs/requirements.md` or a roadmap exists, read goal, target group, stack and the accessibility line. They shape tone, typography and system size. A required WCAG level binds every contrast value in the file.

## Flow

### 1. Clarify input

Ask at most 4 questions, until 99 percent sure:

1. **Palette:** which colors are fixed (hex codes, brand names, or "derive them")?
2. **Reference:** screenshot, design-tool link, URL or style description (minimal, playful, corporate, ...)?
3. **Stack:** Tailwind, plain CSS custom properties, or both? Unknown: deliver both.
4. **Components:** which UI components are central (cards, forms, navigation, tables, dialogs, or "standard set")?

Also ask for **house rules**: project-specific design rules every agent must follow (see below). Do not invent any.

Optional skills, when present in the session: color, typography and UI polish skills for palette, type scale and radius/shadow choices; copy-quality skills for the comments and usage rules.

### 2. Analyze the palette

Every palette must cover these roles: `brand-primary`, `brand-secondary`, `brand-accent`, `surface-base`, `surface-raised`, `surface-overlay`, `text-primary`, `text-secondary`, `text-disabled`, `text-on-brand`, `border-default`, `border-subtle`, `state-success`, `state-warning`, `state-error`, `state-info`.

Missing roles are derived consistently from the palette (lightness, saturation) and marked `/* derived */`. With an existing brand palette, use the exact hex values unchanged; only derivations (hover states, state colors) get the mark. Check contrast of every text-on-surface pair against the required WCAG level (default AA: 4.5:1 body text, 3:1 large text and UI components).

### 3. Write `docs/design.md`

Three layers, always: primitive (raw values), semantic (intent), component (points at semantic). Semantic tokens point at primitives, never at hex. Component tokens point at semantic tokens, never at primitives.

Read these files before writing:

- `references/tokens-template.md`: sections 1 to 7 (colors, type, spacing, border/radius/shadow, breakpoints, motion, z-index).
- `references/components-template.md`: sections 8 to 12 (component tokens and states, Tailwind excerpt, global CSS base, naming conventions, quick reference).

The file starts with a header (version, stack, date, basis of palette or reference) and the sentence that this file is the single source of truth and nothing is invented.

### 4. House rules

A project may add **house rules** to a section "House rules" at the end of `design.md`. They are the human's own, stated rules, and they outrank the defaults. Examples of what a project could choose: one fixed typeface for everything, no sliders or carousels, buttons that stay clickable and show what is missing on click, no emoji in the UI. foreman ships none of these as defaults. Add only rules the human states, each as an enforceable line ("Agents must not ...") with the check that proves it.

## Output

1. Write `docs/design.md` (in a repo session) or `design-<short-name>.md` to the output folder and present it as a download.
2. Show a quick token overview in chat: the 5 to 8 most important color tokens as a table (hex, role, usage) with their contrast ratios.
3. Ask: "Is the palette right? Are components missing? Should I add the light/dark split?"

## Next

Boards (screens and flows) are made in chat from this file and approved there; see `foreman-project` step 3 and `foreman-brief` (`references/design-first.md`). Boards are exported as HTML to `docs/design-reference/`. If the repo has a machine-readable token file with a CI check, update it in the same commit as every later change to `design.md`.

## Quality rules

- No token without a usage rule: each says when to use it.
- No hole in the palette: missing state colors are derived, not omitted.
- Naming is explicit and complete so an agent applies it without an example.
- Prohibitions are written out ("never invent colors"), not implied.
- Font sizes are `rem`, never `px`; line height has no unit; the root stays at `100%` so browser settings apply.
- Focus is always visible (`:focus-visible` outline); motion respects `prefers-reduced-motion`.
- The quick reference at the end gives an agent instant access without reading the whole file.

## Special cases

- **Light and dark mode:** two blocks, `:root { /* light */ }` and `[data-theme="dark"] { /* overrides */ }`. Only semantic tokens are overridden; primitives stay the same. Contrast is checked in both.
- **Tailwind:** deliver both the custom properties and the `tailwind.config` excerpt. Tailwind classes reference the variables, no hardcoded values in the config.
- **Very small project (one page, 2 or 3 components):** reduce to color tokens, typography, spacing scale and one or two component blocks. No overhead for unused components.
- **No stack known:** deliver custom properties and the Tailwind excerpt; the agent picks.
