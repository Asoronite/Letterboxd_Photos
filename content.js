let allImages = [];   // { src, thumb } flat list across active tab
let currentIndex = 0;
let activeTab = "backdrops";
let filmData = null;

// ─── IMDB ID extraction ───────────────────────────────────────────────────────

function getImdbId() {
  const link = document.querySelector('a[href*="imdb.com/title/"]');
  if (!link) return null;
  const match = link.href.match(/title\/(tt\d+)/);
  return match ? match[1] : null;
}

// ─── Panel injection ──────────────────────────────────────────────────────────

function insertPanel(panel) {
  // Append to the sidebar column — the IMDB link is in the main column on Letterboxd,
  // so we must not use it as an anchor; target the sidebar directly instead.
  const sidebar =
    document.querySelector(".col-sidebar") ||
    document.querySelector("#sidebar") ||
    document.querySelector("[data-sidebar]");

  if (sidebar) {
    sidebar.appendChild(panel);
    return;
  }
  // Fallback: after the "More at" line in the main column
  const imdbLink = document.querySelector('a[href*="imdb.com/title/"]');
  imdbLink?.closest("p,section,div")?.insertAdjacentElement("afterend", panel);
}

// ─── Build carousel panel ─────────────────────────────────────────────────────

function getImages() {
  if (!filmData) return [];
  return activeTab === "backdrops" ? filmData.backdrops : filmData.posters;
}

function matchLetterboxdTabStyle(tabs) {
  // Read computed styles from Letterboxd's own nav <a> elements
  const navLink = document.querySelector(
    "#tabbed-content ul li a, .film-tabs li a, .tabbed-content ul li a, ul.tabs li a, nav.tabs li a"
  );
  if (!navLink) return;
  const cs = window.getComputedStyle(navLink);
  tabs.forEach((btn) => {
    btn.style.fontFamily   = cs.fontFamily;
    btn.style.fontSize     = cs.fontSize;
    btn.style.fontWeight   = cs.fontWeight;
    btn.style.letterSpacing = cs.letterSpacing;
    btn.style.lineHeight   = cs.lineHeight;
  });
}

function buildPanel() {
  const existing = document.getElementById("tmdb-photo-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "tmdb-photo-panel";

  const images = getImages();
  allImages = images;
  currentIndex = Math.min(currentIndex, Math.max(0, images.length - 1));

  const hasBackdrops = filmData.backdrops.length > 0;
  const hasPosters = filmData.posters.length > 0;

  panel.innerHTML = `
    <div class="tmdb-panel-header">
      <span class="tmdb-panel-label">Photos</span>
      <div class="tmdb-tabs">
        ${hasBackdrops ? `<button class="tmdb-tab ${activeTab === "backdrops" ? "active" : ""}" data-tab="backdrops">Stills</button>` : ""}
        ${hasPosters  ? `<button class="tmdb-tab ${activeTab === "posters"   ? "active" : ""}" data-tab="posters">Posters</button>` : ""}
      </div>
    </div>

    <div class="tmdb-carousel ${activeTab === "posters" ? "is-poster" : ""}">
      <button class="tmdb-arrow tmdb-arrow-left" aria-label="Previous">&#8249;</button>
      <img
        class="tmdb-carousel-img"
        src="${images[currentIndex] || ""}"
        alt="Film photo"
        draggable="false"
      />
      <button class="tmdb-arrow tmdb-arrow-right" aria-label="Next">&#8250;</button>
      <div class="tmdb-counter">${images.length > 0 ? `${currentIndex + 1} / ${images.length}` : ""}</div>
    </div>
  `;

  // Tab switching
  const tabBtns = [...panel.querySelectorAll(".tmdb-tab")];
  matchLetterboxdTabStyle(tabBtns);
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      currentIndex = 0;
      buildPanel();
    });
  });

  // Arrow navigation
  panel.querySelector(".tmdb-arrow-left").addEventListener("click", () => navigate(-1));
  panel.querySelector(".tmdb-arrow-right").addEventListener("click", () => navigate(1));

  // Click image → lightbox
  panel.querySelector(".tmdb-carousel-img").addEventListener("click", () => openLightbox(currentIndex));

  insertPanel(panel);
}

function navigate(dir) {
  const images = getImages();
  if (!images.length) return;
  currentIndex = (currentIndex + dir + images.length) % images.length;

  const img = document.querySelector("#tmdb-photo-panel .tmdb-carousel-img");
  const counter = document.querySelector("#tmdb-photo-panel .tmdb-counter");
  if (img) img.src = images[currentIndex];
  if (counter) counter.textContent = `${currentIndex + 1} / ${images.length}`;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function openLightbox(startIndex) {
  const existing = document.getElementById("tmdb-lightbox");
  if (existing) existing.remove();

  const images = getImages();
  let idx = startIndex;
  let mode = "single"; // "single" | "grid"

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

    // Close
    lb.querySelector(".lb-backdrop").addEventListener("click", closeLightbox);
    lb.querySelector(".lb-close").addEventListener("click", closeLightbox);

    // Mode toggle
    lb.querySelector(".lb-btn-mode").addEventListener("click", () => {
      mode = mode === "single" ? "grid" : "single";
      renderLightbox();
    });

    if (mode === "single") {
      lb.querySelector(".lb-nav-left").addEventListener("click", () => { idx = (idx - 1 + images.length) % images.length; renderLightbox(); });
      lb.querySelector(".lb-nav-right").addEventListener("click", () => { idx = (idx + 1) % images.length; renderLightbox(); });
      lb.querySelector(".lb-main-img").addEventListener("click", () => { idx = (idx + 1) % images.length; renderLightbox(); });
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

  renderLightbox();
  document.body.appendChild(lb);

  // Keyboard navigation
  function onKey(e) {
    if (e.key === "Escape") { closeLightbox(); return; }
    if (mode === "single") {
      if (e.key === "ArrowLeft")  { idx = (idx - 1 + images.length) % images.length; renderLightbox(); }
      if (e.key === "ArrowRight") { idx = (idx + 1) % images.length; renderLightbox(); }
    }
  }
  document.addEventListener("keydown", onKey);

  function closeLightbox() {
    lb.remove();
    document.removeEventListener("keydown", onKey);
    // Sync carousel to last viewed index
    currentIndex = idx;
    const img = document.querySelector("#tmdb-photo-panel .tmdb-carousel-img");
    const counter = document.querySelector("#tmdb-photo-panel .tmdb-counter");
    if (img) img.src = getImages()[currentIndex];
    if (counter) counter.textContent = `${currentIndex + 1} / ${getImages().length}`;
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
  if (existing) existing.remove();
  const panel = document.createElement("div");
  panel.id = "tmdb-photo-panel";
  panel.innerHTML = `<p class="tmdb-empty">${html}</p>`;
  insertPanel(panel);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const imdbId = getImdbId();
  if (!imdbId) return;

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
  buildPanel();
}

init();
