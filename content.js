const POST_SELECTOR = 'shreddit-post, shreddit-ad-post';

// Media slots that content.css already hides. Used here only to decide whether a
// post has media worth a button.
const SLOT_SELECTOR = ':scope > [slot="post-media-container"], :scope > [slot="thumbnail"]';

// Media that can turn up outside the known slots (layout experiments, embeds,
// post pages). Avatars and subreddit icons are also faceplate-img, so those are
// only counted when found inside a slot.
const MEDIA_SELECTOR = [
  'shreddit-player',
  'shreddit-player-2',
  'shreddit-embed',
  'gallery-carousel',
  'shreddit-aspect-ratio',
  'img.media-lightbox-img',
  'video'
].join(',');

// Anything containing these is part of the post's text, never hidden.
const TEXT_SELECTOR = '[slot="title"], [slot="text-body"], [id^="post-title"], [slot="credit-bar"]';

// Reveal button icon, the same as Thumbnail Blocker for YouTube's: Feather's
// maximize-2 (arrows out) while the media is hidden, minimize-2 (arrows in)
// while it shows, with useAnimations' nudge on click. Arrowheads are 4px
// (Feather's are 6), and minimize-2's sit 1.3px further from the centre than
// Feather's, so the inward nudge never makes them touch.
const ICON_ARROWS = {
  'rfvb-icon-max': ['M17 3H21V7M21 3L14 10', 'M7 21H3V17M3 21L10 14'],
  'rfvb-icon-min': ['M19.3 8.7H15.3V4.7M15.3 8.7L21 3', 'M4.7 15.3H8.7V19.3M8.7 15.3L3 21']
};

const isOldReddit = location.hostname === 'old.reddit.com';

/* ---------- New Reddit ---------- */

// Reddit's class names aren't stable, so stray media is located structurally:
// walk up from each media node while the ancestor still holds no post text. That
// gives the largest block that is purely media, which is what we want to hide.
function markStrayMedia(post) {
  post.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
    if (media.closest('[slot="post-media-container"], [slot="thumbnail"], .rfvb-media')) return;
    if (media.closest(POST_SELECTOR) !== post) return;

    let node = media;
    let block = media;
    while (node && node !== post) {
      if (node.querySelector(TEXT_SELECTOR) || node.matches(TEXT_SELECTOR)) break;
      block = node;
      node = node.parentElement;
    }
    block.classList.add('rfvb-media');
  });
}

function hasMedia(post) {
  return !!post.querySelector(SLOT_SELECTOR + ', .rfvb-media');
}

function setIcon(button, revealed) {
  button.classList.toggle('content-visible', revealed);
  button.setAttribute('aria-pressed', String(revealed));
  button.setAttribute('aria-label', revealed ? 'Hide media' : 'Show hidden media');
  button.title = revealed ? 'Hide media' : 'Show media';
}

// Hidden players can keep playing audio; best-effort pause on re-hide. The
// <video> usually lives in the player's shadow root, so look there too.
function pauseMedia(root) {
  root.querySelectorAll('video, audio, shreddit-player, shreddit-player-2').forEach((el) => {
    try {
      if (typeof el.pause === 'function') el.pause();
      el.shadowRoot?.querySelectorAll('video, audio').forEach((v) => v.pause());
    } catch (_) { /* ignore */ }
  });
}

function togglePost(post, button) {
  const revealed = !post.hasAttribute('data-rfvb-revealed');
  post.toggleAttribute('data-rfvb-revealed', revealed);
  setIcon(button, revealed);
  if (!revealed) pauseMedia(post);
}

// Buttons this script made. Reddit can restore a page (e.g. on Back) from a
// saved copy of its markup, which brings our buttons back without their click
// handlers; those get replaced.
const ownButtons = new WeakSet();

// Finds root's button, dropping a copy this script didn't make.
function findButton(root, selector, owner) {
  const button = [...root.querySelectorAll(selector)].find((b) => b.closest(owner) === root);
  if (!button || ownButtons.has(button)) return button || null;
  button.remove();
  return null;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}

