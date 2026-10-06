# Architecture

Listen Mode is a Manifest V3 extension with no build step and no dependencies. This document explains
how the pieces fit together and how to repair it when YouTube changes its page, which it will.

## The pieces

```
                ┌──────────────┐        ┌──────────────────────┐
  click / ⌥⇧L ─▶│  popup/      │        │ background.js        │
                │  background  │──┐  ┌─▶│ (service worker)     │──▶ toolbar icon + badge
                └──────────────┘  │  │  └──────────────────────┘
                                  ▼  │
                      ┌────────────────────────┐
                      │ chrome.storage.sync    │  settings (on/off + options)
                      │ chrome.storage.local   │  playback speed
                      └────────────────────────┘
                                  │ onChanged
                                  ▼
  www.youtube.com tab   ┌──────────────────────────────────────────────┐
                        │ content.js  (isolated world)                 │
                        │  • classes on <html>  ──▶ content.css hides  │
                        │  • builds the episode header + player bar    │
                        │  • drives YouTube's <video> element          │
                        │  • autoplay guard, speed memory, Shorts      │
                        │  • sets <html data-ylm-data-saver="1|0">     │
                        └──────────────────────────────────────────────┘
                                  │ DOM attribute
                                  ▼
                        ┌──────────────────────────────────────────────┐
                        │ page-bridge.js  (MAIN world)                 │
                        │  • calls YouTube's player API for low quality│
                        └──────────────────────────────────────────────┘
```

**Storage is the single source of truth.** The popup and the keyboard shortcut only write to
`chrome.storage.sync`. The background worker (icon) and every open YouTube tab (content script)
listen to `chrome.storage.onChanged` and react. Nothing sends messages, so there's nothing to keep in
sync by hand.

## Files

| File | Runs in | Job |
| --- | --- | --- |
| `extension/manifest.json` | n/a | Declares permissions (`storage`), the two content scripts, the popup, the shortcut. |
| `extension/shared/settings.js` | everywhere | Defaults, option labels, speed steps, load/save helpers. Exposes `globalThis.YLM`. |
| `extension/background.js` | service worker | Swaps the toolbar icon and badge; toggles `enabled` on the shortcut; fills in missing defaults on install. |
| `extension/popup/*` | popup page | The Off/On slider and option switches. |
| `extension/content/content.css` | YouTube tab | Every hide rule, grouped by feature, plus the styles for our UI. |
| `extension/content/content.js` | YouTube tab, isolated world | Settings → classes, player UI, autoplay guard, speed memory, Shorts redirect, home note. |
| `extension/content/visualizer.js` | YouTube tab, isolated world | The audio visualizer (Web Audio analyser + canvas). Exposes `globalThis.YLMVisualizer`. |
| `extension/content/page-bridge.js` | YouTube tab, MAIN world | Data saver only. |

## Settings

Stored in `chrome.storage.sync` (defaults in `shared/settings.js`):

| Key | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Master switch. Off means YouTube is untouched. |
| `hideVideo` | `true` | Collapse the player; show the episode header and bottom bar. |
| `visualizer` | `'none'` | What to draw in the episode header: `none`, `spectrogram`, `oscilloscope`, `analyzer` or `combined`. Needs `hideVideo`. |
| `fillPage` | `true` | The episode header fills the window. Needs `hideVideo`. |
| `hideRecommendations` | `true` | Hide sidebar, end screens, search shelves. |
| `hideVideoInfo` | `true` | Hide YouTube's metadata block under the player (channel row, buttons, description). |
| `hideComments` | `true` | Hide comments and live chat. |
| `hideFeedAndShorts` | `true` | Hide the home feed and Shorts; redirect `/shorts/ID` to `/watch?v=ID`. |
| `hideSidebar` | `true` | Hide the side menu (guide) on the home page and search results. |
| `hideThumbnails` | `true` | Hide video thumbnails everywhere and our own artwork; shrink large channel pictures to icon size. |
| `blockAutoplay` | `true` | Turn off YouTube's autoplay switch and stop at the end of every video. |
| `dataSaver` | `true` | Ask for the lowest quality, only while `hideVideo` is also on. |
| `accent` | `'teal'` | Accent colour; one of the `ACCENTS` in `settings.js`. |
| `theme` | `'system'` | `system`, `light` or `dark`. |

