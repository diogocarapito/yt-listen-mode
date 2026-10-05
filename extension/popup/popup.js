/*
 * Listen Mode popup.
 * Reads and writes chrome.storage.sync only. Open YouTube tabs and the
 * toolbar icon pick changes up from storage, so nothing needs a reload.
 */
(() => {
  'use strict';

  const { OPTIONS, COMMAND, loadSettings, saveSettings } = globalThis.YLM;
  const $ = (id) => document.getElementById(id);

  const card = $('card');
  const power = $('power');
  const status = $('status');
  const logo = $('logo');
  const list = $('options');

  const STATUS = {
    on: 'YouTube plays like a podcast. Changes apply to open tabs right away.',
    off: 'YouTube looks and works as usual.',
  };

  function buildOptions() {
    for (const option of OPTIONS) {
      const id = `opt-${option.key}`;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.className = 'switch';
      input.dataset.key = option.key;
      input.setAttribute('role', 'switch');
      input.addEventListener('change', () => saveSettings({ [option.key]: input.checked }));

      const label = document.createElement('span');
      label.className = 'opt__label';
      label.textContent = option.label;

      const hint = document.createElement('span');
      hint.className = 'opt__hint';
      hint.textContent = option.hint;

      const text = document.createElement('span');
      text.className = 'opt__text';
      text.append(label, hint);

      const row = document.createElement('label');
      row.className = 'opt';
      row.htmlFor = id;
      row.append(text, input);
      list.append(row);
    }
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
