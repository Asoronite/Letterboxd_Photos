const input = document.getElementById("api-key");
const saveBtn = document.getElementById("save-btn");
const clearBtn = document.getElementById("clear-btn");
const status = document.getElementById("status");
const savedIndicator = document.getElementById("saved-indicator");
const toggleBtn = document.getElementById("toggle-visibility");
const openGuideLink = document.getElementById("open-guide");

openGuideLink.addEventListener("click", (e) => {
  e.preventDefault();
  // Opening as an extension page (not via http) so the file:/// path can't
  // confuse the user or get blocked by sandbox rules.
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  window.close();
});

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = `status ${type}`;
}

function hideStatus() {
  status.className = "status hidden";
}

toggleBtn.addEventListener("click", () => {
  input.type = input.type === "password" ? "text" : "password";
});

// Load saved key on open. If no key is saved yet, pulse the setup-guide link
// in the footer so first-time openers know exactly where to go for help.
chrome.storage.local.get("tmdbKey", ({ tmdbKey }) => {
  if (tmdbKey) {
    input.value = tmdbKey;
    savedIndicator.classList.remove("hidden");
  } else {
    openGuideLink.classList.add("is-pulsing");
  }
});

saveBtn.addEventListener("click", async () => {
  const key = input.value.trim();
  if (!key) {
    showStatus("Please paste your TMDB API Read Access Token.", "error");
    return;
  }

  saveBtn.disabled = true;
  showStatus("Validating key…", "loading");

  const response = await chrome.runtime.sendMessage({
    type: "VALIDATE_KEY",
    key,
  });

  if (response?.ok) {
    await chrome.storage.local.set({ tmdbKey: key });
    showStatus("Key saved! Reloading Letterboxd…", "success");
    savedIndicator.classList.remove("hidden");
    openGuideLink.classList.remove("is-pulsing");
    // host_permissions for letterboxd.com let us query + reload those tabs
    // without needing the broad "tabs" permission.
    try {
      const tabs = await chrome.tabs.query({ url: "https://letterboxd.com/*" });
      for (const t of tabs) chrome.tabs.reload(t.id);
    } catch {}
  } else {
    showStatus("Invalid key — check it and try again.", "error");
    savedIndicator.classList.add("hidden");
  }

  saveBtn.disabled = false;
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("tmdbKey");
  input.value = "";
  hideStatus();
  savedIndicator.classList.add("hidden");
  // Resume nudging the user toward the setup guide — they're back at zero.
  openGuideLink.classList.add("is-pulsing");
});
