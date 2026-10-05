# Publishing

From "folder on my laptop" to "anyone can download it from GitHub".

## 1. Replace the placeholders

There are two things to personalise before the first commit:

```bash
# Find every placeholder
grep -rn "YOUR_GITHUB_USERNAME" .
```

- `extension/manifest.json` → `homepage_url` (the popup's **Source** link uses it)
- `README.md` → the Releases link and the `git clone` URL
- `LICENSE` → the copyright line, if you want your full name there

On macOS you can replace them all at once (swap in your username):

```bash
grep -rl "YOUR_GITHUB_USERNAME" . | xargs sed -i '' 's/YOUR_GITHUB_USERNAME/your-username/g'
```

On Linux, use `sed -i` without the `''`.

## 2. Test it locally

1. `brave://extensions` → **Developer mode** on → **Load unpacked** → select the `extension/` folder.
2. Go through the checklist in [CONTRIBUTING.md](../CONTRIBUTING.md#manual-test-checklist).

## 3. Create the git repository

```bash
cd yt-listen-mode
git init -b main
git add .
git commit -m "Listen Mode for YouTube v1.0.0"
```

`.gitignore` already keeps out `dist/`, zips, `.DS_Store` and any `.pem` signing key.

## 4. Push to GitHub

**With the GitHub CLI** (`brew install gh` or `sudo pacman -S github-cli`, then `gh auth login`):

```bash
gh repo create yt-listen-mode --public --source=. --remote=origin --push \
  --description "Turn YouTube into a calm, podcast-style audio player for Brave and Chromium"
```

**Or with the website:** create an empty repository at <https://github.com/new> named
`yt-listen-mode`. Don't add a README, license or .gitignore (the project has them). Then:

```bash
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/yt-listen-mode.git
git push -u origin main
```

The **CI** workflow runs on that push. A green check on the commit means the manifest is valid,
all JavaScript parses, and the package builds.

Worth doing once on GitHub: add a description and topics (`brave-extension`, `chrome-extension`,
`youtube`, `podcast`, `digital-wellbeing`), and add a screenshot to the README (put images in
`docs/screenshots/`).

## 5. Make a release

Releases are built automatically when you push a version tag.

```bash
# 1. Bump "version" in extension/manifest.json (e.g. 1.0.0 → 1.0.1)
# 2. Move the notes under [Unreleased] in CHANGELOG.md into a new version section
git commit -am "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

The **Release** workflow checks that the tag matches the manifest version, runs
`scripts/package.sh`, and publishes a GitHub Release with `yt-listen-mode-v1.0.1.zip` attached and
auto-generated notes. For the very first release, tag the current commit `v1.0.0`.

If the workflow fails with a permissions error (403), go to the repository's
**Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**.

**Manual alternative:** run `./scripts/package.sh` locally, then on GitHub go to
**Releases → Draft a new release**, create the tag, and upload the zip from `dist/`.

Versioning: patch (`1.0.1`) for selector fixes after YouTube changes, minor (`1.1.0`) for new
options, major for anything that changes existing behaviour.

## 6. Optional: Chrome Web Store

Brave installs extensions from the Chrome Web Store, so publishing there gives Brave users one-click
installs and automatic updates (GitHub installs need a manual update).

1. Register at the Chrome Web Store Developer Dashboard (there's a one-time registration fee).
2. Upload the zip from `dist/`. The manifest is at the zip's root, as the store requires.
3. Fill in the listing. Notes that make review smoother:
   - **Single purpose:** "Changes YouTube's layout into an audio-focused player and removes
     recommendations, comments and autoplay."
   - **`storage` justification:** "Saves the user's on/off state, options and playback speed."
   - **Host access justification:** "Needed to restyle www.youtube.com. The extension runs on no
     other site."
   - **Data usage:** no user data is collected or transmitted.
4. Store icon: `extension/icons/icon-on-128.png`. You'll also need at least one 1280×800 or 640×400
   screenshot.
5. Naming: "… for YouTube" is the usual pattern. Don't use YouTube's logo in the icon or screenshots
   beyond showing the page itself.

Keep releasing on GitHub as well; the same zip works for both.
