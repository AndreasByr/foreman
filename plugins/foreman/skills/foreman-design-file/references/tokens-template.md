# design.md template, part 1: foundations

Replace all example values with the project's. Keep names. Mark derived values `/* derived */`.

## Header

```markdown
# {{PROJECT_NAME}} - Design System

> **Version:** 1.0
> **Stack:** Tailwind CSS | plain CSS | both
> **Created:** <date>
> **Basis:** <where the palette or reference comes from>

This file is the single source of truth for all visual decisions. Agents derive every color, spacing, type and component decision from it. Nothing is invented; everything is here.
```

## 1. Color tokens

### 1.1 Primitive palette (raw values)

Primitives are never used directly in code; they are referenced through semantic tokens.

```css
:root {
  /* Brand */
  --color-brand-500: #2563EB;
  --color-brand-400: #4F83F1;   /* derived */
  --color-brand-600: #1D4ED8;   /* derived */
  /* Neutral */
  --color-gray-950: #0B0F19;
  --color-gray-900: #111827;
  --color-gray-700: #374151;
  --color-gray-400: #9CA3AF;
  --color-gray-200: #E5E7EB;
  --color-gray-50:  #F9FAFB;
  --color-white:    #FFFFFF;
  /* State */
  --color-green-500:  #16A34A;
  --color-yellow-500: #CA8A04;
  --color-red-500:    #DC2626;
  --color-blue-500:   #2563EB;
}
```

### 1.2 Semantic layer

Semantic tokens describe intent, not value. Only these are used in code.

```css
:root {
  /* Brand */
  --brand-primary:        var(--color-brand-500);  /* buttons, links, highlights */
  --brand-primary-hover:  var(--color-brand-400);
  --brand-primary-active: var(--color-brand-600);
  --brand-secondary:      var(--color-gray-700);   /* supporting brand color */
  --brand-accent:         var(--color-brand-500);  /* CTAs, badges, tags */
  /* Surfaces */
  --surface-base:    var(--color-gray-950);  /* page background */
  --surface-raised:  var(--color-gray-900);  /* cards, panels */
  --surface-overlay: var(--color-gray-700);  /* dialogs, dropdowns, tooltips */
  --surface-sunken:  var(--color-gray-950);  /* inputs, inset areas */
  /* Text */
  --text-primary:    var(--color-white);
  --text-secondary:  var(--color-gray-400);  /* labels, captions */
  --text-disabled:   var(--color-gray-700);
  --text-on-brand:   var(--color-white);     /* text on brand backgrounds */
  --text-link:       var(--brand-primary);
  --text-link-hover: var(--brand-primary-hover);
  /* Borders */
  --border-default: var(--color-gray-700);
  --border-subtle:  var(--color-gray-900);
  --border-focus:   var(--brand-primary);    /* focus ring */
  --border-error:   var(--color-red-500);
  /* States */
  --state-success: var(--color-green-500);
  --state-success-bg: rgba(22, 163, 74, 0.12);
  --state-warning: var(--color-yellow-500);
  --state-warning-bg: rgba(202, 138, 4, 0.12);
  --state-error:   var(--color-red-500);
  --state-error-bg: rgba(220, 38, 38, 0.12);
  --state-info:    var(--color-blue-500);
  --state-info-bg: rgba(37, 99, 235, 0.12);
}
```

### 1.3 Color usage rules

- Never use primitives (`--color-brand-500`) in code; use semantic tokens.
- Never hardcode a color (`#2563EB`); always a token.
- Combine every `--surface-*` with a `--text-*` token whose contrast meets the required level. Record the checked pairs and ratios in a table.
- `--state-*` only for feedback elements, never as decoration. Never carry meaning by color alone; pair it with text or an icon.

## 2. Typography

```css
:root {
  --font-display: '<Display font>', system-ui, sans-serif;  /* h1 to h3, hero */
  --font-body:    '<Body font>', system-ui, sans-serif;     /* text, labels, buttons, nav */
  --font-mono:    'JetBrains Mono', 'Fira Code', monospace; /* code, IDs, technical values */
}
```

Add the font import line and state the source of the typeface choice (brand, human, derived).

Type scale (rem only; root stays `100%`):