Stored in `chrome.storage.local`: `playbackRate` (number, default `1`).

To add a new option: add a key to `DEFAULTS` and an entry to `OPTIONS` in `settings.js` (the popup
builds itself from `OPTIONS`). If it's a pure CSS feature, add the key to `FEATURE_CLASSES` in
`content.js` and write the rules in `content.css` under the new class.

## How each feature works

### Hiding things
`content.js` mirrors the settings onto `<html>` as classes (`ylm-on`, `ylm-hide-video`, `ylm-fill`,
`ylm-hide-recs`, `ylm-hide-info`, `ylm-hide-comments`, `ylm-hide-feed`, `ylm-hide-nav`, `ylm-hide-thumbs`). Every rule in `content.css` is scoped under
those classes, so turning a feature off is just removing a class. That's why toggling is instant and
needs no reload. The CSS is injected at `document_start`, so hidden things don't flash on page load.

The side menu is the one page-dependent rule: the guide sits outside the page content, so
`content.js` also sets `ylm-no-nav-page` on `<html>` while the path is `/` or `/results`, and the `ylm-hide-nav` rules
require both classes.

With `hideThumbnails` on, the episode header and player bar hide their artwork and `paintMeta()`
doesn't set the image `src`, so the picture isn't downloaded either.

### Colour and light/dark
Each entry in `ACCENTS` has two shades: one for light backgrounds, one for dark. `content.js` puts
them on `<html>` as `--ylm-accent-l` / `--ylm-accent-d`, and `content.css` picks one and derives the
other accent tones with `color-mix()`. The injected UI is dark when YouTube is (`html[dark]`) unless
`theme` forces it with the `ylm-theme-light` / `ylm-theme-dark` classes. We never change YouTube's own
theme. The popup does the same with `--accent-l` / `--accent-d`, `light-dark()` and a `data-theme`
attribute; there, `system` follows the device. `light-dark()` is why Chromium 123 is the minimum.

### Hiding the video without stopping the audio
The player containers are collapsed to zero height with `overflow: hidden` and `opacity: 0`. The
`<video>` element itself is untouched, so YouTube keeps playing it normally, and media keys and the
OS media controls keep working. `display: none` is avoided on purpose: it can make players
misbehave.

### The player UI
`content.js` builds two pieces of DOM:

- **Episode header** (`#ylm-hero`), inserted on the watch page right above `#below` (title,
  description, comments). YouTube's own title is hidden while the header is mounted.
- **Player bar** (`#ylm-bar`), fixed to the bottom of the window. It stays visible when you browse
  away from the watch page while audio continues (YouTube's miniplayer keeps the `<video>` alive; we
  hide the miniplayer and show our bar instead). The close button pauses and hides it.

Both drive the `<video>` element directly (`play()`, `pause()`, `currentTime`, `playbackRate`) and
re-render on its events. Artwork is the video's `hqdefault.jpg` thumbnail; `object-fit: cover`
crops away the letterbox bars that image always has.

All DOM is built with `createElement` / `createElementNS`. **Never use `innerHTML` in the content
script:** YouTube enforces Trusted Types and string-to-HTML assignment can throw there.

### Visualizer
`visualizer.js` draws onto a `<canvas>` that is the first row of the episode header. `render()` in
`content.js` calls `YLMVisualizer.sync(canvas, video, mode, playing)`; it draws only while the header
is on screen and audio is playing, and keeps the last picture when paused.

The audio comes from `AudioContext.createMediaElementSource(video)` feeding an `AnalyserNode`. That
call permanently reroutes the element's sound through our context, so two rules apply: nothing is
created while the setting is `none`, and a video is only tapped once the context is `running` (a
suspended context would play silence). Once tapped, a video stays routed through the context until
the tab is reloaded, even if the visualizer is switched back off.

Each view draws inside a pane (a rectangle of the canvas). The single views get one full-size pane;
`combined` gets three from `panesFor()`: oscilloscope across the top, spectrogram bottom left,
analyzer bottom right.

