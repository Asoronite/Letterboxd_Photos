const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_IMAGES") {
    handleFetchImages(message.imdbId).then(sendResponse);
    return true;
  }
  if (message.type === "FETCH_PERSON_IMAGES") {
    handleFetchPersonImages(message.name, message.tmdbId).then(sendResponse);
    return true;
  }
  if (message.type === "FETCH_PERSON_THUMB") {
    handleFetchPersonThumb(message.name, message.films).then(sendResponse);
    return true;
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

function authHeaders(key) {
  return { Authorization: `Bearer ${key}` };
}

async function handleValidateKey(key) {
  try {
    const res = await fetch(`${TMDB_BASE}/configuration`, {
      headers: authHeaders(key),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

function dedupByPath(items) {
  const seen = new Set();
  return (items || []).filter((img) => {
    if (seen.has(img.file_path)) return false;
    seen.add(img.file_path);
    return true;
  });
}

async function handleFetchImages(imdbId) {
  const key = await getKey();
  if (!key) return { error: "NO_KEY" };

  try {
    const findRes = await fetch(
      `${TMDB_BASE}/find/${imdbId}?external_source=imdb_id`,
      { headers: authHeaders(key) }
    );
    if (!findRes.ok) return { error: "TMDB_ERROR" };

    const findData = await findRes.json();
    const movie = findData.movie_results?.[0] || findData.tv_results?.[0];
    if (!movie) return { error: "NOT_FOUND" };

    const mediaType = findData.movie_results?.length > 0 ? "movie" : "tv";
    const tmdbId = movie.id;

    const [imgRes, creditsRes] = await Promise.all([
      fetch(`${TMDB_BASE}/${mediaType}/${tmdbId}/images`, { headers: authHeaders(key) }),
      fetch(`${TMDB_BASE}/${mediaType}/${tmdbId}/credits`, { headers: authHeaders(key) }),
    ]);

    if (!imgRes.ok) return { error: "TMDB_ERROR" };
    const imgData = await imgRes.json();

    const formatList = (items, size) =>
      items.slice(0, 24).map((img) => `${TMDB_IMAGE_BASE}/${size}${img.file_path}`);

    const backdrops = dedupByPath(
      (imgData.backdrops || [])
        .filter((img) => img.iso_639_1 === null)
        .sort((a, b) => b.vote_average - a.vote_average)
    );

    const posters = dedupByPath(
      (imgData.posters || [])
        .filter((img) => img.iso_639_1 === null || img.iso_639_1 === "en")
        .sort((a, b) => b.vote_average - a.vote_average)
    );

    let cast = [];
    if (creditsRes.ok) {
      const creditsData = await creditsRes.json();
      const seen = new Set();
      const addPerson = (c) => {
        const key = c.name?.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        cast.push({
          name: c.name,
          profile: c.profile_path ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}` : null,
        });
      };
      (creditsData.cast || []).forEach(addPerson);
      (creditsData.crew || []).forEach(addPerson);
    }

    return {
      ok: true,
      title: movie.title || movie.name,
      tmdbId,
      backdrops: formatList(backdrops, "original"),
      posters: formatList(posters, "w780"),
      cast,
    };
  } catch {
    return { error: "FETCH_FAILED" };
  }
}

function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleFetchPersonThumb(name, films) {
  const key = await getKey();
  if (!key) return { error: "NO_KEY" };
  if (!name) return { error: "NOT_FOUND" };
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/person?query=${encodeURIComponent(name)}&include_adult=true`,
      { headers: authHeaders(key) }
    );
    if (!res.ok) return { error: "TMDB_ERROR" };
    const data = await res.json();
    const results = data.results || [];
    const target = normalizeName(name);
    const exactNameMatches = results.filter(
      (p) => normalizeName(p.name) === target
    );

    let person = null;

    // 1) Film overlap is the strongest signal — works even when TMDB stores
    //    the person under a different canonical name (e.g. stage name).
    if (Array.isArray(films) && films.length) {
      const hints = new Set(films.map(normalizeName).filter(Boolean));
      person = results.find((p) =>
        (p.known_for || []).some((kf) => {
          const t = kf.title || kf.name;
          return t && hints.has(normalizeName(t));
        })
      );
    }

    // 2) Otherwise, use the exact name match ONLY if it's unique AND the
    //    query is multi-word. Single-name queries ("Emma", "Tom") are
    //    inherently ambiguous: dozens of different Letterboxd actors share
    //    that mononym, so even a single TMDB hit for "Emma" almost certainly
    //    isn't the same person Letterboxd is referring to. Multi-word names
    //    ("Newton Thomas Sigel") are far less ambiguous and safe to trust
    //    when unique.
    if (
      !person &&
      target.includes(" ") &&
      exactNameMatches.length === 1
    ) {
      person = exactNameMatches[0];
    }

    if (!person?.profile_path) return { ok: true, profile: null };
    return {
      ok: true,
      name: person.name,
      profile: `${TMDB_IMAGE_BASE}/w185${person.profile_path}`,
    };
  } catch {
    return { error: "FETCH_FAILED" };
  }
}

async function handleFetchPersonImages(name, tmdbId) {
  const key = await getKey();
  if (!key) return { error: "NO_KEY" };
  if (!name && !tmdbId) return { error: "NOT_FOUND" };

  try {
    let personId = tmdbId;
    let personName = name || null;

    if (!personId) {
      const searchRes = await fetch(
        `${TMDB_BASE}/search/person?query=${encodeURIComponent(name)}&include_adult=false`,
        { headers: authHeaders(key) }
      );
      if (!searchRes.ok) return { error: "TMDB_ERROR" };
      const searchData = await searchRes.json();

      const lowered = name.toLowerCase();
      const person =
        (searchData.results || []).find((p) => p.name?.toLowerCase() === lowered) ||
        searchData.results?.[0];
      if (!person) return { error: "NOT_FOUND" };
      personId = person.id;
      personName = person.name;
    }

    const imgRes = await fetch(`${TMDB_BASE}/person/${personId}/images`, {
      headers: authHeaders(key),
    });
    if (!imgRes.ok) return { error: "TMDB_ERROR" };
    const imgData = await imgRes.json();

    const profiles = dedupByPath(
      (imgData.profiles || []).sort((a, b) => b.vote_average - a.vote_average)
    ).slice(0, 24).map((img) => `${TMDB_IMAGE_BASE}/original${img.file_path}`);

    return {
      ok: true,
      name: personName,
      tmdbId: personId,
      profiles,
    };
  } catch {
    return { error: "FETCH_FAILED" };
  }
}
