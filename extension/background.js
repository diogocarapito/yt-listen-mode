/*
 * Listen Mode for YouTube: background service worker.
 *
 * Two jobs:
 *   1. Keep the toolbar icon in sync with the on/off state
 *      (teal icon = on, grey icon with an "OFF" badge = off).
 *   2. Handle the keyboard shortcut (Alt+Shift+L by default).
 *
 * The popup and the shortcut only ever write to chrome.storage; every
 * other part of the extension reacts to storage changes.
 */
importScripts('shared/settings.js');

const ICONS = {
  on: {
    16: 'icons/icon-on-16.png',
    32: 'icons/icon-on-32.png',
    48: 'icons/icon-on-48.png',
    128: 'icons/icon-on-128.png',
  },
  off: {
    16: 'icons/icon-off-16.png',
    32: 'icons/icon-off-32.png',
    48: 'icons/icon-off-48.png',
    128: 'icons/icon-off-128.png',
  },
};

async function syncAction(enabled) {
  if (typeof enabled !== 'boolean') {
    enabled = (await YLM.loadSettings()).enabled;
  }
  const tasks = [
    chrome.action.setIcon({ path: enabled ? ICONS.on : ICONS.off }),
    chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' }),
    chrome.action.setBadgeBackgroundColor({ color: '#5F6866' }),
    chrome.action.setTitle({ title: `Listen Mode for YouTube: ${enabled ? 'on' : 'off'}` }),
  ];
  if (chrome.action.setBadgeTextColor) {
    tasks.push(chrome.action.setBadgeTextColor({ color: '#FFFFFF' }));
  }
  await Promise.all(tasks);
}

chrome.runtime.onInstalled.addListener(async () => {
  // Write any missing defaults so storage always holds the full settings object.
  const stored = await chrome.storage.sync.get(null);
  const missing = Object.fromEntries(
    Object.entries(YLM.DEFAULTS).filter(([key]) => !(key in stored)),
  );
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
  await syncAction();
});

chrome.runtime.onStartup.addListener(() => {
  syncAction().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'enabled' in changes) {
    syncAction(changes.enabled.newValue).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== YLM.COMMAND) return;
  const { enabled } = await YLM.loadSettings();
  await YLM.saveSettings({ enabled: !enabled });
});

// The browser stops and restarts service workers often; re-sync every time this file runs.
syncAction().catch(() => {});