// Both arrow pairs are built; CSS shows one by .content-visible. Each arrow is
// its own group so the nudge moves them apart or together.
function revealIcon() {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  for (const [cls, [up, down]] of Object.entries(ICON_ARROWS)) {
    const pair = svg.appendChild(svgEl('g', {
      class: cls, fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    pair.appendChild(svgEl('g', { class: 'rfvb-arrow-up' })).appendChild(svgEl('path', { d: up }));
    pair.appendChild(svgEl('g', { class: 'rfvb-arrow-down' })).appendChild(svgEl('path', { d: down }));
  }
  return svg;
}

function createButton(onToggle) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rfvb-btn';

  button.appendChild(revealIcon());

  // Replays the arrow nudge (content.css) on the arrows that were clicked: they
  // stay on screen (data-rfvb-hold) until the nudge ends, then the button shows
  // the other pair.
  const nudge = () => {
    button.classList.remove('rfvb-nudge');
    button.dataset.rfvbHold = button.classList.contains('content-visible') ? 'min' : 'max';
    void button.offsetWidth;
    button.classList.add('rfvb-nudge');
  };
  button.addEventListener('animationend', () => {
    button.classList.remove('rfvb-nudge');
    delete button.dataset.rfvbHold;
  });

  // Posts are wrapped in a full-card link; keep the click from opening the post.
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    nudge();
    onToggle();
  });
  ownButtons.add(button);
  return button;
}

// The credit bar (subreddit, time, Join, overflow menu) is Reddit's header row;
// the button goes right before the overflow menu, so it sits with the actions.
// Hovering the subreddit name opens a hover card inside the credit bar with its
// own Join button; the button must never move in there, or it leaves with it.
const POPUP_SELECTOR = 'faceplate-hovercard, [role="dialog"], [role="tooltip"], [popover]';

function headerControl(creditBar, selector) {
  if (!creditBar) return null;
  return [...creditBar.querySelectorAll(selector)].find((el) => {
    const popup = el.closest(POPUP_SELECTOR);
    return !popup || !creditBar.contains(popup);
  }) || null;
}

// The menu sits in wrappers that vary by page: a fixed-size loader on feeds, a
// loader inside a div on ads, nothing on post pages, plus the Mute List
// extension's column. Inside those the button would stack above the menu, so
// climb to the item in the flex row that lays the header out.
function menuRowItem(menu, creditBar) {
  let item = menu;
  while (item.parentElement !== creditBar && !getComputedStyle(item.parentElement).display.endsWith('flex') ||
         item.parentElement.classList.contains('rmute-under')) {
    item = item.parentElement;
  }
  return item;
}

function placeButton(post, button) {
  // Not always a direct child: feed posts with a thumbnail nest it in a grid.
  const creditBar = [...post.querySelectorAll('[slot="credit-bar"]')].find((el) => el.closest(POST_SELECTOR) === post);
  const menu = headerControl(creditBar, 'shreddit-post-overflow-menu');

  if (menu) {
    if (!button.nextElementSibling?.contains(menu)) menuRowItem(menu, creditBar).insertAdjacentElement('beforebegin', button);
  } else if (creditBar) {
    if (button.parentElement !== creditBar) creditBar.appendChild(button);
  } else if (!button.isConnected) {
    const firstMedia = post.querySelector(SLOT_SELECTOR + ', .rfvb-media');
    firstMedia?.insertAdjacentElement('beforebegin', button);
  }
}

function processNewPost(post) {
  markStrayMedia(post);
  if (!hasMedia(post)) return;

  let button = findButton(post, '.rfvb-btn', POST_SELECTOR);
  if (!button) {
    button = createButton(() => togglePost(post, button));
    setIcon(button, post.hasAttribute('data-rfvb-revealed'));
  }
  // Reddit hydrates the header after the body, so re-place on later passes.
  placeButton(post, button);
}

/* ---------- New Reddit comments ---------- */

const COMMENT_SELECTOR = 'shreddit-comment';

// Block media in a comment body. content.css hides these by itself; images are
// left to JS so inline emotes stay visible.
const COMMENT_MEDIA_SELECTOR = 'figure, video, shreddit-player, shreddit-player-2, shreddit-embed, gallery-carousel';

// Emotes sit inside a line of text, are tiny, or come from Reddit's emoji hosts.
function isEmote(img) {
  if (/emoji|emote|snoomoji/i.test(img.src || '')) return true;
  const h = parseInt(img.getAttribute('height'), 10);
  if (h && h <= 40) return true;
  const line = img.closest('p, li');
  return !!line && line.textContent.trim() !== '';
}