```css
:root {
  --text-xs: 0.75rem;   --text-sm: 0.875rem;  --text-base: 1rem;
  --text-lg: 1.125rem;  --text-xl: 1.25rem;   --text-2xl: 1.5rem;
  --text-3xl: 1.875rem; --text-4xl: 2.25rem;  --text-5xl: 3rem;
  --text-6xl: 3.75rem;
  /* usage: xs captions/meta, sm labels, base body, lg subheads, xl section titles,
     2xl card titles/h3, 3xl h2, 4xl h1 mobile, 5xl h1 desktop, 6xl hero */

  --font-normal: 400;  --font-medium: 500;
  --font-semibold: 600; --font-bold: 700;

  --leading-tight: 1.2;  --leading-snug: 1.375;
  --leading-normal: 1.5; --leading-relaxed: 1.625;

  --tracking-tight: -0.025em; --tracking-normal: 0em;
  --tracking-wide: 0.05em;    --tracking-widest: 0.15em;
}
```

Rules:
- Display font only for h1 to h3 and hero; body font for everything else; mono only for code, IDs, timestamps.
- `--tracking-widest` only with `text-transform: uppercase` and `--text-xs`/`--text-sm`.
- `--leading-tight` only from `--text-2xl` up.
- Line height has no unit. Never `px` for font size.

## 3. Spacing

Base 4 px (0.25rem). Every value is a multiple.

```css
:root {
  --space-0: 0;       --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem;
  --space-4: 1rem;    --space-5: 1.25rem; --space-6: 1.5rem;  --space-8: 2rem;
  --space-10: 2.5rem; --space-12: 3rem;   --space-16: 4rem;   --space-20: 5rem;
  --space-24: 6rem;   --space-32: 8rem;
}
```

Rules: padding `--space-3` to `--space-6` for compact elements, `--space-6` to `--space-12` for cards and panels; gaps `--space-4` to `--space-8` inline, `--space-12` to `--space-24` between sections; no spacing outside the scale; center with flex or grid, not `margin: auto`.

## 4. Border, radius, shadow

```css
:root {
  --border-width-thin: 1px; --border-width-base: 1.5px; --border-width-thick: 2px;

  --radius-none: 0;        --radius-sm: 0.25rem;  /* tags, chips */
  --radius-base: 0.5rem;   /* inputs, small buttons */
  --radius-md: 0.75rem;    /* cards, panels */
  --radius-lg: 1rem;       /* dialogs */
  --radius-xl: 1.5rem;     /* hero, feature cards */
  --radius-full: 9999px;   /* pills, avatars, toggles */

  --shadow-sm:   0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.4);
  --shadow-base: 0 4px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4);
  --shadow-md:   0 10px 15px rgba(0,0,0,0.3), 0 4px 6px rgba(0,0,0,0.4);
  --shadow-lg:   0 20px 25px rgba(0,0,0,0.35), 0 10px 10px rgba(0,0,0,0.3);
  --shadow-glow: 0 0 20px rgba(<BRAND_RGB>, 0.35);  /* optional */
}
```

## 5. Breakpoints (mobile first)

```css
:root { --bp-sm: 640px; --bp-md: 768px; --bp-lg: 1024px; --bp-xl: 1280px; --bp-2xl: 1536px; }
/* custom properties do not work in media queries: use the literal values */
@media (min-width: 640px)  { /* sm */ }
@media (min-width: 768px)  { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

## 6. Motion

```css
:root {
  --duration-instant: 50ms; --duration-fast: 100ms; --duration-base: 200ms;
  --duration-slow: 300ms;   --duration-slower: 500ms;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --transition-color: color var(--duration-fast) var(--ease-in-out),
                      background-color var(--duration-fast) var(--ease-in-out),
                      border-color var(--duration-fast) var(--ease-in-out);
  --transition-shadow: box-shadow var(--duration-base) var(--ease-out);
}
```

Rule: animate only `transform`, `opacity` and color properties. Motion respects `prefers-reduced-motion` (see global base).

## 7. Z-index layers

```css
:root {
  --z-below: -1; --z-base: 0; --z-raised: 10; --z-dropdown: 20;
  --z-overlay: 30; --z-modal: 40; --z-toast: 50; --z-tooltip: 60;
}
```

No z-index outside these layers.
