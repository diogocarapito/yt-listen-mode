/*
 * Listen Mode for YouTube: content script.
 * Runs in an isolated world on https://www.youtube.com/*.
 *
 * What it does:
 *   1. Mirrors the settings onto <html> as CSS classes. All the hiding
 *      happens in content.css, keyed on those classes, so toggling is
 *      instant and needs no reload.
 *   2. Builds the podcast-style UI (an episode header on the watch page and
 *      a player bar fixed to the bottom of the window) and drives YouTube's
 *      own <video> element from it. The header can hold an audio
 *      visualizer, drawn by visualizer.js.
 *   3. Blocks autoplay, remembers playback speed, and sends Shorts to the
 *      regular player.
 *
 * YouTube enforces Trusted Types, so this file never assigns innerHTML.
 * Every node is built with createElement / createElementNS.
 */
(() => {
  'use strict';

  if (globalThis.__ylmContentLoaded) return;
  globalThis.__ylmContentLoaded = true;

  const { DEFAULTS, SPEEDS, accentFor, loadSettings, loadPlaybackRate, savePlaybackRate } = globalThis.YLM;
  const visualizer = globalThis.YLMVisualizer;

  /* ------------------------------------------------------------------ *
   * Selectors that depend on YouTube's markup.                          *
   * When YouTube ships a redesign, start here and in content.css.       *
   * See docs/ARCHITECTURE.md, "When YouTube changes its page".          *
   * ------------------------------------------------------------------ */
  const SEL = {
    video: [
      'ytd-watch-flexy video.html5-main-video',
      'ytd-miniplayer video.html5-main-video',
      '#movie_player video.html5-main-video',
    ],
    adShowing: '#movie_player.ad-showing',
    live: '#movie_player.ytp-live',
    skipAd: ['.ytp-skip-ad-button', '.ytp-ad-skip-button-modern', '.ytp-ad-skip-button'],
    autoplayOn: '.ytp-autonav-toggle-button[aria-checked="true"]',
    below: 'ytd-watch-flexy #below',
    primaryInner: 'ytd-watch-flexy #primary-inner',
    title: ['ytd-watch-metadata #title h1', 'ytd-watch-metadata h1'],
    channel: [
      'ytd-watch-metadata #owner ytd-channel-name a',
      'ytd-watch-metadata ytd-channel-name a',
      'ytd-video-owner-renderer ytd-channel-name a',
    ],
    homeBrowse: 'ytd-browse[page-subtype="home"]',
  };

  /** Setting key → class on <html>. content.css does the rest. */
  const FEATURE_CLASSES = {
    hideVideo: 'ylm-hide-video',
    fillPage: 'ylm-fill',
    hideRecommendations: 'ylm-hide-recs',
    hideVideoInfo: 'ylm-hide-info',
    hideComments: 'ylm-hide-comments',
    hideFeedAndShorts: 'ylm-hide-feed',
    hideSidebar: 'ylm-hide-nav',
    hideThumbnails: 'ylm-hide-thumbs',
  };

  const SKIP_BACK_S = 15;
  const SKIP_FORWARD_S = 30;
  const TICK_MS = 1000;
  const VIDEO_EVENTS = [
    'play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata',
    'ratechange', 'seeked', 'emptied', 'ended',
  ];

  const html = document.documentElement;
  const DEBUG = (() => {
    try { return localStorage.getItem('ylm-debug') === '1'; } catch { return false; }
  })();
  const log = (...args) => { if (DEBUG) console.debug('[Listen Mode]', ...args); };

  let settings = { ...DEFAULTS };
  let savedRate = 1;
  let ready = false;
  let appliedAccent = '';

  const state = {
    video: null,
    meta: { id: '', title: '', channel: '' },
    session: false,      // a listening session exists (it survives leaving the watch page)
    dismissed: false,    // the user closed the player bar
    seeking: false,      // the user is dragging the scrubber
    lastLoadAt: 0,       // when the current video's metadata loaded
    lastAutoplayClick: 0,
    rateTimer: 0,
  };

  const ui = {
    bar: null,
    hero: null,
    playButtons: [],
  };

  /* ------------------------------------------------------------------ *
   * Small helpers                                                       *
   * ------------------------------------------------------------------ */
  const $ = (selector) => document.querySelector(selector);
  const first = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  };
  const textOf = (selectors) => (first(selectors)?.textContent || '').trim();
  const isWatchPage = () => location.pathname === '/watch';
  /** Pages kept minimal: with `hideSidebar` on, the side menu is hidden here. */
  const isSearchFirstPage = () => location.pathname === '/' || location.pathname === '/results';
  const currentVideoId = () => new URLSearchParams(location.search).get('v') || '';
  const isAdShowing = () => !!$(SEL.adShowing);
  const isLive = () => !!$(SEL.live);
  const listenUiEnabled = () => settings.enabled && settings.hideVideo;
  const artworkEnabled = () => !(settings.enabled && settings.hideThumbnails);
  const hasMedia = (video) => !!(video && (video.currentSrc || video.src));

  /** Run a chrome.* call without crashing if the extension was reloaded under us. */
  function safe(fn) {
    try {
      const result = fn();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) { /* extension context invalidated */ }
  }

  function docTitle() {
    return document.title.replace(/^\(\d+\+?\)\s*/, '').replace(/\s+-\s+YouTube$/, '').trim();
  }

  function shortsIdFrom(path) {
    const match = /^\/shorts\/([A-Za-z0-9_-]{6,})/.exec(path || '');
    return match ? match[1] : '';
  }

  function fmtTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function fmtRate(rate) {
    return `${Number((rate || 1).toFixed(2))}×`;
  }

  /** Time left at the current speed, the way podcast apps show it. */
  function fmtRemaining(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 60) return 'Less than a minute left';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min left`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min left` : `${h} h left`;
  }

  /* ------------------------------------------------------------------ *
   * DOM builders (no innerHTML, see the note at the top)                *
   * ------------------------------------------------------------------ */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value);
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat()) {
      if (child != null) el.append(child);
    }
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs = {}, children = []) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    for (const child of children) el.append(child);
    return el;
  }

  function svgNumber(text) {
    const el = svgEl('text', {
      x: 12, y: 15.7, 'text-anchor': 'middle', 'font-size': 7.2, 'font-weight': 700,
    });
    el.textContent = text;
    return el;
  }

  // A ring with an arrow head; the skip amount is drawn inside it.
  const RING = 'M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z';

  const ICONS = {
    play: () => [svgEl('path', {
      d: 'M8 5.5v13l10.5-6.5z', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round',
    })],
    pause: () => [
      svgEl('rect', { x: 6.5, y: 5, width: 4, height: 14, rx: 1.2 }),
      svgEl('rect', { x: 13.5, y: 5, width: 4, height: 14, rx: 1.2 }),
    ],
    back: () => [svgEl('path', { d: RING }), svgNumber(String(SKIP_BACK_S))],
    forward: () => [
      svgEl('g', { transform: 'matrix(-1 0 0 1 24 0)' }, [svgEl('path', { d: RING })]),
      svgNumber(String(SKIP_FORWARD_S)),
    ],
    close: () => [svgEl('path', {
      d: 'M7 7l10 10M17 7 7 17', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round',
    })],
  };

  function icon(name) {
    return svgEl('svg', {
      class: `ylm-i ylm-i-${name}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
    }, ICONS[name]());
  }

  function iconButton(label, iconNames, onClick, className) {
    return h('button', {
      type: 'button', class: className, 'aria-label': label, title: label, onclick: onClick,
    }, iconNames.map(icon));
  }

  function eqBars(extraClass = '') {
    return h('span', { class: `ylm-eq ${extraClass}`.trim(), 'aria-hidden': 'true' },
      h('span'), h('span'), h('span'));
  }

  function buildUI() {
    // Bottom player bar.
    const barPlay = iconButton('Play', ['play', 'pause'], togglePlay, 'ylm-btn ylm-btn--play ylm-play');
    ui.barArt = h('img', { class: 'ylm-bar__art', alt: '', decoding: 'async' });
    ui.barTitle = h('span', { class: 'ylm-bar__title' });
    ui.barChannel = h('span', { class: 'ylm-bar__channel' });
    ui.cur = h('span', { class: 'ylm-time ylm-time--cur' }, '0:00');
    ui.dur = h('span', { class: 'ylm-time' }, '0:00');
    ui.range = h('input', {
      class: 'ylm-range', type: 'range', min: 0, max: 1000, step: 1, value: 0,
      'aria-label': 'Seek', oninput: onSeekInput, onchange: onSeekCommit,
    });
    ui.speed = h('button', {
      type: 'button',
      class: 'ylm-pill ylm-speed',
      title: 'Playback speed. Click for faster, Shift-click or right-click for slower.',
      onclick: (e) => cycleSpeed(e.shiftKey ? -1 : 1),
      oncontextmenu: (e) => { e.preventDefault(); cycleSpeed(-1); },
    }, '1×');
    ui.skip = h('button', {
      type: 'button', class: 'ylm-pill ylm-pill--accent', hidden: true, onclick: skipAd,
    }, 'Skip ad');

    ui.bar = h('div', { id: 'ylm-bar', role: 'region', 'aria-label': 'Listen Mode player', hidden: true },
      h('a', { class: 'ylm-bar__info', href: '/', title: 'Go to the episode page', onclick: onInfoClick },
        ui.barArt,
        h('span', { class: 'ylm-bar__text' }, ui.barTitle, ui.barChannel)),
      h('div', { class: 'ylm-bar__center' },
        h('div', { class: 'ylm-bar__controls' },
          iconButton(`Back ${SKIP_BACK_S} seconds`, ['back'], () => skipBy(-SKIP_BACK_S), 'ylm-btn'),
          barPlay,
          iconButton(`Forward ${SKIP_FORWARD_S} seconds`, ['forward'], () => skipBy(SKIP_FORWARD_S), 'ylm-btn')),
        h('div', { class: 'ylm-bar__timeline' }, ui.cur, ui.range, ui.dur)),
      h('div', { class: 'ylm-bar__right' },
        ui.skip,
        ui.speed,
        iconButton('Close player', ['close'], dismiss, 'ylm-btn ylm-btn--quiet')));

    // Episode header on the watch page, where the video used to be.
    ui.viz = h('canvas', { class: 'ylm-hero__viz', 'aria-hidden': 'true', hidden: true });
    ui.heroArt = h('img', { alt: '', decoding: 'async' });
    ui.heroTitle = h('h2', { class: 'ylm-hero__title' });
    ui.heroChannel = h('p', { class: 'ylm-hero__channel' });
    ui.heroLabel = h('span', {}, 'Play');
    ui.remaining = h('span', { class: 'ylm-hero__remaining' });
    const heroPlay = h('button', { type: 'button', class: 'ylm-hero__play ylm-play', onclick: togglePlay },
      icon('play'), icon('pause'), ui.heroLabel);

    ui.hero = h('section', { id: 'ylm-hero', 'aria-label': 'Now playing', hidden: true },
      ui.viz,
      h('div', { class: 'ylm-hero__row' },
        h('div', { class: 'ylm-hero__art' }, ui.heroArt),
        h('div', { class: 'ylm-hero__body' },
          ui.heroTitle,
          ui.heroChannel,
          h('div', { class: 'ylm-hero__actions' },
            heroPlay,
            h('span', { class: 'ylm-hero__status' }, eqBars(), ui.remaining)))));

    ui.playButtons = [barPlay, heroPlay];
    paintMeta();
  }

  function buildHomeNote() {
    return h('div', { id: 'ylm-home-note', role: 'note' },
      eqBars('ylm-eq--big'),
      h('h2', { class: 'ylm-home-note__title' }, 'Search for something to listen to'),
      h('p', { class: 'ylm-home-note__text' },
        'Listen Mode hides the home feed, so nothing pulls you in. Use the search bar, or start from a list you made yourself.'),
      h('div', { class: 'ylm-home-note__links' },
        h('a', { href: '/feed/subscriptions' }, 'Subscriptions'),
        h('a', { href: '/playlist?list=WL' }, 'Watch later')));
  }

  /* ------------------------------------------------------------------ *
   * Player actions                                                      *
   * ------------------------------------------------------------------ */
  function togglePlay() {
    const v = state.video;
    if (!v) return;
    if (v.paused || v.ended) {
      // Stopped at (or near) the end: start the episode again.
      if (Number.isFinite(v.duration) && v.duration - v.currentTime <= 1) v.currentTime = 0;
      safe(() => v.play());
    } else {
      v.pause();
    }
  }

  function skipBy(seconds) {
    const v = state.video;
    if (!v || isAdShowing()) return;
    const max = Number.isFinite(v.duration) ? Math.max(0, v.duration - 1) : v.currentTime + seconds;
    v.currentTime = Math.min(max, Math.max(0, v.currentTime + seconds));
    render();
  }

  function onSeekInput() {
    const v = state.video;
    if (!v || !Number.isFinite(v.duration)) return;
    state.seeking = true;
    const fraction = ui.range.valueAsNumber / 1000;
    ui.cur.textContent = fmtTime(fraction * v.duration);
    ui.range.style.setProperty('--ylm-pct', `${fraction * 100}%`);
  }

  function onSeekCommit() {
    const v = state.video;
    if (v && Number.isFinite(v.duration)) {
      v.currentTime = (ui.range.valueAsNumber / 1000) * v.duration;
    }
    state.seeking = false;
    render();
  }

  function cycleSpeed(direction) {
    const current = state.video?.playbackRate || savedRate;
    const next = direction > 0
      ? SPEEDS.find((s) => s > current + 0.001) ?? SPEEDS[0]
      : [...SPEEDS].reverse().find((s) => s < current - 0.001) ?? SPEEDS[SPEEDS.length - 1];
    setRate(next);
  }

  /** Remember a speed and apply it now (unless an ad is playing). */
  function setRate(rate) {
    savedRate = rate;
    safe(() => savePlaybackRate(rate));
    const v = state.video;
    if (v && !isAdShowing() && Math.abs(v.playbackRate - rate) > 0.001) v.playbackRate = rate;
    render();
  }

  function dismiss() {
    state.video?.pause();
    state.dismissed = true;
    state.session = false;
    render();
  }

  function findSkipButton() {
    for (const selector of SEL.skipAd) {
      const btn = document.querySelector(selector);
      if (!btn) continue;
      const visible = typeof btn.checkVisibility === 'function'
        ? btn.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
        : true;
      if (visible) return btn;
    }
    return null;
  }

  function skipAd() {
    findSkipButton()?.click();
  }

  function onInfoClick(event) {
    if (isWatchPage()) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!state.meta.id) {
      event.preventDefault();
      return;
    }
    // A full page load is fine here; &t= resumes where you are.
    const t = Math.floor(state.video?.currentTime || 0);
    event.currentTarget.href = `/watch?v=${encodeURIComponent(state.meta.id)}${t ? `&t=${t}s` : ''}`;
  }

  /* ------------------------------------------------------------------ *
   * Video element: binding, autoplay guard, speed memory                *
   * ------------------------------------------------------------------ */
  function findVideo() {
    return first(SEL.video);
  }

  function bindVideo(video) {
    if (video === state.video) return;
    if (state.video) {
      for (const type of VIDEO_EVENTS) state.video.removeEventListener(type, onVideoEvent);
    }
    state.video = video;
    if (video) {
      for (const type of VIDEO_EVENTS) video.addEventListener(type, onVideoEvent);
      log('Bound to video element');
    }
  }

  function onVideoEvent(event) {
    const v = event.currentTarget;
    switch (event.type) {
      case 'loadedmetadata':
        state.lastLoadAt = Date.now();
        scheduleRate();
        break;
      case 'play':
        state.dismissed = false;
        if (listenUiEnabled()) state.session = true;
        break;
      case 'timeupdate':
        stopAtEnd(v);
        break;
      case 'ratechange':
        onRateChange(v);
        break;
      case 'emptied':
        if (!isWatchPage()) state.session = false;
        break;
      default:
        break;
    }
    render();
  }

  /**
   * Autoplay guard: pause just before the end, so YouTube never gets the
   * "ended" event it uses to jump to the next video (also inside playlists).
   * The cost is the last half second or so of the video.
   */
  function stopAtEnd(v) {
    if (!settings.enabled || !settings.blockAutoplay) return;
    if (v.paused || isAdShowing() || isLive()) return;
    const d = v.duration;
    if (!Number.isFinite(d) || d < 2 || d > 12 * 3600) return;
    const margin = Math.max(0.5, 0.35 * (v.playbackRate || 1));
    if (d - v.currentTime <= margin) {
      v.pause();
      log('Stopped at the end of the video');
    }
  }

  /** Belt and braces: also switch off YouTube's own autoplay toggle. */
  function disableYouTubeAutoplay() {
    if (Date.now() - state.lastAutoplayClick < 5000) return;
    const toggle = $(SEL.autoplayOn);
    if (!toggle) return;
    state.lastAutoplayClick = Date.now();
    (toggle.closest('button') || toggle).click();
    log('Switched YouTube autoplay off');
  }

  function scheduleRate() {
    clearTimeout(state.rateTimer);
    state.rateTimer = setTimeout(applySavedRate, 250);
  }

  function applySavedRate() {
    const v = state.video;
    if (!v || !listenUiEnabled() || isAdShowing()) return;
    if (Math.abs(v.playbackRate - savedRate) > 0.001) v.playbackRate = savedRate;
  }

  function onRateChange(v) {
    if (!listenUiEnabled() || isAdShowing()) return;
    const rate = v.playbackRate;
    if (Math.abs(rate - savedRate) < 0.001) return;
    if (Date.now() - state.lastLoadAt < 3000) {
      // YouTube resets the speed when a new video loads; put ours back.
      scheduleRate();
      return;
    }
    // Changed somewhere else (e.g. YouTube's Shift+> shortcut): remember it.
    setRate(rate);
  }

  /* ------------------------------------------------------------------ *
   * Page features: Shorts redirect, home note, metadata                 *
   * ------------------------------------------------------------------ */
  function redirectShorts() {
    const id = shortsIdFrom(location.pathname);
    if (id) location.replace(`/watch?v=${id}`);
  }

  function interceptShortsClick(event) {
    if (!ready || !settings.enabled || !settings.hideFeedAndShorts) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href*="/shorts/"]') : null;
    if (!link) return;
    const id = shortsIdFrom(new URL(link.href, location.origin).pathname);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(`/watch?v=${id}`);
  }

  function syncHomeNote() {
    const existing = document.getElementById('ylm-home-note');
    if (!settings.enabled || !settings.hideFeedAndShorts) {
      existing?.remove();
      return;
    }
    const browse = $(SEL.homeBrowse);
    if (!browse) return;
    const note = existing || buildHomeNote();
    if (note.parentNode !== browse) browse.prepend(note);
  }

  function refreshMeta() {
    if (!isWatchPage()) return; // keep the last episode's details while browsing
    const id = currentVideoId();
    const title = textOf(SEL.title) || docTitle();
    const channel = textOf(SEL.channel);
    const { meta } = state;
    if (id === meta.id && title === meta.title && channel === meta.channel) return;
    if (id !== meta.id) state.dismissed = false;
    state.meta = { id, title, channel };
    paintMeta();
  }

  function paintMeta() {
    if (!ui.bar) return;
    const { id, title, channel } = state.meta;
    if (!artworkEnabled()) {
      // Thumbnails are hidden: don't download the artwork either.
      for (const img of [ui.barArt, ui.heroArt]) {
        img.removeAttribute('src');
        delete img.dataset.id;
      }
    } else if (id && ui.barArt.dataset.id !== id) {
      // hqdefault always exists; content.css crops away its letterbox bands.
      const src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
      for (const img of [ui.barArt, ui.heroArt]) {
        img.src = src;
        img.dataset.id = id;
      }
    }
    ui.barTitle.textContent = title;
    ui.heroTitle.textContent = title;
    ui.heroChannel.textContent = channel;
    ui.bar.setAttribute('aria-label', title ? `Now playing: ${title}` : 'Listen Mode player');
  }

  /* ------------------------------------------------------------------ *
   * UI lifecycle and rendering                                          *
   * ------------------------------------------------------------------ */
  function ensureUI() {
    if (!ui.bar) buildUI();
    if (!ui.bar.isConnected && document.body) document.body.append(ui.bar);
    if (isWatchPage()) mountHero();
  }

  function mountHero() {
    const below = $(SEL.below);
    if (below) {
      if (ui.hero.nextElementSibling !== below) below.before(ui.hero);
      return;
    }
    const inner = $(SEL.primaryInner);
    if (inner && ui.hero.parentNode !== inner) inner.prepend(ui.hero);
  }

  function teardownUI() {
    visualizer.stop();
    ui.bar?.remove();
    ui.hero?.remove();
    html.classList.remove('ylm-bar-visible', 'ylm-hero-mounted');
  }

  function wantBar(v) {
    if (!listenUiEnabled() || state.dismissed || !hasMedia(v)) return false;
    return isWatchPage() || state.session;
  }

  function render() {
    if (!ui.bar) return;
    const v = state.video;
    const showBar = wantBar(v);
    const showHero = listenUiEnabled() && isWatchPage() && ui.hero.isConnected;

    ui.bar.hidden = !showBar;
    ui.hero.hidden = !showHero;
    html.classList.toggle('ylm-bar-visible', showBar && ui.bar.isConnected);
    html.classList.toggle('ylm-hero-mounted', showHero);

    // The visualizer only draws while the header is on screen and audio plays.
    const mode = showHero ? settings.visualizer : 'none';
    ui.viz.hidden = mode === 'none';
    visualizer.sync(ui.viz, v, mode, !!v && !v.paused);

    if (!v || (!showBar && !showHero)) return;

    const ad = isAdShowing();
    const live = isLive() || v.duration === Infinity;
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const current = v.currentTime || 0;
    const paused = v.paused;

    for (const btn of ui.playButtons) {
      const value = String(paused);
      if (btn.dataset.paused === value) continue;
      btn.dataset.paused = value;
      if (btn.hasAttribute('aria-label')) {
        btn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
        btn.title = paused ? 'Play' : 'Pause';
      }
    }
    ui.heroLabel.textContent = paused ? 'Play' : 'Pause';
    ui.hero.dataset.playing = String(!paused);

    if (!state.seeking) {
      const pct = duration && !live ? Math.min(100, (current / duration) * 100) : 0;
      ui.range.value = String(Math.round(pct * 10));
      ui.range.style.setProperty('--ylm-pct', `${pct}%`);
      ui.cur.textContent = fmtTime(current);
    }
    ui.range.disabled = live || ad || !duration;
    ui.range.setAttribute('aria-valuetext', `${fmtTime(current)} of ${fmtTime(duration)}`);
    ui.dur.textContent = live ? 'Live' : fmtTime(duration);
    ui.speed.textContent = fmtRate(v.playbackRate);
    ui.barChannel.textContent = ad ? 'Ad playing' : state.meta.channel;
    ui.remaining.textContent = ad
      ? 'Ad playing'
      : live ? 'Live stream' : fmtRemaining((duration - current) / (v.playbackRate || 1));
    ui.skip.hidden = !(ad && findSkipButton());
  }

  /* ------------------------------------------------------------------ *
   * Settings and the main loop                                          *
   * ------------------------------------------------------------------ */
  function applyHtmlState() {
    const on = !!settings.enabled;
    html.classList.toggle('ylm-on', on);
    for (const [key, className] of Object.entries(FEATURE_CLASSES)) {
      html.classList.toggle(className, on && !!settings[key]);
    }
    // The side menu sits outside the page content, so its rules need to know the page.
    html.classList.toggle('ylm-no-nav-page', on && isSearchFirstPage());

    // Look: a forced light/dark theme (otherwise we follow YouTube's) and the accent colour.
    html.classList.toggle('ylm-theme-light', on && settings.theme === 'light');
    html.classList.toggle('ylm-theme-dark', on && settings.theme === 'dark');
    const accent = on ? accentFor(settings) : null;
    if ((accent?.value || '') !== appliedAccent) {
      appliedAccent = accent?.value || '';
      for (const [name, value] of [['--ylm-accent-l', accent?.light], ['--ylm-accent-d', accent?.dark]]) {
        if (value) html.style.setProperty(name, value);
        else html.style.removeProperty(name);
      }
    }
    // Read by page-bridge.js (main world) to force the lowest quality.
    const saver = on && settings.hideVideo && settings.dataSaver ? '1' : '0';
    if (html.dataset.ylmDataSaver !== saver) html.dataset.ylmDataSaver = saver;
  }

  function applySettings(previous) {
    applyHtmlState();
    paintMeta();
    const wasListening = !!previous && previous.enabled && previous.hideVideo;
    if (listenUiEnabled() && !wasListening) {
      state.dismissed = false;
      scheduleRate();
    }
    tick();
  }

  /**
   * Runs every second and after every YouTube navigation. YouTube is a
   * single-page app that re-renders constantly, so instead of chasing
   * every mutation we re-assert the desired state; each step is cheap
   * and idempotent.
   */
  function tick() {
    if (!ready) return;
    try {
      applyHtmlState();
      syncHomeNote();
      if (!settings.enabled) {
        teardownUI();
        return;
      }
      if (settings.hideFeedAndShorts) redirectShorts();
      if (settings.blockAutoplay) disableYouTubeAutoplay();
      bindVideo(findVideo());
      refreshMeta();
      if (listenUiEnabled()) {
        ensureUI();
        if (isWatchPage() && hasMedia(state.video) && !state.dismissed) state.session = true;
      } else {
        teardownUI();
      }
      render();
    } catch (err) {
      log('tick failed', err);
    }
  }

  function onNavigate() {
    if (!ready) return;
    if (isWatchPage()) state.dismissed = false;
    tick();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.playbackRate) {
      const rate = Number(changes.playbackRate.newValue);
      if (rate > 0) savedRate = rate;
      return;
    }
    if (area !== 'sync') return;
    const previous = { ...settings };
    let touched = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) {
        settings[key] = changes[key].newValue ?? DEFAULTS[key];
        touched = true;
      }
    }
    if (touched) applySettings(previous);
  });

  document.addEventListener('yt-navigate-finish', onNavigate);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('popstate', onNavigate);
  window.addEventListener('click', interceptShortsClick, true);

  Promise.all([loadSettings(), loadPlaybackRate()])
    .then(([loaded, rate]) => {
      settings = loaded;
      savedRate = rate;
      ready = true;
      applySettings(null);
      setInterval(tick, TICK_MS);
      log('Ready', settings);
    })
    .catch((err) => console.warn('[Listen Mode] Could not load settings', err));
})();
