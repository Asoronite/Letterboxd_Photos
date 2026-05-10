const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_IMAGES") {
    handleFetchImages(message.imdbId).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (message.type === "VALIDATE_KEY") {
    handleValidateKey(message.key).then(sendResponse);
    return true;
  }
});

async function getKey() {
  const { tmdbKey } = await chrome.storage.local.get("tmdbKey");
  return tmdbKey || null;
}

async function handleValidateKey(key) {
  try {
    const res = await fetch(`${TMDB_BASE}/configuration`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

async function handleFetchImages(imdbId) {
  const key = await getKey();
  if (!key) return { error: "NO_KEY" };

  try {
    // Find TMDB movie ID from IMDB ID
    const findRes = await fetch(
      `${TMDB_BASE}/find/${imdbId}?external_source=imdb_id`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!findRes.ok) return { error: "TMDB_ERROR" };

    const findData = await findRes.json();
    const movie = findData.movie_results?.[0] || findData.tv_results?.[0];
    if (!movie) return { error: "NOT_FOUND" };

    const mediaType = findData.movie_results?.length > 0 ? "movie" : "tv";
    const tmdbId = movie.id;

    // Fetch images
    const imgRes = await fetch(
      `${TMDB_BASE}/${mediaType}/${tmdbId}/images`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!imgRes.ok) return { error: "TMDB_ERROR" };

    const imgData = await imgRes.json();

    const dedup = (items) => {
      const seen = new Set();
      return (items || []).filter((img) => {
        if (seen.has(img.file_path)) return false;
        seen.add(img.file_path);
        return true;
      });
    };

    const format = (items, size) =>
      items.slice(0, 24).map((img) => `${TMDB_IMAGE_BASE}/${size}${img.file_path}`);

    // Backdrops: clean movie stills only (iso_639_1 === null means no text burned in)
    // sorted by community vote so the best shots come first
    const backdrops = dedup(
      (imgData.backdrops || [])
        .filter((img) => img.iso_639_1 === null)
        .sort((a, b) => b.vote_average - a.vote_average)
    );

    // Posters: English + language-neutral only, best voted first
    const posters = dedup(
      (imgData.posters || [])
        .filter((img) => img.iso_639_1 === null || img.iso_639_1 === "en")
        .sort((a, b) => b.vote_average - a.vote_average)
    );

    return {
      ok: true,
      title: movie.title || movie.name,
      tmdbId,
      backdrops: format(backdrops, "w1280"),
      posters: format(posters, "w500"),
    };
  } catch (e) {
    return { error: "FETCH_FAILED" };
  }
}
