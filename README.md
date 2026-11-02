## Feed Video/Image Blocker for Reddit

Hide images and videos in your Reddit feed, simply click on the view button to reveal the content of that particular post or comment. [xtension](https://github.com/adxy/xtension) port

### Install (Chromium browsers)
- Open `chrome://extensions` (or your Chromium-based browser's extensions page)
- Enable "Developer mode"
- Download the zip from the latest release on GitHub and unzip it (or clone this repo)
- Click "Load unpacked" and select the unzipped folder

### Use
- Visit `reddit.com`
- Media in posts and comments is hidden
- Click - button to unhide/hide media

### Notes
- No data leaves your browser; there are no network requests
- Targets `reddit.com`, `new.reddit.com`, `sh.reddit.com`, `old.reddit.com`
- Files: `manifest.json` (MV3), `content.js` (logic), `content.css` (hiding/styles), `background.js` (welcome page on install), `welcome/`, `icons/`
- [Hide Thumbnails for YouTube](https://github.com/jxelia/hide-thumbnails-for-youtube)
- A port of [xtension](https://github.com/adxy/xtension) X/Twitter Feed Video Blocker.