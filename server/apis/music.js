import { privateApi, assertConfigured } from "../config/private-api.js";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`go-music-api failed: ${response.status} ${detail}`);
  }
  return response.json();
}

export async function searchMusic(keyword, options = {}) {
  assertConfigured("GO_MUSIC_API_BASE_URL", privateApi.music.baseUrl);
  const sources = options.sources || privateApi.music.sources;
  const url = new URL("/api/v1/music/search", privateApi.music.baseUrl);
  url.searchParams.set("q", keyword);
  url.searchParams.set("type", "song");
  for (const source of sources) {
    url.searchParams.append("sources", source);
  }

  const payload = await requestJson(url);
  return normalizeSearchResponse(payload, sources[0] || privateApi.music.source);
}

export async function getSongUrl(track) {
  assertConfigured("GO_MUSIC_API_BASE_URL", privateApi.music.baseUrl);
  const source = track.source || privateApi.music.source;
  const id = track.id || track.songId;
  const url = new URL("/api/v1/music/url", privateApi.music.baseUrl);
  url.searchParams.set("source", source);
  url.searchParams.set("id", id);
  if (track.title) url.searchParams.set("name", track.title);
  if (track.artist) url.searchParams.set("artist", track.artist);
  if (track.album) url.searchParams.set("album", track.album);
  if (track.duration) url.searchParams.set("duration", String(track.duration));
  return requestJson(url);
}

export async function getLyric(track) {
  assertConfigured("GO_MUSIC_API_BASE_URL", privateApi.music.baseUrl);
  const source = track.source || privateApi.music.source;
  const id = track.lyricId || track.id || track.songId;
  const url = new URL("/api/v1/music/lyric", privateApi.music.baseUrl);
  url.searchParams.set("source", source);
  url.searchParams.set("id", id);
  return requestJson(url);
}

export function buildStreamUrl(track) {
  if (track.url) return track.url;
  if (!privateApi.music.baseUrl || !track.id) return "";
  if (String(track.id).startsWith("local-")) return "";

  const source = track.source || privateApi.music.source;
  const url = new URL("/api/v1/music/stream", privateApi.music.baseUrl);
  url.searchParams.set("source", source);
  url.searchParams.set("id", track.id);
  if (track.title) url.searchParams.set("name", track.title);
  if (track.artist) url.searchParams.set("artist", track.artist);
  if (track.album) url.searchParams.set("album", track.album);
  if (track.duration) url.searchParams.set("duration", String(track.duration));
  return url.toString();
}

export async function resolveMusicQueue(library, query, limit = 8, options = {}) {
  const excludeKeys = new Set(options.excludeKeys || []);

  try {
    const remote = await searchMusic(query);
    const playable = [];
    const failed = [];

    for (const track of remote.slice(0, 24)) {
      if (excludeKeys.has(getTrackKey(track))) continue;
      const resolved = await resolvePlayableTrack(track);
      if (resolved.playable) playable.push(resolved);
      else failed.push(resolved);
      if (playable.length >= limit) break;
    }

    if (playable.length) return playable.slice(0, limit);
    if (failed.length) return failed.slice(0, limit);
  } catch (error) {
    const local = searchLocalMusic(library, query, limit, { excludeKeys });
    local.warning = error.message;
    return local;
  }

  return searchLocalMusic(library, query, limit, { excludeKeys });
}

async function resolvePlayableTrack(track) {
  const streamUrl = buildStreamUrl(track);
  try {
    const payload = await getSongUrl(track);
    const directUrl = payload.data?.url || payload.url || payload.data;
    return {
      ...track,
      url: directUrl || streamUrl,
      streamUrl,
      playable: Boolean(directUrl || streamUrl)
    };
  } catch (error) {
    return {
      ...track,
      url: streamUrl,
      streamUrl,
      playable: false,
      warning: error.message
    };
  }
}

export function searchLocalMusic(library, query, limit = 8, options = {}) {
  const excludeKeys = new Set(options.excludeKeys || []);
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const normalized = library.map((track, index) => ({
    id: track.id || track.songId || track.hash || track.fileHash || `local-${index}`,
    title: track.title || track.songName || track.name || "Untitled",
    artist: track.artist || track.artistName || track.singerName || track.nameEn || "Unknown",
    album: track.album || track.albumName || "",
    source: track.source || "local",
    url: track.url || track.songUrl || "",
    lyricId: track.lyricId || track.hash || track.fileHash || "",
    tags: track.tags || [],
    raw: track
  }));

  const scored = normalized.filter((track) => !excludeKeys.has(getTrackKey(track))).map((track, index) => {
    const haystack = [
      track.title,
      track.artist,
      track.album,
      ...track.tags,
      JSON.stringify(track.raw)
    ].join(" ").toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { track, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(({ track }) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    source: track.source,
    url: track.url,
    lyricId: track.lyricId,
    playable: Boolean(track.url),
    tags: track.tags
  }));
}

export function getTrackKey(track = {}) {
  return [
    track.source || "",
    track.id || track.songId || track.hash || track.fileHash || "",
    track.title || track.songName || track.name || "",
    track.artist || track.artistName || track.singerName || ""
  ].join("|").toLowerCase();
}

function normalizeSearchResponse(payload, fallbackSource) {
  const rows = Array.isArray(payload)
    ? payload
    : payload.data?.songs || payload.data?.list || payload.data?.result || payload.result || payload.data || [];

  if (!Array.isArray(rows)) return [];

  return rows.map((row, index) => {
    const id = row.id || row.songmid || row.mid || row.hash || row.fileHash || row.songId || row.rid || `remote-${index}`;
    const title = row.name || row.title || row.songName || row.songname || "Untitled";
    const artist = normalizeArtist(row);
    return {
      id: String(id),
      title,
      artist,
      album: row.album || row.albumName || row.albumname || "",
      duration: row.duration || row.interval || 0,
      source: row.source || row.platform || fallbackSource,
      url: row.url || row.playUrl || row.songUrl || "",
      lyricId: row.lyricId || row.lyric_id || id,
      raw: row
    };
  });
}

function normalizeArtist(row) {
  if (typeof row.artist === "string") return row.artist;
  if (typeof row.singer === "string") return row.singer;
  if (typeof row.artistName === "string") return row.artistName;
  if (typeof row.singerName === "string") return row.singerName;
  if (Array.isArray(row.artists)) {
    return row.artists.map((artist) => artist.name || artist).join(", ");
  }
  if (Array.isArray(row.singers)) {
    return row.singers.map((artist) => artist.name || artist).join(", ");
  }
  return "Unknown";
}
