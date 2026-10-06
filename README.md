<p align="center">
  <img src="extension/icons/icon-on-128.png" width="96" height="96" alt="Listen Mode icon">
</p>

<h1 align="center">Listen Mode for YouTube</h1>

<p align="center">
  A small browser extension for Brave (and any Chromium browser) that turns YouTube into a calm,
  podcast-style audio player. No video, no recommendations, no comments, no autoplay.
</p>

---

## Why

YouTube hosts a huge amount of great listening: lectures, interviews, talks and full podcast
episodes. But the page around them is built to keep you watching. Listen Mode keeps the thing you
chose and removes the rest, so you can press play, listen, and stop.

## What it does

When Listen Mode is **on**:

| Feature | What happens |
| --- | --- |
| **Hide the video** | The picture disappears and audio keeps playing. The watch page shows an episode header (artwork, title, channel, Play button) and a player bar stays at the bottom of the window with play/pause, back 15 s, forward 30 s, a scrubber, time left and a speed button (0.75× to 3×). Your speed is remembered between videos. |
| **Visualizer** | Optionally draws the audio where the video was: a scrolling spectrogram, an oscilloscope waveform, a frequency analyzer, or all three at once. Off ("None") by default. |
| **Fill the page** | The episode header (visualizer, title and Play button) takes the whole window under YouTube's top bar. Scroll down for anything else on the page. |
| **Hide recommendations** | The sidebar, end screens, "up next" and recommendation shelves in search are gone. A playlist you opened yourself stays visible as your queue. |
| **Hide video info** | Removes the channel row, the like and share buttons and the description under the player. |
| **Hide comments and live chat** | Comments are never loaded. |
| **Hide home feed and Shorts** | The home page shows a short note and a search prompt instead of a feed. Shorts shelves disappear and Shorts links open as regular videos (no endless swiping). |
| **Hide the side menu** | On the home page and in search results the left navigation menu and its menu button are gone, leaving just the search bar. Other pages keep the menu. |
| **Hide thumbnails** | Search results, lists and the playlist queue become text-only, and the episode header and player bar drop their artwork. Channel pictures shrink to a small text-sized icon. |
| **Block autoplay** | YouTube's autoplay switch is turned off and playback stops at the end of every video, including inside playlists. |
| **Save data** | While the video is hidden, YouTube is asked to stream its lowest picture quality. |
| **Colour and appearance** | Pick one of seven accent colours, and Light, Dark or System. System means the player follows YouTube's own theme and the popup follows your device. |

Every option can be switched off individually in the popup.

**Turning it on and off.** Click the toolbar icon and use the Off/On switch, or press
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>. Changes apply to open YouTube tabs immediately, with no
reload. The icon is teal when Listen Mode is on and grey with an "OFF" badge when it's off.

## Install

### From a release (for most people)

1. Download the latest `yt-listen-mode-vX.Y.Z.zip` from the
   [Releases page](https://github.com/YOUR_GITHUB_USERNAME/yt-listen-mode/releases).
2. Unzip it into a folder you'll keep (the browser loads the extension from that folder, so don't
   delete it). On Linux: `unzip yt-listen-mode-vX.Y.Z.zip -d yt-listen-mode`.
3. Open `brave://extensions` (or `chrome://extensions`), turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder, the one that contains `manifest.json`.
5. Pin the icon: click the puzzle-piece icon in the toolbar and pin **Listen Mode for YouTube**.

To update, unzip the new release over the same folder and click the reload arrow on the extension's
card in `brave://extensions`.

### From source

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/yt-listen-mode.git
```

Then follow steps 3 to 5 above and select the `extension/` folder inside the repository.

Works in Brave, Chrome, Edge, Vivaldi, Opera and other Chromium browsers version 123 or newer.

## Privacy

- Collects nothing, sends nothing, has no analytics.
- Makes no network requests of its own. The only extra thing the page loads is the video's
  thumbnail from YouTube's own image server (`i.ytimg.com`), used as episode artwork.
- Settings are stored in your browser's extension storage (synced with your browser profile if you
  use browser sync). Playback speed stays on the device.

**Permissions**

| Permission | Why |
| --- | --- |
| `storage` | Save your on/off state, options and playback speed. |
| Access to `www.youtube.com` | Change how YouTube looks and behaves. It runs on no other site. |

## Known limitations

- **The video still streams.** YouTube's web player doesn't offer an audio-only stream without
  tampering with the stream itself, which breaks often. *Save data* drops the picture to the
  lowest quality (usually 144p) so the overhead is small.
- **YouTube changes its page often.** If something hidden comes back or the player bar stops
  appearing, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#when-youtube-changes-its-page).
  Fixes are usually a one-line selector change.
- **The last half second is cut.** To stop autoplay reliably, playback pauses just before the end.
- **After turning Listen Mode off**, YouTube's own autoplay switch stays off (turn it back on in the
  player if you want it) and the picture may stay low quality until you pick a quality in the gear
  menu or reload.
- **Fullscreen** (pressing <kbd>F</kbd>) still shows the video.
- Runs on `www.youtube.com` only: not on YouTube Music, `m.youtube.com`, or videos embedded on
  other websites.

## Troubleshooting

| Problem | Try this |
| --- | --- |
| Nothing changes on YouTube | Reload the YouTube tab once after installing or updating the extension. |
| The shortcut does nothing | Another extension may use it. Change it at `brave://extensions/shortcuts`. |
| Something reappeared | YouTube probably changed its markup. Please open an issue with the page URL and a screenshot. |
| I want to see what it's doing | In a YouTube tab's DevTools console run `localStorage.setItem('ylm-debug', '1')`, reload, and filter the console for `[Listen Mode]`. |

## Project structure

```
yt-listen-mode/
├── extension/                 The extension itself. Load this folder in the browser.
│   ├── manifest.json          Manifest V3: permissions, scripts, shortcut
│   ├── background.js          Toolbar icon state and the keyboard shortcut
│   ├── shared/settings.js     Defaults, option labels, speeds (one source of truth)
│   ├── content/
│   │   ├── content.js         Applies settings, builds the player, blocks autoplay
│   │   ├── content.css        Everything that gets hidden, plus the player's styles
│   │   ├── visualizer.js      Spectrogram, oscilloscope and frequency analyzer
│   │   └── page-bridge.js     Asks YouTube's player for low quality (Save data)
│   ├── popup/                 The Off/On popup (HTML, CSS, JS)
│   └── icons/                 Generated PNG icons, on and off states
├── scripts/
│   ├── package.sh             Builds dist/yt-listen-mode-vX.Y.Z.zip
│   └── generate_icons.py      Regenerates the icons (needs Pillow)
├── docs/
│   ├── ARCHITECTURE.md        How it works, and how to fix it when YouTube changes
│   └── PUBLISHING.md          git, GitHub, releases, optional Chrome Web Store
├── .github/workflows/         CI checks and automatic releases on version tags
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                    MIT
└── README.md
```

No build step, no dependencies, plain JavaScript. Edit a file, reload the extension, refresh YouTube.

## Contributing

Bug reports and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the development
loop and a manual test checklist.

## License

[MIT](LICENSE)

This project is not affiliated with, endorsed by or sponsored by YouTube or Google.
YouTube is a trademark of Google LLC.
