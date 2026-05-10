const input = document.getElementById("api-key");
const saveBtn = document.getElementById("save-btn");
const clearBtn = document.getElementById("clear-btn");
const status = document.getElementById("status");
const savedIndicator = document.getElementById("saved-indicator");
const toggleBtn = document.getElementById("toggle-visibility");

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

// Load saved key on open
chrome.storage.local.get("tmdbKey", ({ tmdbKey }) => {
  if (tmdbKey) {
    input.value = tmdbKey;
    savedIndicator.classList.remove("hidden");
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
    showStatus("Key saved! Reload any open Letterboxd tabs.", "success");
    savedIndicator.classList.remove("hidden");
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
});
