// ── Click-to-zoom on feature screenshots ───────────────────────────────────
(function () {
  const shots = document.querySelectorAll(".feature-shot img");
  if (!shots.length) return;

  shots.forEach(function (img) {
    img.addEventListener("click", function () {
      const card = img.closest(".feature");
      const title = card && card.querySelector(".feature-text h3");
      const desc = card && card.querySelector(".feature-text p");
      openZoom(
        img.src,
        title ? title.textContent : "",
        desc ? desc.textContent : ""
      );
    });
  });

  // Build the overlay with DOM APIs (not innerHTML) so the caption text is
  // safely escaped — feature copy lives in markup but better safe than sorry.
  function openZoom(src, title, desc) {
    closeZoom();
    const overlay = document.createElement("div");
    overlay.id = "zoom-overlay";

    const closeBtn = document.createElement("button");
    closeBtn.className = "zoom-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = "&times;";
    overlay.appendChild(closeBtn);

    const figure = document.createElement("figure");
    figure.className = "zoom-content";

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    figure.appendChild(img);

    if (title || desc) {
      const cap = document.createElement("figcaption");
      cap.className = "zoom-caption";
      if (title) {
        const h = document.createElement("h3");
        h.textContent = title;
        cap.appendChild(h);
      }
      if (desc) {
        const p = document.createElement("p");
        p.textContent = desc;
        cap.appendChild(p);
      }
      figure.appendChild(cap);
    }

    overlay.appendChild(figure);
    document.body.appendChild(overlay);

    // Close when clicking the backdrop or the X — but NOT when clicking the
    // image or its caption (so users can right-click → save image, select text).
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.classList.contains("zoom-close")) {
        closeZoom();
      }
    });
    document.addEventListener("keydown", onKey);
  }

  function closeZoom() {
    const existing = document.getElementById("zoom-overlay");
    if (existing) existing.remove();
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") closeZoom();
  }
})();

// ── Scroll cue (jump to next section heading) ──────────────────────────────
(function () {
  const cue = document.getElementById("scroll-cue");
  if (!cue) return;

  // Hop to the next section header that isn't already at/above the viewport
  // top. Each `.block` carries one big <h2>, so they form the natural stops.
  // We compute an absolute y and use window.scrollTo — scrollIntoView would
  // silently no-op if the section was already partially visible.
  cue.addEventListener("click", function (e) {
    e.preventDefault();
    const blocks = Array.from(document.querySelectorAll(".block"));
    const next = blocks.find(function (s) {
      return s.getBoundingClientRect().top > 80;
    });
    const docHeight = document.documentElement.scrollHeight;
    let targetY;
    if (next) {
      targetY = window.scrollY + next.getBoundingClientRect().top - 16;
    } else {
      // Past the last block — slide to the footer to complete the page.
      targetY = docHeight;
    }
    window.scrollTo({ top: targetY, behavior: "smooth" });
  });

  // Only hide near the very end — we want the cue visible the whole way
  // down so users can keep hopping section-to-section.
  let ticking = false;
  function update() {
    const scrolled = window.scrollY;
    const fromBottom =
      document.documentElement.scrollHeight - (scrolled + window.innerHeight);
    cue.classList.toggle("is-hidden", fromBottom < 120);
    ticking = false;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );
  update();
})();
