// ─── State ────────────────────────────────────────────────────────────────────

let allImages = [];
let currentIndex = 0;
let activeTab = "backdrops";
let filmData = null;
let personData = null;
let pageMode = null; // "film" | "person"
let castIndex = new Map(); // lowercase actor name → profile URL

// ─── Page detection ───────────────────────────────────────────────────────────

const PERSON_ROLES = [
  "actor", "director", "co-director", "additional-directing",
  "producer", "executive-producer", "writer", "story", "casting",
  "cinematography", "editor", "composer", "sound", "visual-effects",
  "production-design", "art-direction", "set-decoration", "costumes",
  "makeup", "hairstyling", "title-design", "lighting", "camera-operator",
  "stunts", "choreography", "songs",
];

function detectPageMode() {
  const path = location.pathname;
  if (/^\/film\//.test(path)) return "film";
  if (/^\/search\//.test(path)) return "search";
  const m = path.match(/^\/([^/]+)\//);
  if (m && PERSON_ROLES.includes(m[1])) return "person";
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getImdbId() {
  const link = document.querySelector('a[href*="imdb.com/title/"]');
  if (!link) return null;
  const match = link.href.match(/title\/(tt\d+)/);
  return match ? match[1] : null;
}

function getPersonName() {
  // Strip Letterboxd's leading ".context" span ("Films starring") to get the bare name.
  const h1 = document.querySelector("h1.title-1") || document.querySelector("h1");
  if (h1) {
    const clone = h1.cloneNode(true);
    clone.querySelectorAll(".context").forEach((el) => el.remove());
    const text = clone.textContent.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
  if (og) {
    const cleaned = og.replace(/^films?\s+(starring|directed by|written by|produced by|edited by|with[^]+?\bby)\s+/i, "");
    if (cleaned) return cleaned;
  }

  const m = location.pathname.match(/^\/[^/]+\/([^/]+)\//);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/-/g, " ");
}

function getTmdbPersonId() {
  // Letterboxd contributor pages tag the avatar img with data-tmdb-id directly.
  const taggedImg = document.querySelector("img[data-tmdb-id]");
  const fromImg = taggedImg?.dataset?.tmdbId;
  if (fromImg) {
    const id = parseInt(fromImg, 10);
    if (Number.isFinite(id)) return id;
  }
  // Fallback: "More details at TMDB" sidebar link.
  const link = document.querySelector('a[href*="themoviedb.org/person/"]');
  if (!link) return null;
  const m = link.href.match(/person\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function insertFilmPanel(panel) {
  const sidebar =
    document.querySelector(".col-sidebar") ||
    document.querySelector("#sidebar") ||
    document.querySelector("[data-sidebar]");
  if (sidebar) {
    sidebar.appendChild(panel);
    return;
  }
  const imdbLink = document.querySelector('a[href*="imdb.com/title/"]');
  imdbLink?.closest("p,section,div")?.insertAdjacentElement("afterend", panel);
}

function findPersonSidebar() {
  return (
    document.querySelector("aside.sidebar") ||
    document.querySelector(".cols-2 aside") ||
    document.querySelector(".col-sidebar") ||
    document.querySelector("aside") ||
    document.querySelector(".sidebar") ||
    null
  );
}

function findPersonPosterContainer() {
  // Most-specific: the actual Letterboxd contributor avatar block.
  const direct =
    document.querySelector("aside .avatar.person-image") ||
    document.querySelector(".sidebar .avatar.person-image") ||
    document.querySelector(".avatar.person-image") ||
    document.querySelector(".sidebar .avatar") ||
    document.querySelector("aside .avatar") ||
    document.querySelector(".contributor-image") ||
    document.querySelector(".profile-image") ||
    document.querySelector(".person-poster") ||
    document.querySelector(".profile-figure");
  if (direct) return direct;

  // Tagged TMDB profile image.
  const taggedImg =
    document.querySelector("img.js-tmdb-person") ||
    document.querySelector("img[data-tmdb-id]");
  if (taggedImg) {
    return (
      taggedImg.closest(".avatar, .person-image, .contributor-image, .profile-image, figure, .poster") ||
      taggedImg
    );
  }

  // Fallback: first image inside the sidebar.
  const sidebar = findPersonSidebar();
  if (sidebar) {
    const img = sidebar.querySelector("img");
    if (img) {
      return (
        img.closest(".avatar, .person-image, figure, .poster, .profile, .profile-image, .image") ||
        img
      );
    }
  }
  return null;
}

function insertPersonPanel(panel) {
  const target = findPersonPosterContainer();
  if (target) {
    target.replaceWith(panel);
    return;
  }
  // Fallback: prepend into the sidebar.
  const sidebar = findPersonSidebar();
  if (sidebar) {
    sidebar.insertBefore(panel, sidebar.firstChild);
    return;
  }
  const main =
    document.querySelector("#content") ||
    document.querySelector("main") ||
    document.body;
  main.insertBefore(panel, main.firstChild);
}

function getActiveImages() {
  if (pageMode === "person") return personData?.profiles || [];
  if (!filmData) return [];
  return activeTab === "backdrops" ? filmData.backdrops : filmData.posters;
}

function matchLetterboxdTabStyle(tabs) {
  const navLink = document.querySelector(
    "#tabbed-content ul li a, .film-tabs li a, .tabbed-content ul li a, ul.tabs li a, nav.tabs li a"
  );
  if (!navLink) return;
  const cs = window.getComputedStyle(navLink);
  tabs.forEach((btn) => {
    btn.style.fontFamily = cs.fontFamily;
    btn.style.fontSize = cs.fontSize;
    btn.style.fontWeight = cs.fontWeight;
    btn.style.letterSpacing = cs.letterSpacing;
    btn.style.lineHeight = cs.lineHeight;
  });
}

// ─── Image loading helpers ────────────────────────────────────────────────────

function preloadImage(src) {
  if (!src) return;
  const img = new Image();
  img.src = src;
  // Also pre-decode so the next swap is truly instant.
  if (typeof img.decode === "function") img.decode().catch(() => {});
}

function preloadNeighbours(images, idx) {
  if (!images.length) return;
  preloadImage(images[(idx + 1) % images.length]);
  preloadImage(images[(idx - 1 + images.length) % images.length]);
}

// Fire-and-forget: once the user interacts with the gallery (hover or click),
// kick off background fetches for everything else so the lightbox is instant.
let preloadedAll = false;
function preloadAllImagesOnce() {
  if (preloadedAll) return;
  preloadedAll = true;
  const urls = [];
  if (filmData) urls.push(...filmData.backdrops, ...filmData.posters);
  if (personData) urls.push(...personData.profiles);
  for (const u of urls) preloadImage(u);
}

function attachImageLoadState(imgEl) {
  if (!imgEl) return;
  const wrap = imgEl.closest(".tmdb-carousel");
  if (!wrap) return;

  const markLoading = () => wrap.classList.add("is-loading");
  const markLoaded = () => wrap.classList.remove("is-loading");

  if (imgEl.complete && imgEl.naturalWidth > 0) {
    markLoaded();
  } else {
    markLoading();
    imgEl.addEventListener("load", markLoaded, { once: true });
    imgEl.addEventListener("error", markLoaded, { once: true });
  }
}

// Preload `newSrc` (fetch + decode) before swapping the visible src — the previous
// image stays in place during the transition and the new one paints with no flash.
function swapImageWhenReady(imgEl, newSrc) {
  if (!imgEl || !newSrc) return;
  const wrap = imgEl.closest(".tmdb-carousel, .lb-single");
  imgEl.dataset.targetSrc = newSrc;

  const hasVisiblePrevious = imgEl.src && imgEl.complete && imgEl.naturalWidth > 0;

  const probe = new Image();
  probe.src = newSrc;

  const apply = () => {
    if (imgEl.dataset.targetSrc !== newSrc) return;
    imgEl.src = newSrc;
    wrap?.classList.remove("is-loading");
  };

  // decode() resolves only when the image is fully decoded and ready to paint —
  // setting `imgEl.src` to the same URL afterward is effectively instant.
  if (typeof probe.decode === "function") {
    if (!hasVisiblePrevious) wrap?.classList.add("is-loading");
    probe.decode().then(apply, apply);
    return;
  }

  // Fallback for browsers without decode().
  if (probe.complete && probe.naturalWidth > 0) {
    apply();
    return;
  }
  if (!hasVisiblePrevious) wrap?.classList.add("is-loading");
  probe.addEventListener("load", apply, { once: true });
  probe.addEventListener("error", apply, { once: true });
}

// ─── Skeleton panel (shown while data is being fetched) ───────────────────────

function buildSkeleton(orientation /* "landscape" | "portrait" */) {
  const existing = document.getElementById("tmdb-photo-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "tmdb-photo-panel";
  panel.classList.add("is-skeleton");
  if (orientation === "portrait") panel.classList.add("is-portrait");
  const header = orientation === "portrait" ? "" : `
    <div class="tmdb-panel-header">
      <div class="tmdb-tabs">
        <span class="tmdb-tab-skel"></span>
      </div>
    </div>`;
  panel.innerHTML = `
    ${header}
    <div class="tmdb-carousel ${orientation === "portrait" ? "is-poster" : ""} is-loading">
      <div class="tmdb-loader" aria-label="Loading"></div>
    </div>
  `;

  if (pageMode === "film") insertFilmPanel(panel);
  else insertPersonPanel(panel);

  return panel;
}

// ─── Carousel panel ───────────────────────────────────────────────────────────

function buildPanel() {
  const existing = document.getElementById("tmdb-photo-panel");

  const panel = document.createElement("div");
  panel.id = "tmdb-photo-panel";

  const images = getActiveImages();
  allImages = images;
  currentIndex = Math.min(currentIndex, Math.max(0, images.length - 1));

  if (pageMode === "person") {
    panel.classList.add("is-portrait");
    panel.innerHTML = renderCarousel(images, "is-poster");
  } else {
    const hasBackdrops = filmData.backdrops.length > 0;
    const hasPosters = filmData.posters.length > 0;
    panel.innerHTML = `
      <div class="tmdb-panel-header">
        <span class="tmdb-panel-label">Photos</span>
        <div class="tmdb-tabs">
          ${hasBackdrops ? `<button class="tmdb-tab ${activeTab === "backdrops" ? "active" : ""}" data-tab="backdrops">Stills</button>` : ""}
          ${hasPosters ? `<button class="tmdb-tab ${activeTab === "posters" ? "active" : ""}" data-tab="posters">Posters</button>` : ""}
        </div>
      </div>
      ${renderCarousel(images, activeTab === "posters" ? "is-poster" : "")}
    `;
  }

  if (existing) {
    existing.replaceWith(panel);
  } else if (pageMode === "person") {
    insertPersonPanel(panel);
  } else {
    insertFilmPanel(panel);
  }

  // Tab switching (film only)
  const tabBtns = [...panel.querySelectorAll("button.tmdb-tab")];
  matchLetterboxdTabStyle(tabBtns);
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      currentIndex = 0;
      buildPanel();
    });
  });

  // Arrows
  const leftBtn = panel.querySelector(".tmdb-arrow-left");
  const rightBtn = panel.querySelector(".tmdb-arrow-right");
  leftBtn?.addEventListener("click", () => navigate(-1));
  rightBtn?.addEventListener("click", () => navigate(1));

  // Click image → lightbox
  const imgEl = panel.querySelector(".tmdb-carousel-img");
  imgEl?.addEventListener("click", () => {
    preloadAllImagesOnce();
    openLightbox(currentIndex);
  });
  attachImageLoadState(imgEl);
  preloadNeighbours(images, currentIndex);

  // First hover anywhere on the carousel → start loading the rest in the
  // background so subsequent navigation / lightbox open is instant.
  const carousel = panel.querySelector(".tmdb-carousel");
  carousel?.addEventListener("mouseenter", preloadAllImagesOnce, { once: true });
}

function renderCarousel(images, extraClass) {
  if (!images.length) {
    return `<div class="tmdb-carousel ${extraClass}"><p class="tmdb-empty-inline">No photos available.</p></div>`;
  }
  return `
    <div class="tmdb-carousel ${extraClass}">
      <button class="tmdb-arrow tmdb-arrow-left" aria-label="Previous">&#8249;</button>
      <img
        class="tmdb-carousel-img"
        src="${images[currentIndex] || ""}"
        alt="Photo"
        draggable="false"
      />
      <div class="tmdb-loader" aria-label="Loading"></div>
      <button class="tmdb-arrow tmdb-arrow-right" aria-label="Next">&#8250;</button>
      <div class="tmdb-counter">${currentIndex + 1} / ${images.length}</div>
    </div>
  `;
}

function navigate(dir) {
  const images = getActiveImages();
  if (!images.length) return;
  currentIndex = (currentIndex + dir + images.length) % images.length;

  const img = document.querySelector("#tmdb-photo-panel .tmdb-carousel-img");
  const counter = document.querySelector("#tmdb-photo-panel .tmdb-counter");
  if (img) swapImageWhenReady(img, images[currentIndex]);
  if (counter) counter.textContent = `${currentIndex + 1} / ${images.length}`;
  preloadNeighbours(images, currentIndex);
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function openLightbox(startIndex) {
  const existing = document.getElementById("tmdb-lightbox");
  if (existing) existing.remove();

  const images = getActiveImages();
  if (!images.length) return;

  let idx = startIndex;
  let mode = "single";

  const lb = document.createElement("div");
  lb.id = "tmdb-lightbox";

  function renderLightbox() {
    lb.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-shell">
        <div class="lb-topbar">
          <span class="lb-counter">${idx + 1} / ${images.length}</span>
          <div class="lb-topbar-actions">
            <button class="lb-btn-mode" data-mode="${mode}" title="${mode === "single" ? "Grid view" : "Single view"}">
              ${mode === "single" ? gridIcon() : singleIcon()}
            </button>
            <button class="lb-close" aria-label="Close">&#10005;</button>
          </div>
        </div>

        ${mode === "single" ? `
          <div class="lb-single">
            <button class="lb-nav lb-nav-left" aria-label="Previous">&#8249;</button>
            <img class="lb-main-img" src="${images[idx]}" alt="" draggable="false" />
            <button class="lb-nav lb-nav-right" aria-label="Next">&#8250;</button>
          </div>
        ` : `
          <div class="lb-grid">
            ${images.map((src, i) => `
              <button class="lb-thumb ${i === idx ? "active" : ""}" data-index="${i}">
                <img src="${src}" alt="" loading="lazy" />
              </button>
            `).join("")}
          </div>
        `}
      </div>
    `;

    lb.querySelector(".lb-backdrop").addEventListener("click", closeLightbox);
    lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
    lb.querySelector(".lb-btn-mode").addEventListener("click", () => {
      mode = mode === "single" ? "grid" : "single";
      renderLightbox();
    });

    if (mode === "single") {
      lb.querySelector(".lb-nav-left").addEventListener("click", () => stepLightbox(-1));
      lb.querySelector(".lb-nav-right").addEventListener("click", () => stepLightbox(1));
      lb.querySelector(".lb-main-img").addEventListener("click", () => stepLightbox(1));
      // Preload neighbours so left/right is instant after first nav.
      preloadNeighbours(images, idx);
    } else {
      lb.querySelectorAll(".lb-thumb").forEach((btn) => {
        btn.addEventListener("click", () => {
          idx = parseInt(btn.dataset.index);
          mode = "single";
          renderLightbox();
        });
      });
    }
  }

  function stepLightbox(dir) {
    idx = (idx + dir + images.length) % images.length;
    const mainImg = lb.querySelector(".lb-main-img");
    const counter = lb.querySelector(".lb-counter");
    if (mainImg) swapImageWhenReady(mainImg, images[idx]);
    if (counter) counter.textContent = `${idx + 1} / ${images.length}`;
    preloadNeighbours(images, idx);
  }

  renderLightbox();
  document.body.appendChild(lb);

  function onKey(e) {
    if (e.key === "Escape") { closeLightbox(); return; }
    if (mode === "single") {
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    }
  }
  document.addEventListener("keydown", onKey);

  function closeLightbox() {
    lb.remove();
    document.removeEventListener("keydown", onKey);
    currentIndex = idx;
    const img = document.querySelector("#tmdb-photo-panel .tmdb-carousel-img");
    const counter = document.querySelector("#tmdb-photo-panel .tmdb-counter");
    const images = getActiveImages();
    if (img) swapImageWhenReady(img, images[currentIndex]);
    if (counter) counter.textContent = `${currentIndex + 1} / ${images.length}`;
  }
}

function gridIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`;
}

function singleIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="14" rx="2"/></svg>`;
}

// ─── Error state ──────────────────────────────────────────────────────────────

function showError(html) {
  const existing = document.getElementById("tmdb-photo-panel");
  const panel = document.createElement("div");
  panel.id = "tmdb-photo-panel";
  panel.innerHTML = `<p class="tmdb-empty">${html}</p>`;
  if (existing) existing.replaceWith(panel);
  else if (pageMode === "person") insertPersonPanel(panel);
  else insertFilmPanel(panel);
}

// ─── Cast / crew / contributor hover (film pages) ────────────────────────────
// For cast links Letterboxd already shows a Twipsy tooltip (character name) —
// we inject the photo into that. For crew/contributor links there's no native
// tooltip, so we render our own minimal photo-only popup.

const PERSON_LINK_SELECTOR = PERSON_ROLES.map((r) => `a[href^="/${r}/"]`).join(", ");
let hoveredActorLink = null;

function buildCastIndex(cast) {
  castIndex.clear();
  for (const c of cast || []) {
    if (!c.name) continue;
    castIndex.set(c.name.toLowerCase(), c.profile || null);
  }
}

function findVisibleTooltipInner() {
  // Letterboxd uses Twipsy (Twitter's pre-Bootstrap tooltip lib). The popup
  // is `<div class="twipsy fade above in"><div class="twipsy-inner">…</div></div>`.
  // The popup is a singleton that gets re-positioned, so we query each time.
  const popups = document.querySelectorAll(
    ".twipsy, .tooltip.in, .tooltip.show, [role='tooltip']"
  );
  for (const el of popups) {
    if (el.offsetParent === null) continue;
    return (
      el.querySelector(".twipsy-inner") ||
      el.querySelector(".tooltip-inner") ||
      el
    );
  }
  return null;
}

function injectPhotoIntoTooltip(inner, photo) {
  inner.querySelector(".tmdb-cast-tooltip-photo")?.remove();
  const img = document.createElement("img");
  img.className = "tmdb-cast-tooltip-photo";
  img.src = photo;
  img.dataset.url = photo;
  img.alt = "";
  inner.insertBefore(img, inner.firstChild);

  // Twipsy positioned the popup assuming text-only size. After injecting the
  // photo the bubble grows wider AND taller — re-align it horizontally so the
  // arrow points at the link center, and shift it up by the photo's height.
  const popup = inner.closest(".twipsy, .tooltip, [role='tooltip']");
  if (!popup) return;
  const link = hoveredActorLink;
  requestAnimationFrame(() => {
    const block = img.offsetHeight + 6;
    if (!block) return;

    let translateX = 0;
    if (link && link.isConnected) {
      const linkRect = link.getBoundingClientRect();
      // offsetLeft gives the position without transforms applied, so the math
      // doesn't drift on repeated re-injections.
      const untransformedCenter = popup.offsetLeft + popup.offsetWidth / 2;
      const linkPageCenter =
        linkRect.left + window.scrollX + linkRect.width / 2;
      translateX = linkPageCenter - untransformedCenter;
    }
    popup.style.transform = `translate(${translateX}px, -${block}px)`;
  });
}

// Maintenance loop: while a person link is hovered, keep the photo visible.
// For cast (Twipsy-enabled) links we inject into Letterboxd's own tooltip;
// for crew/contributor (plain) links we show our own popup.
let injectionLoopId = null;
let customTipEl = null;

function ensureCustomTip() {
  if (customTipEl) return customTipEl;
  customTipEl = document.createElement("div");
  customTipEl.id = "tmdb-photo-tooltip";
  customTipEl.innerHTML = '<img alt="" />';
  document.body.appendChild(customTipEl);
  return customTipEl;
}

function showCustomTip(link, photo) {
  const tip = ensureCustomTip();
  const img = tip.querySelector("img");
  if (img.dataset.url !== photo) {
    img.src = photo;
    img.dataset.url = photo;
  }
  tip.style.display = "block";

  const anchor = link.getBoundingClientRect();
  // Position above when there's room, otherwise below — handles the masthead
  // "Directed by X" link near the top of the page.
  requestAnimationFrame(() => {
    const r = tip.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left + window.scrollX + anchor.width / 2 - r.width / 2;
    let top = anchor.top + window.scrollY - r.height - margin;
    const minLeft = window.scrollX + margin;
    const maxLeft = window.scrollX + window.innerWidth - r.width - margin;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    if (top < window.scrollY + margin) {
      top = anchor.bottom + window.scrollY + margin;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  });
}

function hideCustomTip() {
  if (customTipEl) customTipEl.style.display = "none";
}

function stopInjectionLoop() {
  if (injectionLoopId) {
    clearInterval(injectionLoopId);
    injectionLoopId = null;
  }
  hideCustomTip();
}

function startInjectionLoop() {
  stopInjectionLoop();
  const link = hoveredActorLink;
  if (!link) return;
  const name = link.textContent?.trim();
  const photo = name ? castIndex.get(name.toLowerCase()) : null;
  if (!photo) return;

  // Cast links carry Letterboxd's Twipsy tooltip; crew/contributor don't.
  if (link.classList.contains("tooltip") || link.hasAttribute("data-original-title")) {
    const tick = () => {
      if (!hoveredActorLink) { stopInjectionLoop(); return; }
      const inner = findVisibleTooltipInner();
      if (!inner) return;
      const existing = inner.querySelector(".tmdb-cast-tooltip-photo");
      if (existing?.dataset.url === photo) return;
      injectPhotoIntoTooltip(inner, photo);
    };
    tick();
    injectionLoopId = setInterval(tick, 60);
  } else {
    showCustomTip(link, photo);
  }
}

function attachCastHover() {
  if (attachCastHover._installed) return;
  attachCastHover._installed = true;

  let showTimer = null;
  let hideTimer = null;

  // mouseover bubbles, so a single body listener catches every actor link
  // (including ones rendered later, e.g. when "Show All…" is clicked).
  document.body.addEventListener("mouseover", (e) => {
    const link = e.target.closest?.(PERSON_LINK_SELECTOR);
    if (!link || link === hoveredActorLink) return;

    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    const alreadyShowing =
      injectionLoopId !== null ||
      (customTipEl && customTipEl.style.display === "block");

    hoveredActorLink = link;

    if (alreadyShowing) {
      // We were already showing the previous actor's photo — switch instantly
      // so the user never sees a stale face on the new name.
      startInjectionLoop();
    } else {
      // Cold hover: tiny intent delay to ignore quick flyovers.
      showTimer = setTimeout(startInjectionLoop, 120);
    }
  });

  document.body.addEventListener("mouseout", (e) => {
    const link = e.target.closest?.(PERSON_LINK_SELECTOR);
    if (!link || link !== hoveredActorLink) return;

    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hoveredActorLink = null;
      stopInjectionLoop();
    }, 120);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initFilm() {
  const imdbId = getImdbId();
  if (!imdbId) return;

  buildSkeleton("landscape");

  const response = await chrome.runtime.sendMessage({ type: "FETCH_IMAGES", imdbId });
  if (!response) return;

  if (response.error === "NO_KEY") {
    showError('No TMDB API key — click the extension icon to add one.');
    return;
  }
  if (response.error) {
    showError("Could not load photos from TMDB.");
    return;
  }

  filmData = response;
  activeTab = filmData.backdrops.length > 0 ? "backdrops" : "posters";
  currentIndex = 0;

  if (filmData.backdrops.length === 0 && filmData.posters.length === 0) {
    showError("No photos available for this film.");
  } else {
    buildPanel();
  }

  buildCastIndex(filmData.cast);
  attachCastHover();
}

async function initPerson() {
  const name = getPersonName();
  const tmdbId = getTmdbPersonId();
  if (!name && !tmdbId) return;

  // Letterboxd already shows the same TMDB photo. Keep it visible while we
  // fetch and pre-decode our copy in the background, then swap silently —
  // no skeleton or loading spinner shown.
  const hasLetterboxdAvatar = !!findPersonPosterContainer();
  if (!hasLetterboxdAvatar) buildSkeleton("portrait");

  const response = await chrome.runtime.sendMessage({
    type: "FETCH_PERSON_IMAGES",
    name,
    tmdbId,
  });
  if (!response) return;

  if (response.error === "NO_KEY") {
    showError('No TMDB API key — click the extension icon to add one.');
    return;
  }
  if (response.error || !response.profiles?.length) {
    showError("No photos available for this person.");
    return;
  }

  personData = response;
  currentIndex = 0;

  // Dedup defensively in case TMDB returned the same image twice.
  personData.profiles = [...new Set(personData.profiles)];

  // Reorder our profiles so the photo Letterboxd is currently showing comes
  // first. That way the silent swap from Letterboxd's avatar to our carousel
  // doesn't visibly change the picture — same face stays put, the user just
  // gains carousel controls.
  if (hasLetterboxdAvatar) {
    const avatarImg =
      document.querySelector("img.js-tmdb-person") ||
      document.querySelector("img[data-tmdb-id]") ||
      findPersonPosterContainer()?.querySelector("img");
    const lbPath = extractTmdbFilePath(avatarImg?.src || avatarImg?.dataset?.image);
    if (lbPath) {
      const matched = personData.profiles.find((u) => u.endsWith(lbPath));
      if (matched && personData.profiles[0] !== matched) {
        // Remove every instance of `matched` before prepending — guarantees
        // it ends up at position 0 exactly once, no duplicates anywhere.
        personData.profiles = [
          matched,
          ...personData.profiles.filter((u) => u !== matched),
        ];
      }
    }
  }

  // Preload + decode the first image so swapping Letterboxd's avatar for our
  // panel is instant (no blank frame while the new <img> fetches/decodes).
  if (hasLetterboxdAvatar) {
    const probe = new Image();
    probe.src = personData.profiles[0];
    if (typeof probe.decode === "function") {
      await probe.decode().catch(() => {});
    } else if (!probe.complete) {
      await new Promise((r) => {
        probe.addEventListener("load", r, { once: true });
        probe.addEventListener("error", r, { once: true });
      });
    }
  }

  buildPanel();
}

function extractTmdbFilePath(url) {
  if (!url) return null;
  const m = url.match(/\/t\/p\/[^/]+(\/[^/?]+\.[a-z]+)/i);
  return m ? m[1] : null;
}

async function initSearch() {
  const seen = new WeakSet();

  const insertThumb = (item, photoUrl) => {
    const container = item.querySelector(".icon-container");
    if (!container || container.classList.contains("tmdb-has-thumb")) return;
    container.classList.add("tmdb-has-thumb");
    const img = document.createElement("img");
    img.className = "tmdb-search-thumb";
    img.src = photoUrl;
    img.alt = "";
    container.appendChild(img);
  };

  // For ambiguous single-name actors, TMDB search alone can't disambiguate.
  // But each one has a Letterboxd actor page that already embeds their TMDB
  // photo URL in the avatar img — fetch the page and pull it out.
  const fetchLetterboxdPersonPhoto = async (href) => {
    try {
      const url = href.startsWith("http") ? href : `https://letterboxd.com${href}`;
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) return null;
      const html = await res.text();
      const m =
        html.match(/<img[^>]*\bdata-image=["']([^"']+)["']/) ||
        html.match(/<img[^>]*\bclass=["'][^"']*\bjs-tmdb-person\b[^"']*["'][^>]*\bsrc=["']([^"']+)["']/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };

  const processOne = async (item) => {
    if (seen.has(item)) return;
    seen.add(item);
    const link = item.querySelector(".content h2 a, .content a");
    if (!link) return;
    const name = link.textContent?.trim();
    if (!name) return;
    // Letterboxd lists a few of the person's films right under the name —
    // pass them through so the background can disambiguate by film overlap.
    const films = [...item.querySelectorAll('.film-metadata a[href^="/film/"]')]
      .map((a) => a.textContent?.trim())
      .filter(Boolean);

    // 1) Primary: scrape the actor's Letterboxd page for the exact photo it
    //    uses. This guarantees the search result matches what the user will
    //    see on the profile page and as the first carousel image.
    const href = link.getAttribute("href");
    let photo = null;
    if (href) photo = await fetchLetterboxdPersonPhoto(href);
    if (photo) {
      insertThumb(item, photo);
      return;
    }

    // 2) Fallback: TMDB search match (for the rare case where the Letterboxd
    //    page has no avatar img — e.g. tag pages or stripped profiles).
    try {
      const res = await chrome.runtime.sendMessage({ type: "FETCH_PERSON_THUMB", name, films });
      if (res?.profile) insertThumb(item, res.profile);
    } catch {}
  };

  const scan = () => {
    document.querySelectorAll("li.search-result.-contributor").forEach(processOne);
  };

  scan();

  // Re-scan when "Show more results" appends new items.
  const tableBody = document.getElementById("search-table-body");
  if (tableBody) {
    new MutationObserver(scan).observe(tableBody, { childList: true, subtree: true });
  }
}

function init() {
  pageMode = detectPageMode();
  if (pageMode === "film") initFilm();
  else if (pageMode === "person") initPerson();
  else if (pageMode === "search") initSearch();
}

init();
