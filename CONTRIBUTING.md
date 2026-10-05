# Contributing

Thanks for helping. The most valuable contribution is usually a selector fix after YouTube changes
its page, and those are small.

## Development loop

1. `brave://extensions` → **Developer mode** on → **Load unpacked** → select `extension/`.
2. Edit files in `extension/`.
3. Click the reload arrow on the extension's card, then refresh the YouTube tab.
   (Content scripts are not re-injected into already-open tabs.)

Debug output: in a YouTube tab's console run `localStorage.setItem('ylm-debug', '1')`, reload,
and filter for `[Listen Mode]`. The service worker has its own console: open it from the
extension's card in `brave://extensions`.

Before opening a pull request:

```bash
python3 -m json.tool extension/manifest.json > /dev/null
find extension -name '*.js' -exec node --check {} \;
./scripts/package.sh
```

CI runs the same checks.

## Code style

- Plain JavaScript, no build step, no dependencies. Keep it that way so anyone can read the code
  they install.
- No `innerHTML` in the content script (YouTube enforces Trusted Types).
- YouTube-specific selectors go in `SEL` at the top of `content.js` or in the matching feature
  section of `content.css`. When you add a selector for a new layout, keep the old one next to it.
- 2-space indentation, single quotes in JS, a short comment saying *why* for anything non-obvious.

## Manual test checklist

Run through this before a release. Test in light and dark theme if you changed styles.

**Toggle and popup**
- [ ] The popup's Off/On slider changes an open YouTube tab immediately, with no reload.
- [ ] <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> toggles; the icon is teal when on, grey with "OFF" when off.
- [ ] Each option switch works on its own while Listen Mode is on.
- [ ] With Listen Mode off, YouTube looks completely normal.

**Watch page** (`/watch?v=…`)
- [ ] No video picture; the episode header shows artwork, title, channel and Play.
- [ ] The player bar shows; play/pause, back 15, forward 30 and the scrubber all work.
- [ ] Speed button cycles; Shift-click or right-click goes slower; the speed sticks on the next video.
- [ ] Media keys / OS media controls still work.
- [ ] Sidebar recommendations and comments are gone; the description is still there.
- [ ] Near the end, playback stops and nothing else starts.
- [ ] In a playlist, the playlist panel is visible and playback stops at the end of each video.
- [ ] Theater mode (<kbd>T</kbd>) leaves no empty gap.
- [ ] A live stream plays, shows "Live", and isn't stopped by the autoplay guard.

**Elsewhere**
- [ ] Home page shows the note instead of the feed.
- [ ] Shorts shelves are hidden; opening a `/shorts/…` link lands on the normal watch page.
- [ ] Start an episode, then go to search: audio continues and the bar stays at the bottom.
- [ ] The close button on the bar pauses and hides it.
- [ ] Narrow window (~500 px): the bar and header still fit.

## Reporting a breakage

Please include: the page type (watch, home, search, channel, Shorts), the URL, a screenshot, your
browser and version (`brave://version`), and the extension version from the popup.
