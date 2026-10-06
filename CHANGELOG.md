# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Option to hide the side menu on the home page, leaving just the search bar.
- Option to hide thumbnails in search results, lists and the Listen Mode player;
  large channel pictures shrink to a text-sized icon.

- Optional audio visualizer where the video was: spectrogram, oscilloscope, frequency analyzer,
  or all three combined (off by default).

- Option to hide the video info under the player (channel row, buttons, description).

- Option to make the episode header fill the whole window (on by default).

- Accent colour choice (seven colours) and Light / Dark / System appearance, for the player and the popup.

### Changed
- The side menu is now hidden in search results as well as on the home page.
- Minimum browser version is Chromium 123.
- The popup is more compact so all options fit without scrolling; option hints are now tooltips.

## [1.0.0] - 2026-10-05

### Added
- Listen Mode: hides the video and shows a podcast-style episode header plus a bottom player bar
  (play/pause, back 15 s, forward 30 s, scrubber, time left, speed from 0.75× to 3×).
- Playback speed is remembered between videos.
- Hides recommendations, end screens, comments, live chat, the home feed and Shorts.
- Shorts links open in the regular player.
- Autoplay blocking: YouTube's autoplay switch is turned off and playback stops at the end of every video.
- Data saver: asks YouTube for the lowest picture quality while the video is hidden.
- Toolbar popup with an Off/On switch and per-feature options; icon turns grey with an "OFF" badge when off.
- Keyboard shortcut Alt+Shift+L to toggle.