// Mark each image and grow it to the largest wrapper that adds no text, so a
// link around a GIF goes with it.
function markCommentImages(body) {
  body.querySelectorAll('img').forEach((img) => {
    if (img.closest('.rfvb-media') || img.closest(COMMENT_MEDIA_SELECTOR) || isEmote(img)) return;
    let block = img;
    let node = img.parentElement;
    while (node && node !== body && node.textContent.trim() === block.textContent.trim()) {
      block = node;
      node = node.parentElement;
    }
    block.classList.add('rfvb-media');
  });
}

// The comment's own slot, skipping the same slot in nested replies.
function ownSlot(comment, name) {
  return [...comment.querySelectorAll(`[slot="${name}"]`)]
    .find((el) => el.closest(COMMENT_SELECTOR) === comment) || null;
}

// The action row (vote, Reply, Award, Share, ⋯) is shreddit-comment-action-row.
// Its shadow row ends with <slot name="overflow">, filled by the light-DOM child
// shreddit-overflow-menu[slot="overflow"]. The button takes the same slot,
// right after the menu, so ⋯ stays where it was and the eye sits to its right.
// No other spot: the row is added after the header, and a fallback there made
// the eye show in the header first, then jump.
function commentActionRow(comment) {
  return [...comment.querySelectorAll('shreddit-comment-action-row')]
    .find((el) => el.closest(COMMENT_SELECTOR) === comment) || null;
}

function placeCommentButton(row, button) {
  button.slot = 'overflow';
  const menu = row.querySelector(':scope > shreddit-overflow-menu');
  if (menu) {
    if (menu.nextElementSibling !== button) menu.insertAdjacentElement('afterend', button);
  } else if (button.parentElement !== row || button.nextElementSibling) {
    row.appendChild(button);
  }
}

function processComment(comment) {
  const body = ownSlot(comment, 'comment');
  if (!body) return;
  markCommentImages(body);
  if (!body.querySelector(COMMENT_MEDIA_SELECTOR + ', .rfvb-media')) return;
  // Wait for the action row; the observer runs again when it's added.
  const row = commentActionRow(comment);
  if (!row) return;

  let button = findButton(comment, '.rfvb-comment-btn', COMMENT_SELECTOR);
  if (!button) {
    button = createButton(() => togglePost(body, button));
    button.classList.add('rfvb-comment-btn', 'rfvb-comment-row-btn');
    setIcon(button, body.hasAttribute('data-rfvb-revealed'));
  }
  placeCommentButton(row, button);
}

/* ---------- Old Reddit ---------- */

function oldHasMedia(thing) {
  const thumb = thing.querySelector(':scope > a.thumbnail');
  const thumbIsImage = thumb && thumb.querySelector('img');
  const expando = !thing.classList.contains('self') && thing.querySelector('.expando-button:not(.selftext)');
  return !!(thumbIsImage || expando);
}

function processOldPost(thing) {
  if (thing.querySelector('.rfvb-old-btn') || !oldHasMedia(thing)) return;
  const buttons = thing.querySelector('ul.flat-list.buttons');
  if (!buttons) return;

  const li = document.createElement('li');
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'rfvb-old-btn';
  link.textContent = 'show media';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const revealed = !thing.hasAttribute('data-rfvb-revealed');
    thing.toggleAttribute('data-rfvb-revealed', revealed);
    link.textContent = revealed ? 'hide media' : 'show media';
    if (!revealed) pauseMedia(thing);
  });
  li.appendChild(link);
  buttons.insertAdjacentElement('afterbegin', li);
}

/* ---------- Driver ---------- */

function processAll() {
  if (isOldReddit) {
    document.querySelectorAll('.thing.link').forEach(processOldPost);
  } else {
    document.querySelectorAll(POST_SELECTOR).forEach(processNewPost);
    document.querySelectorAll(COMMENT_SELECTOR).forEach(processComment);
  }
}

let scheduled = false;
function scheduleProcess() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    processAll();
  });
}

function init() {
  processAll();
  // Infinite scroll, lazy-loaded media and late-hydrating headers all arrive as
  // DOM additions; batch them into one pass per frame.
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length) {
        scheduleProcess();
        return;
      }
    }
  // Observe the document itself so it survives Reddit swapping out <html>.
  }).observe(document, { childList: true, subtree: true });
  // Back/forward can restore a page without adding nodes we'd see.
  window.addEventListener('pageshow', scheduleProcess);
  window.addEventListener('popstate', scheduleProcess);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// Lets the worker notice a new build.txt during development (see background.js).
try { chrome.runtime.sendMessage('rfvb:checkBuild').catch(() => {}); } catch (_) { /* extension reloaded */ }
