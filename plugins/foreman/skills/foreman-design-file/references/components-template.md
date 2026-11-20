# design.md template, part 2: components, Tailwind, base, naming

Component tokens point at semantic tokens, never at primitives. Include only the components the project uses. Every interactive component lists its states: default, hover, active, focus-visible, error, loading. Where a state does not apply, write "n/a".

## 8. Component tokens

### 8.1 Button

```css
:root {
  --btn-primary-bg: var(--brand-primary);
  --btn-primary-bg-hover: var(--brand-primary-hover);
  --btn-primary-bg-active: var(--brand-primary-active);
  --btn-primary-text: var(--text-on-brand);

  --btn-secondary-bg: transparent;
  --btn-secondary-bg-hover: var(--surface-raised);
  --btn-secondary-text: var(--text-primary);
  --btn-secondary-border: var(--border-default);

  --btn-ghost-bg: transparent;
  --btn-ghost-text: var(--text-secondary);
  --btn-ghost-text-hover: var(--text-primary);

  --btn-danger-bg: var(--state-error);
  --btn-danger-text: var(--text-on-brand);

  --btn-padding-x-sm: var(--space-3);   --btn-padding-y-sm: var(--space-2);
  --btn-padding-x-base: var(--space-5); --btn-padding-y-base: var(--space-3);
  --btn-padding-x-lg: var(--space-8);   --btn-padding-y-lg: var(--space-4);
  --btn-radius: var(--radius-base);
  --btn-font-weight: var(--font-medium);
  --btn-font-size: var(--text-sm);
  --btn-transition: var(--transition-color);
}
```

State table: default, hover, active, focus-visible (outline `--border-focus`), loading (spinner, no double submit). A disabled state exists only if the human's house rules allow it; otherwise omit it and say so.

### 8.2 Input / form

```css
:root {
  --input-bg: var(--surface-sunken);   --input-bg-focus: var(--surface-raised);
  --input-border: var(--border-default);
  --input-border-focus: var(--border-focus);
  --input-border-error: var(--border-error);
  --input-text: var(--text-primary);   --input-placeholder: var(--text-secondary);
  --input-radius: var(--radius-base);
  --input-padding-x: var(--space-4);   --input-padding-y: var(--space-3);
  --input-font-size: var(--text-base);
  --label-text: var(--text-secondary); --label-font-size: var(--text-sm);
  --label-font-weight: var(--font-medium); --label-margin-bottom: var(--space-2);
  --input-helper-text: var(--text-secondary);
  --input-error-text: var(--state-error);
}
```

Rules: every input has a visible label; errors show text, not color alone.

### 8.3 Card

```css
:root {
  --card-bg: var(--surface-raised);      --card-bg-hover: var(--surface-overlay);
  --card-border: var(--border-subtle);   --card-border-hover: var(--border-default);
  --card-radius: var(--radius-md);       --card-padding: var(--space-6);
  --card-shadow: var(--shadow-sm);       --card-shadow-hover: var(--shadow-md);
}
```

### 8.4 Badge / tag

```css
:root {
  --badge-radius: var(--radius-full);
  --badge-padding-x: var(--space-3);  --badge-padding-y: var(--space-1);
  --badge-font-size: var(--text-xs);  --badge-font-weight: var(--font-medium);
  --badge-success-bg: var(--state-success-bg); --badge-success-text: var(--state-success);
  --badge-warning-bg: var(--state-warning-bg); --badge-warning-text: var(--state-warning);
  --badge-error-bg: var(--state-error-bg);     --badge-error-text: var(--state-error);
  --badge-neutral-bg: var(--surface-overlay);  --badge-neutral-text: var(--text-secondary);
}
```

### 8.5 Navigation

```css
:root {
  --nav-bg: var(--surface-base);  --nav-border: var(--border-subtle);
  --nav-height: 3.5rem;           --nav-padding-x: var(--space-6);
  --nav-link-text: var(--text-secondary);
  --nav-link-text-hover: var(--text-primary);
  --nav-link-text-active: var(--brand-primary);
  --nav-z: var(--z-raised);
}
```

