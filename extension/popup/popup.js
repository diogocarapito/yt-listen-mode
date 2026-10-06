/*
 * Listen Mode popup.
 * Reads and writes chrome.storage.sync only. Open YouTube tabs and the
 * toolbar icon pick changes up from storage, so nothing needs a reload.
 */
(() => {
  'use strict';

  const {
    OPTIONS, VISUALIZERS, ACCENTS, THEMES, COMMAND, accentFor, loadSettings, saveSettings,
  } = globalThis.YLM;
  const $ = (id) => document.getElementById(id);

  const card = $('card');
  const power = $('power');
  const status = $('status');
  const logo = $('logo');
  const list = $('options');

  const STATUS = {
    on: 'YouTube plays like a podcast.',
    off: 'YouTube looks and works as usual.',
  };

  function buildRow(control, labelText, hintText) {
    const label = document.createElement('span');
    label.className = 'opt__label';
    label.textContent = labelText;

    const text = document.createElement('span');
    text.className = 'opt__text';
    text.append(label);

    const row = document.createElement('label');
    row.className = 'opt';
    row.htmlFor = control.id;
    if (hintText) row.title = hintText; // hints are tooltips, to keep the popup short
    row.append(text, control);
    return row;
  }

  /** A drop-down bound to one setting. `items` is a list of { value, label }. */
  function buildSelect(key, items, ariaLabel) {
    const select = document.createElement('select');
    select.id = `opt-${key}`;
    select.className = 'select';
    select.dataset.select = key;
    if (ariaLabel) select.setAttribute('aria-label', ariaLabel);
    for (const { value, label } of items) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.addEventListener('change', () => saveSettings({ [key]: select.value }));
    return select;
  }

  /** Last row: accent colour swatches on the left, light/dark on the right. */
  function buildLookRow() {
    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    swatches.setAttribute('role', 'radiogroup');
    swatches.setAttribute('aria-label', 'Accent colour');
    for (const accent of ACCENTS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.dataset.accent = accent.value;
      swatch.title = accent.label;
      swatch.setAttribute('role', 'radio');
      swatch.setAttribute('aria-label', accent.label);
      swatch.style.setProperty('--swatch-l', accent.light);
      swatch.style.setProperty('--swatch-d', accent.dark);
      swatch.addEventListener('click', () => saveSettings({ accent: accent.value }));
      swatches.append(swatch);
    }

    const row = document.createElement('div');
    row.className = 'opt opt--look';
    row.append(swatches, buildSelect('theme', THEMES, 'Appearance'));
    return row;
  }

  function buildOptions() {
    for (const option of OPTIONS) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `opt-${option.key}`;
      input.className = 'switch';
      input.dataset.key = option.key;
      input.setAttribute('role', 'switch');
      input.addEventListener('change', () => saveSettings({ [option.key]: input.checked }));
      list.append(buildRow(input, option.label, option.hint));

      // The visualizer stands in for the video, so it sits right under that switch.
      if (option.key === 'hideVideo') {
        list.append(buildRow(buildSelect('visualizer', VISUALIZERS), 'Visualizer'));
      }
    }
    list.append(buildLookRow());
  }

  function paint(settings) {
    const on = !!settings.enabled;
    card.dataset.enabled = String(on);
    power.setAttribute('aria-checked', String(on));
    status.textContent = on ? STATUS.on : STATUS.off;
    logo.src = `../icons/icon-${on ? 'on' : 'off'}-48.png`;
    for (const input of list.querySelectorAll('input[data-key]')) {
      input.checked = !!settings[input.dataset.key];
    }
    for (const select of list.querySelectorAll('select[data-select]')) {
      select.value = settings[select.dataset.select];
      if (select.selectedIndex < 0) select.selectedIndex = 0; // unknown saved value
    }

    // The popup wears the chosen look itself.
    const accent = accentFor(settings);
    const root = document.documentElement;
    root.style.setProperty('--accent-l', accent.light);
    root.style.setProperty('--accent-d', accent.dark);
    if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
    else delete root.dataset.theme;
    for (const swatch of list.querySelectorAll('.swatch')) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.accent === accent.value));
    }
  }

  async function showShortcut() {
    try {
      const commands = await chrome.commands.getAll();
      const command = commands.find((c) => c.name === COMMAND);
      $('shortcut').textContent = command?.shortcut || 'Not set';
    } catch (_) {
      $('shortcut').textContent = 'Not set';
    }
  }

  function wireFooter() {
    const manifest = chrome.runtime.getManifest();
    $('version').textContent = manifest.version;

    const repo = $('repo');
    if (manifest.homepage_url) repo.href = manifest.homepage_url;
    else repo.hidden = true;

    // chrome:// URLs open the browser's own page (brave://extensions/shortcuts in Brave).
    $('change-shortcut').addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  async function init() {
    buildOptions();
    wireFooter();
    showShortcut();

    paint(await loadSettings());

    power.addEventListener('click', () => {
      const next = power.getAttribute('aria-checked') !== 'true';
      power.setAttribute('aria-checked', String(next)); // instant feedback
      saveSettings({ enabled: next });
    });

    chrome.storage.onChanged.addListener(async (_changes, area) => {
      if (area === 'sync') paint(await loadSettings());
    });
  }

  init();
})();
