---
name: frontend-design
description: Visual design guidance for the Groovekeeper web app (web/), on desktop and on phones as an installed PWA - layout, typography, theme colors, touch, motion, accessibility and interface wording. Use when building or reshaping UI - new pages, components, dialogs, themes, or a redesign.
---

# Frontend Design

## Groovekeeper context (read first)

- **Subject:** Groovekeeper is a tool for musicians writing chord sheets: lyrics with chords placed on the exact syllable, transposing, setlists and printing for gigs. Audience: guitarists, singers and band members, often reading on a laptop or tablet on a stand. Primary job: write and read songs quickly and clearly. You don't need to ask what the product is.
- **The existing design is the design system.** The themes (Amp, Backstage, Record Sleeve, Songbook) come from the desktop app (`SongCreator/Themes/*.xaml`) and live in the web app as Tailwind color tokens in `web/apps/groovekeeper/src/index.css` (`bg-window`, `text-fg`, `text-chord`, `bg-accent-fill`, ...). Fonts are set there too.
  - Build new UI with these tokens and fonts. Never hard-code colors or add new typefaces.
  - A needed color that doesn't exist yet becomes a new token, added to **every** theme.
  - Don't change existing themes, palettes or fonts unless the user explicitly asks for it.
- **When the full creative process applies:** only when the user asks for a new theme, a new page design (e.g. the start page), or a redesign. Then follow "Process" below, and when porting a desktop theme, match the XAML theme rather than inventing.
- **For everyday feature UI** (a dialog, a panel, a button row), skip the design-plan pass. Match what's already on screen, and apply the principles, the quality floor and the writing guidance below.
- The editor's chord lane over monospace lyrics is functional: chords must line up with their letters. Never trade alignment or readability for style.

## Approach

Approach this as the design lead at a design studio known for giving every client a distinct visual identity that is not mistaken for anyone else's. Make deliberate, opinionated choices about palette, typography and layout that are specific to this brief, and take aesthetic risk if justified - within the Groovekeeper context above.

### Ground your designs in the subject matter

The subject's industry, materials and vernacular are where distinctive visual choices come from: here, stage gear, amps, record sleeves, songbooks, handwritten chord charts. Build with the real content throughout: real song titles, chords and lyrics (the sample songs in `samples/songs` are public domain), never lorem ipsum.

## Design principles

- **The first screen** (start page, an empty library) opens with the most characteristic thing in the subject's world, in the most fitting form. A big number with a small label, supporting stats and a gradient accent is the default treatment; only use it if it is truly the best option.
- **Typography carries the personality.** One or two families; if two, clearly distinct. Set a clear type scale (following The Elements of Typographic Style) with intentional weights and spacing.
- **Line length** under 80 characters for prose. Serif body text gets slightly more line-height than sans-serif.
- **Avoid these default typographic treatments**, the commonest tells of a generated page:
  - Accenting a single word or phrase in a headline (italic, bold or a different color).
  - All caps for labels.
  - Unnecessary labels above content.
- **Visual structure is information.** Outlines, borders, numbering, dividers and labels must encode something about the content, not decorate it. Numbered markers (01 / 02 / 03) only when the content really is a sequence - a setlist is one; a library isn't.
- **Motion:** non-user-triggered motion sparingly, only to draw attention; one orchestrated moment beats scattered effects. Fade-and-slide-up entrances on every section and hover transitions on every card read as generated. Motion that answers an action (opening, expanding, confirming, a chord snapping onto a letter) is welcome when it shows what changed.

## Process: plan, review, build, critique (new themes, pages, redesigns)

For calibration, AI-generated design clusters around these traits:

