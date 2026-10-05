/*
 * Listen Mode for YouTube: shared settings.
 *
 * Every part of the extension loads this file, so defaults and option
 * labels live in exactly one place:
 *   - background.js   via importScripts()
 *   - content script  listed before content.js in manifest.json
 *   - popup           via a <script> tag
 *
 * It exposes a single global: YLM.
 */
(function (root) {
  'use strict';

  /** Saved in chrome.storage.sync, so they follow the browser profile. */
  const DEFAULTS = Object.freeze({
    enabled: true,
    hideVideo: true,
    hideRecommendations: true,
    hideComments: true,
    hideFeedAndShorts: true,
    hideSidebar: true,
    hideThumbnails: true,
    blockAutoplay: true,
    dataSaver: true,
  });

  /** What the popup shows for each option, in display order. */
  const OPTIONS = Object.freeze([
    { key: 'hideVideo', label: 'Hide the video', hint: 'Audio keeps playing, podcast style.' },
    { key: 'hideRecommendations', label: 'Hide recommendations', hint: 'Sidebar, end screens and “up next”.' },
    { key: 'hideComments', label: 'Hide comments and live chat', hint: 'Comments are never loaded.' },
    { key: 'hideFeedAndShorts', label: 'Hide home feed and Shorts', hint: 'Shorts links open as regular videos.' },
    { key: 'hideSidebar', label: 'Hide the side menu on home', hint: 'Leaves just the search bar.' },
    { key: 'hideThumbnails', label: 'Hide thumbnails', hint: 'Text-only results, lists and player.' },
    { key: 'blockAutoplay', label: 'Block autoplay', hint: 'Stops at the end of every video.' },
    { key: 'dataSaver', label: 'Save data', hint: 'Lowest quality while the video is hidden.' },
  ]);

  /** Speeds the player's speed button cycles through. */
  const SPEEDS = Object.freeze([0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]);

  /** Name of the keyboard command declared in manifest.json. */
  const COMMAND = 'toggle-listen-mode';

  async function loadSettings() {
    const stored = await chrome.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...stored };
  }

  function saveSettings(patch) {
    return chrome.storage.sync.set(patch);
  }

  /** Playback speed changes often, so it stays on this device (storage.local). */
  async function loadPlaybackRate() {
    const { playbackRate } = await chrome.storage.local.get({ playbackRate: 1 });
    const rate = Number(playbackRate);
    return rate >= 0.25 && rate <= 4 ? rate : 1;
  }

  function savePlaybackRate(rate) {
    return chrome.storage.local.set({ playbackRate: rate });
  }

  root.YLM = Object.freeze({
    DEFAULTS,
    OPTIONS,
    SPEEDS,
    COMMAND,
    loadSettings,
    saveSettings,
    loadPlaybackRate,
    savePlaybackRate,
  });
})(globalThis);