Colours come from the `--ylm-*` tokens, so all three views follow YouTube's light and dark themes.

### Autoplay blocking
Two layers:

1. Every second, if YouTube's autoplay switch reports `aria-checked="true"`, it's clicked off
   (rate-limited to once per 5 s so it can never flap).
2. The reliable layer: on `timeupdate`, if less than ~0.5 s remains (scaled with playback speed),
   the video is paused. YouTube never sees `ended`, so it never navigates to the next video, also
   inside playlists. Ads and live streams are skipped by this guard.

### Speed memory
The bar's speed button cycles through `SPEEDS`. The chosen speed is saved to `storage.local` and
re-applied when a new video loads (YouTube resets the speed on load). If you change speed some other
way, for example with YouTube's <kbd>Shift</kbd>+<kbd>&gt;</kbd>, more than 3 s after a load, that
speed is remembered instead.

### Data saver
The content script can't call YouTube's player API because it runs in an isolated world.
`page-bridge.js` runs in the page's MAIN world (`"world": "MAIN"` in the manifest, Chromium 111+).
It watches one attribute, `<html data-ylm-data-saver>`, and when it's `"1"` calls
`movie_player.setPlaybackQualityRange(lowest, lowest)`. It has no access to extension APIs and sends
nothing anywhere. The player API is undocumented, so every call is wrapped in `try`.

### Shorts
With `hideFeedAndShorts` on: clicks on `/shorts/` links are intercepted (capture phase) and sent
to `/watch?v=ID`; a direct visit to a `/shorts/` URL is replaced the same way; Shorts shelves and
items are hidden by CSS.

### Why a one-second tick?
YouTube is a single-page app that re-renders large parts of the page all the time. Rather than
tracking every mutation, `tick()` re-asserts the desired state once a second and after each
`yt-navigate-finish` event. Every step is cheap and idempotent: classes are toggled, the UI is
mounted only if it isn't already, the `<video>` listeners are re-bound only if the element changed.

## When YouTube changes its page

Symptoms and where to look:

| Symptom | Look at |
| --- | --- |
| Something hidden is visible again | The matching section in `content.css` (sections are numbered by feature). |
| Video visible again, or a big empty gap | `content.css` section 1: the player container IDs. |
| Player bar missing or controls do nothing | `SEL.video` in `content.js`. |
| Episode header missing or in the wrong place | `SEL.below` and `SEL.primaryInner`. |
| Wrong or missing title/channel | `SEL.title`, `SEL.channel`. |
| Autoplay continues | `SEL.autoplayOn` (the guard should still stop it; check `stopAtEnd`). |
| Skip-ad button never shows | `SEL.skipAd`. |
| Visualizer stays blank, or no sound with it on | `attach()` in `visualizer.js`; check the `AudioContext` state. |
| Data saver does nothing | `page-bridge.js`: the player API may have changed. |

How to find the new selector:

1. Open a YouTube page, press <kbd>F12</kbd>, use the element picker on the thing that came back.
2. Walk up to the nearest stable custom element (`ytd-…`, `yt-…`) or an element with an `id`.
   Prefer those over generated class names.
3. Add the selector next to the old one (keep the old one; YouTube often runs both layouts at once
   for different users) and reload the extension.
4. Turn on debug logging if you need it: `localStorage.setItem('ylm-debug', '1')` in the YouTube tab,
   then reload and filter the console for `[Listen Mode]`.

Inspect the service worker from `brave://extensions` → the extension's card → **service worker**.

## Design notes

- **Palette:** "transistor teal" (`#17706B` light, `#5FD0C2` dark) on YouTube's own neutral
  backgrounds, so the player blends in while clearly not being YouTube red. The popup uses a cool
  mist background in light mode and deep enamel teal in dark mode.
- **Type:** the injected UI inherits YouTube's Roboto. The popup uses the system rounded face
  (`ui-rounded`, SF Pro Rounded on macOS) with system fallbacks, so no fonts are downloaded.
- **Motion:** one ambient animation only, the equaliser beside "time left" while audio plays. It
  respects `prefers-reduced-motion`.
