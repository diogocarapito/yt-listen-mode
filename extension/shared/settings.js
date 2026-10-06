/*
 * Listen Mode for YouTube: shared settings.
 *
 * Every part of the extension loads this file, so defaults and option
 * labels live in exactly one place:
 *   - background.js   via importScripts()
 *   - content scripts listed before the others in manifest.json
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
    visualizer: 'none',
    fillPage: true,
    hideRecommendations: true,
    hideVideoInfo: true,
    hideComments: true,
    hideFeedAndShorts: true,
    hideSidebar: true,
    hideThumbnails: true,
    blockAutoplay: true,
    dataSaver: true,
    accent: 'teal',
    theme: 'system',
  });

  /** What the popup shows for each option, in display order. The hint is the row's tooltip. */
  const OPTIONS = Object.freeze([
    { key: 'hideVideo', label: 'Hide the video', hint: 'Audio keeps playing, podcast style.' },
    { key: 'fillPage', label: 'Fill the page', hint: 'The player panel takes the whole window; scroll down for the rest.' },
    { key: 'hideRecommendations', label: 'Hide recommendations', hint: 'Sidebar, end screens and “up next”.' },
    { key: 'hideVideoInfo', label: 'Hide video info', hint: 'Channel row, like and share buttons, and the description.' },
    { key: 'hideComments', label: 'Hide comments and live chat', hint: 'Comments are never loaded.' },
    { key: 'hideFeedAndShorts', label: 'Hide home feed and Shorts', hint: 'Shorts links open as regular videos.' },
    { key: 'hideSidebar', label: 'Hide the side menu', hint: 'On the home page and in search results.' },
    { key: 'hideThumbnails', label: 'Hide thumbnails', hint: 'Text-only results, lists and player.' },
    { key: 'blockAutoplay', label: 'Block autoplay', hint: 'Stops at the end of every video.' },
    { key: 'dataSaver', label: 'Save data', hint: 'Lowest quality while the video is hidden.' },
  ]);

  /** What can be drawn where the video was (the `visualizer` setting). */
  const VISUALIZERS = Object.freeze([
    { value: 'none', label: 'None' },
    { value: 'spectrogram', label: 'Spectrogram' },
    { value: 'oscilloscope', label: 'Oscilloscope' },
    { value: 'analyzer', label: 'Frequency analyzer' },
    { value: 'combined', label: 'All three' },
  ]);

  /**
   * Accent colours (the `accent` setting). Each has a darker shade for light
   * backgrounds and a lighter one for dark backgrounds; the stylesheets derive
   * the other accent tones from these two.
   */
  const ACCENTS = Object.freeze([
    { value: 'teal', label: 'Teal', light: '#17706b', dark: '#5fd0c2' },
    { value: 'blue', label: 'Blue', light: '#1f5fbf', dark: '#7db4ff' },
    { value: 'violet', label: 'Violet', light: '#6a4bc4', dark: '#b7a1ff' },
    { value: 'rose', label: 'Rose', light: '#b83268', dark: '#ff8fb7' },
    { value: 'amber', label: 'Amber', light: '#955a00', dark: '#f2b84b' },
    { value: 'green', label: 'Green', light: '#2c7a3d', dark: '#7fd48d' },
    { value: 'graphite', label: 'Graphite', light: '#4a5560', dark: '#b9c4cf' },
  ]);

  /** Light or dark (the `theme` setting). "System" means: don't force either. */
  const THEMES = Object.freeze([
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]);

  function accentFor(settings) {
    return ACCENTS.find((accent) => accent.value === settings.accent) || ACCENTS[0];
  }

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
    VISUALIZERS,
    ACCENTS,
    THEMES,
    accentFor,
    SPEEDS,
    COMMAND,
    loadSettings,
    saveSettings,
    loadPlaybackRate,
    savePlaybackRate,
  });
})(globalThis);