### 8.6 Dialog

```css
:root {
  --modal-bg: var(--surface-raised);  --modal-border: var(--border-subtle);
  --modal-radius: var(--radius-lg);   --modal-padding: var(--space-8);
  --modal-shadow: var(--shadow-lg);   --modal-backdrop: rgba(0, 0, 0, 0.7);
  --modal-z: var(--z-modal);
  --modal-max-width-sm: 28rem; --modal-max-width-base: 36rem; --modal-max-width-lg: 48rem;
}
```

Rules: dialogs trap focus, close with Escape and return focus to the trigger.

## 9. Tailwind excerpt (only if Tailwind is used)

```js
module.exports = {
  theme: { extend: {
    colors: {
      brand:   { primary: 'var(--brand-primary)', secondary: 'var(--brand-secondary)', accent: 'var(--brand-accent)' },
      surface: { base: 'var(--surface-base)', raised: 'var(--surface-raised)', overlay: 'var(--surface-overlay)', sunken: 'var(--surface-sunken)' },
      text:    { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', disabled: 'var(--text-disabled)', 'on-brand': 'var(--text-on-brand)' },
      border:  { default: 'var(--border-default)', subtle: 'var(--border-subtle)', focus: 'var(--border-focus)' },
      state:   { success: 'var(--state-success)', warning: 'var(--state-warning)', error: 'var(--state-error)', info: 'var(--state-info)' },
    },
    fontFamily: { display: ['<Display font>', 'sans-serif'], body: ['<Body font>', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
    borderRadius: { sm: 'var(--radius-sm)', base: 'var(--radius-base)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' },
    boxShadow: { sm: 'var(--shadow-sm)', base: 'var(--shadow-base)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
  } },
};
```

## 10. Global CSS base

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 100%; /* never px: keeps the browser setting */ text-rendering: optimizeLegibility; }
body { background: var(--surface-base); color: var(--text-primary);
       font-family: var(--font-body); font-size: var(--text-base); line-height: var(--leading-normal); }
a { color: var(--text-link); transition: var(--transition-color); }
a:hover { color: var(--text-link-hover); }
:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: var(--radius-sm); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

## 11. Naming conventions for agents

**Custom properties:** `--<category>-<role>-<modifier>` (for example `--brand-primary`, `--text-on-brand`, `--btn-primary-bg-hover`). Hyphens only: no camelCase, no underscores.

**CSS classes (without Tailwind):** component `.btn`, `.card`, `.input`, `.badge`, `.nav`; variant `.btn--primary`; state `.btn--loading`, `.input--error`; size `.btn--sm`, `.btn--lg`.

**Tailwind classes:** `bg-brand-primary`, `bg-surface-raised`, `text-text-primary`, `text-state-success`, `border-border-subtle`.

**Agents must not:**
- hardcode hex values in code,
- use primitive tokens directly,
- use spacing outside the scale (`margin: 7px`),
- use inline styles for color or spacing,
- invent colors that are not in the palette,
- set font sizes in `px`,
- use a typeface other than the ones in this file,
- remove the focus outline.

## 12. House rules (optional)

Rules the human states for this project, one enforceable line each, with the check that proves it. Empty if none. They outrank the defaults above.

## 13. Quick reference

| Token | Value | Use |
|---|---|---|
| `--brand-primary` | <hex> | buttons, links, CTAs |
| `--surface-base` | <hex> | page background |
| `--surface-raised` | <hex> | cards, panels |
| `--text-primary` | <hex> | main text |
| `--text-secondary` | <hex> | secondary text |
| `--border-default` | <hex> | borders |
| `--radius-base` | 0.5rem | default radius |
| `--space-4` | 1rem | default padding |
| `--font-body` | <font> | running text |
| `--duration-base` | 200ms | transitions |

Add a contrast table: each text-on-surface pair, ratio, required level, pass or fail.
