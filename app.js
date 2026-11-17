(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     Elements
     ------------------------------------------------------------------------ */

  const textarea = document.getElementById('text-input');
  const copyBtn = document.querySelector('[data-action="copy"]');
  const copyLabel = document.getElementById('copy-label');
  const clearBtn = document.querySelector('[data-action="clear"]');
  const undoBtn = document.querySelector('[data-action="undo"]');
  const transformButtons = Array.from(
    document.querySelectorAll('[data-action="upper"], [data-action="lower"], [data-action="title"], [data-action="sentence"], [data-action="camel"], [data-action="snake"]')
  );
  const smartToggle = document.getElementById('smart-title');
  const themeToggle = document.getElementById('theme-toggle');
  const toastEl = document.getElementById('toast');

  const statsLive = document.getElementById('stats-live');

  const statEls = {
    words: document.getElementById('count-words'),
    chars: document.getElementById('count-chars'),
    charsNoSpace: document.getElementById('count-chars-nospace'),
    sentences: document.getElementById('count-sentences'),
    lines: document.getElementById('count-lines'),
    reading: document.getElementById('count-reading'),
  };

  /* ------------------------------------------------------------------------
     Configuration
     ------------------------------------------------------------------------ */

  const MAX_HISTORY = 30;
  const WORDS_PER_MINUTE = 200;
  const THEME_KEY = 'cc.theme';
  const SMART_KEY = 'cc.smart';

  const MINOR_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
    'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs',
  ]);

  const numberFormatter = new Intl.NumberFormat();

  let graphemeSegmenter = null;
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    }
  } catch (error) {
    graphemeSegmenter = null;
  }

  // Any non-ASCII text may contain combining marks, joiners, variation
  // selectors or surrogate pairs, where one visible character spans several
  // code units. Pay for grapheme segmentation only in that case.
  const NON_ASCII = /[^\x00-\x7F]/;

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */

  const history = [];
  let toastTimer = 0;
  let copyTimer = 0;
  let announceTimer = 0;

  const ACTIONS = {
    upper: { label: 'UPPERCASE', transform: (text) => text.toUpperCase() },
    lower: { label: 'lowercase', transform: (text) => text.toLowerCase() },
    title: { label: 'Title Case', transform: (text) => toTitleCase(text, smartToggle.checked) },
    sentence: { label: 'Sentence case', transform: toSentenceCase },
    camel: { label: 'camelCase', transform: toCamelCase },
    snake: { label: 'snake_case', transform: toSnakeCase },
  };

  /* ------------------------------------------------------------------------
     Counting
     ------------------------------------------------------------------------ */

  function countWords(text) {
    const trimmed = text.trim();
    return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  }

  function countCharacters(text) {
    if (!text) return 0;
    if (!graphemeSegmenter || !NON_ASCII.test(text)) return text.length;

    let count = 0;
    for (const _ of graphemeSegmenter.segment(text)) {
      count += 1;
    }
    return count;
  }

  function countCharactersNoSpaces(text) {
    if (!text) return 0;

    if (!graphemeSegmenter || !NON_ASCII.test(text)) {
      let count = 0;
      for (let index = 0; index < text.length; index += 1) {
        if (!/\s/u.test(text[index])) count += 1;
      }
      return count;
    }

    let count = 0;
    for (const { segment } of graphemeSegmenter.segment(text)) {
      if (!/\s/u.test(segment)) count += 1;
    }
    return count;
  }

  function countSentences(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    const parts = trimmed
      .split(/[.!?…]+["'”’)\]]*\s+/u)
      .filter((part) => /[\p{L}\p{N}]/u.test(part));

    return parts.length;
  }

  function countLines(text) {
    return text === '' ? 0 : text.split('\n').length;
  }

  function readingTime(words) {
    if (words === 0) return '0 min';

    const totalSeconds = Math.round((words / WORDS_PER_MINUTE) * 60);
    if (totalSeconds < 60) return `${Math.max(1, totalSeconds)} sec`;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`;
  }

  function setStat(element, value) {
    const next = typeof value === 'number' ? numberFormatter.format(value) : value;
    if (element.textContent !== next) element.textContent = next;
  }

  function updateStats() {
    const text = textarea.value;
    const words = countWords(text);
    const characters = countCharacters(text);

    setStat(statEls.words, words);
    setStat(statEls.chars, characters);
    setStat(statEls.charsNoSpace, countCharactersNoSpaces(text));
    setStat(statEls.sentences, countSentences(text));
    setStat(statEls.lines, countLines(text));
    setStat(statEls.reading, readingTime(words));

    announceCounts(words, characters);
  }

  // Announce a short summary after a quiet moment instead of reading every
  // number on every keystroke.
  function announceCounts(words, characters) {
    const message =
      `${numberFormatter.format(words)} ${words === 1 ? 'word' : 'words'}, ` +
      `${numberFormatter.format(characters)} ${characters === 1 ? 'character' : 'characters'}`;

    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      if (statsLive.textContent !== message) statsLive.textContent = message;
    }, 600);
  }

  /* ------------------------------------------------------------------------
     Case conversion
     ------------------------------------------------------------------------ */

  function capitalizePart(part) {
    return part
      .toLowerCase()
      .replace(/\p{L}/u, (letter) => letter.toUpperCase());
  }

  function titleToken(token) {
    return token
      .split(/([-‐‑‒–—])/)
      .map((part) => (/[\p{L}\p{N}]/u.test(part) ? capitalizePart(part) : part))
      .join('');
  }

  function stripToLetters(token) {
    return token.replace(/[^\p{L}]/gu, '').toLowerCase();
  }

  function toTitleCase(text, smart) {
    const tokens = text.split(/(\s+)/);
    let seenWord = false;
    let sentenceStart = true;
    let result = '';

    for (const token of tokens) {
      if (!token) continue;

      if (/^\s+$/.test(token)) {
        result += token;
        if (/[\r\n]/.test(token)) sentenceStart = true;
        continue;
      }

      const hasWordChar = /[\p{L}\p{N}]/u.test(token);
      if (!hasWordChar) {
        result += token;
        continue;
      }

      const lowerMinor =
        smart &&
        seenWord &&
        !sentenceStart &&
        MINOR_WORDS.has(stripToLetters(token));

      result += lowerMinor ? token.toLowerCase() : titleToken(token);

      sentenceStart = /[.!?…:]["'”’)\]]*$/.test(token);
      seenWord = true;
    }

    return result;
  }

  function toSentenceCase(text) {
    const lower = text.toLowerCase();
    let result = '';
    let capitalizeNext = true;

    for (const character of lower) {
      if (capitalizeNext && /\p{L}/u.test(character)) {
        result += character.toUpperCase();
        capitalizeNext = false;
        continue;
      }

      result += character;

      if (/[.!?…]/.test(character) || character === '\n' || character === '\r') {
        capitalizeNext = true;
      }
    }

    return result;
  }

  function extractWords(text) {
    return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
  }

  function toCamelCase(text) {
    return extractWords(text)
      .map((word, index) => {
        const clean = word.replace(/['’]/g, '').toLowerCase();
        if (index === 0) return clean;
        return clean.replace(/\p{L}/u, (letter) => letter.toUpperCase());
      })
      .join('');
  }

  function toSnakeCase(text) {
    return extractWords(text)
      .map((word) => word.replace(/['’]/g, '').toLowerCase())
      .join('_');
  }

  /* ------------------------------------------------------------------------
     Editing & history
     ------------------------------------------------------------------------ */

  function setTextValue(value, selectionStart, selectionEnd) {
    const scrollTop = textarea.scrollTop;
    const max = value.length;
    const start = typeof selectionStart === 'number' ? Math.min(selectionStart, max) : max;
    const end = typeof selectionEnd === 'number' ? Math.min(selectionEnd, max) : max;

    textarea.value = value;
    textarea.setSelectionRange(start, end);
    textarea.scrollTop = scrollTop;
  }

  function pushHistory(entry) {
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function updateToolbarState() {
    const hasText = textarea.value.length > 0;

    for (const button of transformButtons) button.disabled = !hasText;
    copyBtn.disabled = !hasText;
    clearBtn.disabled = !hasText;
    undoBtn.disabled = history.length === 0;

    if (history.length > 0) {
      const last = history[history.length - 1];
      undoBtn.title =
        last.label === 'clear'
          ? 'Restore cleared text (Alt+Z)'
          : `Undo ${last.label} (Alt+Z)`;
    } else {
      undoBtn.title = 'Nothing to undo (Alt+Z)';
    }
  }

  function applyTransform(actionKey) {
    const action = ACTIONS[actionKey];
    if (!action) return;

    const before = textarea.value;
    if (!before) return;

    const after = action.transform(before);
    if (after === before) {
      toast('No changes needed');
      return;
    }

    pushHistory({
      text: before,
      label: action.label,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    });

    setTextValue(after, textarea.selectionStart, textarea.selectionEnd);
    updateStats();
    updateToolbarState();
    toast(`Converted to ${action.label}`);
  }

  function clearText() {
    if (!textarea.value) return;

    pushHistory({
      text: textarea.value,
      label: 'clear',
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    });

    setTextValue('', 0, 0);
    updateStats();
    updateToolbarState();
    toast('Text cleared');
  }

  function undoLast() {
    const entry = history.pop();
    if (!entry) return;

    setTextValue(entry.text, entry.selectionStart, entry.selectionEnd);
    updateStats();
    updateToolbarState();

    toast(entry.label === 'clear' ? 'Cleared text restored' : `Undid ${entry.label}`);
  }

  /* ------------------------------------------------------------------------
     Clipboard
     ------------------------------------------------------------------------ */

  function fallbackCopy(text) {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.setAttribute('aria-hidden', 'true');
    helper.style.position = 'fixed';
    helper.style.top = '0';
    helper.style.left = '-9999px';
    helper.style.opacity = '0';
    document.body.appendChild(helper);

    helper.select();
    helper.setSelectionRange(0, text.length);

    let succeeded = false;
    try {
      succeeded = document.execCommand('copy');
    } finally {
      helper.remove();
    }

    if (!succeeded) throw new Error('Copy command was rejected');
  }

  async function writeToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall back to the legacy approach below.
      }
    }

    fallbackCopy(text);
  }

  function showCopiedState() {
    copyBtn.classList.add('is-copied');
    copyLabel.textContent = 'Copied!';

    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyBtn.classList.remove('is-copied');
      copyLabel.textContent = 'Copy';
    }, 1600);
  }

  async function copyText() {
    const text = textarea.value;
    if (!text) return;

    try {
      await writeToClipboard(text);
      showCopiedState();
      toast('Copied to clipboard');
    } catch (error) {
      toast('Could not copy — select the text and press Ctrl+C');
    }
  }

  /* ------------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------------ */

  function toast(message) {
    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');

    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 2200);
  }

  /* ------------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------------ */

  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

  function syncThemeControls() {
    const isDark = document.documentElement.dataset.theme === 'dark';

    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0b0d14' : '#f4f5fa');
  }

  function setTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    syncThemeControls();

    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (error) { /* storage may be unavailable */ }
    }
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (error) {
      return null;
    }
  }

  themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });

  if (typeof colorScheme.addEventListener === 'function') {
    colorScheme.addEventListener('change', (event) => {
      if (!getStoredTheme()) setTheme(event.matches ? 'dark' : 'light', false);
    });
  }

  /* ------------------------------------------------------------------------
     Smart title case preference
     ------------------------------------------------------------------------ */

  try {
    smartToggle.checked = localStorage.getItem(SMART_KEY) === '1';
  } catch (error) {
    smartToggle.checked = false;
  }

  smartToggle.addEventListener('change', () => {
    try {
      localStorage.setItem(SMART_KEY, smartToggle.checked ? '1' : '0');
    } catch (error) { /* storage may be unavailable */ }
    toast(smartToggle.checked ? 'Smart title case is on' : 'Smart title case is off');
  });

  /* ------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------ */

  textarea.addEventListener('input', () => {
    // A manual edit invalidates conversion snapshots so Undo can never
    // silently discard freshly typed text.
    history.length = 0;
    updateToolbarState();
    updateStats();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;

    const action = button.dataset.action;
    if (action === 'copy') copyText();
    else if (action === 'clear') clearText();
    else if (action === 'undo') undoLast();
    else applyTransform(action);
  });

  const shortcutActions = {
    KeyU: 'upper',
    KeyL: 'lower',
    KeyT: 'title',
    KeyC: 'copy',
    KeyX: 'clear',
    KeyZ: 'undo',
  };

  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

  if (isMac) {
    // Option+letter is how macOS types accented characters, so the Alt-based
    // shortcuts are intentionally disabled there rather than breaking text input.
    const hints = document.querySelector('.shortcuts');
    if (hints) hints.remove();
    for (const element of document.querySelectorAll('[aria-keyshortcuts]')) {
      element.removeAttribute('aria-keyshortcuts');
    }
  }

  document.addEventListener('keydown', (event) => {
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();

    // Ctrl/Cmd+Z acts as conversion undo while a conversion snapshot exists.
    if (modifier && !event.shiftKey && !event.altKey && key === 'z' && history.length > 0) {
      event.preventDefault();
      undoLast();
      return;
    }

    if (isMac || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const action = shortcutActions[event.code];
    if (!action) return;

    // Only act when the pressed key really is the expected Latin letter. This
    // keeps AltGr / compose / dead-key input working on international layouts.
    const expectedLetter = event.code.slice(3).toLowerCase();
    if (!event.key || event.key.toLowerCase() !== expectedLetter) return;

    event.preventDefault();

    if (action === 'copy') {
      if (!copyBtn.disabled) copyText();
    } else if (action === 'clear') {
      if (!clearBtn.disabled) clearText();
    } else if (action === 'undo') {
      if (!undoBtn.disabled) undoLast();
    } else {
      applyTransform(action);
    }
  });

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */

  syncThemeControls();
  updateStats();
  updateToolbarState();
})();
