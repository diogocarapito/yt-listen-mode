/*
 * Listen Mode for YouTube: page bridge.
 * Runs in the page's MAIN world (see "world": "MAIN" in manifest.json).
 *
 * The content script lives in an isolated world and cannot call YouTube's
 * player API. This tiny script can. It does exactly one thing: while
 * <html data-ylm-data-saver="1"> is set by the content script, it asks the
 * player for its lowest picture quality, because nobody is looking at it.
 *
 * It reads one attribute and talks to nothing else: no messages, no
 * network, no access to extension APIs.
 */
(() => {
  'use strict';

  const ATTR = 'data-ylm-data-saver';
  let forced = false;

  function apply() {
    const want = document.documentElement.getAttribute(ATTR) === '1';
    const player = document.getElementById('movie_player');
    if (!player || typeof player.getAvailableQualityLevels !== 'function') return;

    try {
      if (want) {
        // Levels come highest first, with "auto" last, e.g. [..., "small", "tiny", "auto"].
        const levels = player.getAvailableQualityLevels().filter((q) => q && q !== 'auto');
        const lowest = levels[levels.length - 1];
        if (!lowest || player.getPlaybackQuality() === lowest) return;
        if (typeof player.setPlaybackQualityRange === 'function') {
          player.setPlaybackQualityRange(lowest, lowest);
        } else if (typeof player.setPlaybackQuality === 'function') {
          player.setPlaybackQuality(lowest);
        }
        forced = true;
      } else if (forced) {
        forced = false;
        // Hand quality back to YouTube. If this ever stops working, picking a
        // quality in YouTube's gear menu or reloading the page restores it.
        if (typeof player.setPlaybackQualityRange === 'function') {
          player.setPlaybackQualityRange('auto', 'auto');
        }
      }
    } catch (_) {
      // The player API is undocumented and can change; fail quietly.
    }
  }

  setInterval(apply, 2000);
  document.addEventListener('yt-navigate-finish', () => setTimeout(apply, 500));
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ATTR],
  });
})();
