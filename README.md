# Case &amp; Count

A fast, private text case converter and word counter built to the **Text Case & Word Counter Utility** PRD. No build step, no backend, no dependencies — just static files.

## Run it

Open `index.html` directly in a browser, or serve the folder with any static server:

```sh
# Node
npx serve .

# Python
python -m http.server 4173
```

Then visit the local URL. Everything runs client-side; no text is sent anywhere or persisted.

## Features

- Large auto-focused, resizable textarea with typed/pasted multi-line support.
- Live **Words** and **Characters** counts plus characters without spaces, sentences, lines, and reading time (200 wpm).
- Grapheme-aware character counting for emoji, accents, and non-Latin scripts.
- Case conversions: **UPPERCASE**, **lowercase**, **Title Case**, Sentence case, camelCase, snake_case.
- Title Case handles hyphenated words (`well-known` → `Well-Known`) and apostrophes (`don't` → `Don't`).
- Optional **Smart title case** that keeps minor words (`a`, `an`, `the`, `of`, `in`, `and`, `but`, `or`, …) lowercase after the first word.
- Copy with inline confirmation and a legacy clipboard fallback, Clear, and Undo for the last conversion or clear.
- Light/dark theme following the system preference and remembered locally.
- Keyboard shortcuts on Windows/Linux: `Alt+U` uppercase, `Alt+L` lowercase, `Alt+T` title case, `Alt+C` copy, `Alt+X` clear, `Alt+Z` undo. `Ctrl/Cmd+Z` undoes the last conversion. On macOS the Option-key shortcuts are skipped so they never interfere with typing accented characters.
- WCAG 2.1 AA-oriented markup: labelled textarea, live counters, visible focus rings, 44 px touch targets, skip link, reduced-motion support.
- Responsive from 320 px to desktop widths.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page markup and accessibility structure |
| `styles.css` | Light/dark theme, layout, and responsive styles |
| `app.js` | Counting, case conversion, history, clipboard, shortcuts |

## Notes

- Words are sequences of non-whitespace characters separated by whitespace, per the PRD.
- Character counts are grapheme-aware, so one emoji or combined character counts as one.
- Undo history is limited to conversion/clear snapshots and is intentionally reset when you type manually, so undo can never discard new edits.
- The only values saved in `localStorage` are the theme and smart-title preference — never your text.