- a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta accent (near #D97757);
- a near-black background with a single bright acid-green or vermilion accent;
- a broadsheet layout with hairline rules, zero border-radius and dense newspaper columns;
- the SaaS-card kit: content chopped into identical rounded cards, one border-radius everywhere, the same soft grey shadow under each, gradient washes as decoration;
- template chrome: a tracked-out ALL-CAPS eyebrow above every heading; meta strings joined with middle dots ('A · B · C'); 'WORD — fragment' labels; tinted near-black (#0B0B0B, #111) standing in for black; monospace for small data labels; '→' appended to link and button text.

All are legitimate for some briefs, but they are defaults, not choices. Where the user pins down a direction, follow it exactly. Where an axis is free, don't spend it on one of these.

Work in two passes:

1. **Plan** a compact token system: color (4-6 named hex values, as Tailwind tokens), type (typefaces and roles), layout (one-sentence descriptions and ASCII wireframes; alignment), principles (what makes this one unique).
2. **Review the plan** before building: if any part reads like the generic default for any similar page, revise it and say what changed and why. Then write the code following the revised plan.

With Tailwind, keep styling in utility classes on the component; avoid one-off CSS rules that fight the utilities (especially margins and padding between sections).

## CSS before JavaScript

Reach for CSS (through Tailwind) first; use JavaScript for visual behavior only when CSS can't do it.

- **Container queries** (`@container` and `@sm:`-style variants in Tailwind v4) for components that sit in panels of different widths, like the chord palette or a song card, instead of resize observers or page-width breakpoints.
- **`:has()`** (Tailwind `has-*` variants) to style a parent from its children's state, e.g. a section with a focused line, instead of mirroring that state in React.
- **Viewport units** `dvh`/`svh` for full-height layouts on phones, never `vh`.
- **`content-visibility: auto`** before JavaScript virtualization for long lists.
- **Scroll-driven animations** instead of scroll listeners, only where they add something, and only with a fallback.
- **JavaScript is right for:** dragging chords and reordering, gestures, measuring text to place chords, and anything that depends on app state CSS can't see.
- **Tailwind tokens only** for colors, fonts and spacing. Arbitrary values (`w-[37px]`) only when measurement needs them, such as `ch`-based offsets in the chord lane, with a comment why.
- **Browser support:** the app runs in Safari on iPhone as well as Chrome. Check newer CSS features on caniuse.com for both, and make sure the layout still works where a feature is missing.

## Restraint and self-critique

- Spend boldness in one place. One memorable element; everything around it quiet and disciplined. Cut decoration that doesn't serve the brief.
- **Quality floor, always:** works on a phone (see below), visible keyboard focus, `prefers-reduced-motion` respected, sufficient contrast in every theme, harmonious colors.
- Critique as you build; take screenshots to review when the environment supports it. Before finishing, remove one accessory.

## Phones and the installed app (PWA)

Groovekeeper is also used on phones, installed to the home screen. Every screen must work there, not just shrink.

- **Phone is a first-class layout.** Design from 360px wide up; check portrait and landscape. Panels that sit side by side on desktop (library + song, palette + editor) become separate views or a bottom sheet on a phone.
- **Touch, not mouse.** Tap targets at least 44x44px with space between them. Nothing may depend on hover or right-click: every right-click or hover action (e.g. deleting a chord) needs a touch equivalent, like a long-press menu or a tap that selects and shows actions.
- **Dragging chords on touch** must not fight scrolling: start a drag only after a short press or from a clear handle, and give visible feedback while dragging.
- **The chord lane on narrow screens:** never wrap a lyric line in a way that separates chords from their letters. Prefer a slightly smaller monospace size or horizontal scroll for a long line; if neither works well, raise it with the user as a design decision rather than guessing.
- **Reading on stage** is the main phone use: large, high-contrast lyrics and chords, minimal chrome, one-handed controls within thumb reach (bottom of the screen) for transpose and next/previous song.
- **The on-screen keyboard** covers the bottom half while editing: keep the focused line visible, don't put essential controls where the keyboard lands, and use `dvh`/`svh` units instead of `vh`. Inputs use at least 16px text so iOS doesn't zoom in.
- **Installed (standalone) mode has no browser UI:** no back button, no address bar, no reload. The app needs its own way back from every screen. Respect the notch and home indicator with `env(safe-area-inset-*)` padding, and set the `theme-color` to the current theme's toolbar color.
- **Offline is normal on a phone.** Show it calmly and only when it matters ("Offline. Changes are saved on this phone and sync when you're back online."), never as a blocking error.

## Writing in the interface

Words make the interface easier to understand and use; they are design content, not decoration.

- Write from the user's perspective, in plain language. Name things by what users understand ("Songs", "Setlist", "Key"), not by how the system is built ("IndexedDB", "sync queue").
- Active voice. A button says exactly what happens: "Save song", not "Submit". An action keeps its name through the whole flow: "Delete" produces "Deleted"; "Transpose" stays "Transpose".
- Errors say what went wrong and how to fix it, in the interface's voice. They don't apologize and are never vague. ("Couldn't read Wonderwall.txt: it isn't a song file. Pick a .txt or ChordPro file.")
- Empty states invite action ("No songs yet. Import a song or start a new one.").
- Sentence case, plain verbs, no filler. Each piece of text does one job.
