import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readUserFile(filename, fallback = "") {
  try {
    return readFileSync(resolve(process.cwd(), "user", filename), "utf8");
  } catch {
    return fallback;
  }
}

export function loadUserContext() {
  const playlistsText = readUserFile("playlists.json", "{}");
  return {
    taste: readUserFile("taste.md"),
    routines: readUserFile("routines.md"),
    moodRules: readUserFile("mood-rules.md"),
    playlists: JSON.parse(playlistsText)
  };
}

export function getLibrary(playlists) {
  if (Array.isArray(playlists.songs)) return playlists.songs;
  if (Array.isArray(playlists.tracks)) return playlists.tracks;
  if (Array.isArray(playlists.playlists)) {
    return playlists.playlists.flatMap((list) => list.songs || list.tracks || []);
  }
  if (Array.isArray(playlists.favoriteSongs)) return playlists.favoriteSongs;
  return [
    { id: "local-eason-1", title: "富士山下", artist: "陈奕迅", tags: ["night", "cantonese", "soft"] },
    { id: "local-eason-2", title: "好久不见", artist: "陈奕迅", tags: ["night", "mandarin", "soft"] },
    { id: "local-jay-1", title: "七里香", artist: "周杰伦", tags: ["nostalgia", "mandarin"] },
    { id: "local-david-1", title: "普通朋友", artist: "陶喆", tags: ["rnb", "focus"] },
    { id: "local-jj-1", title: "江南", artist: "林俊杰", tags: ["mandarin", "ballad"] }
  ];
}

export function summarizeTaste(playlists) {
  return {
    generatedAt: playlists.profile?.generatedAt,
    totalSongs: playlists.profile?.totalSongs,
    totalArtists: playlists.profile?.totalArtists,
    favoriteArtists: (playlists.favoriteArtists || []).slice(0, 12).map((artist) => ({
      rank: artist.rank,
      name: artist.nameEn || artist.name,
      count: artist.songCount,
      tags: artist.tags || []
    }))
  };
}

export function buildPrompt({ message, state, weather, calendar }) {
  const context = loadUserContext();
  const library = getLibrary(context.playlists);
  const system = [
    "你是一个私人 AI 电台的大脑。",
    "你的任务不是聊天，而是根据用户口味、时间、天气、日程和播放历史，决定下一步播放什么、说什么。",
    "DeepSeek 不负责直接播放音乐，只负责决策和生成文本。",
    "音乐由后端使用酷狗音乐/本地酷狗歌单搜索完成；你只需要给 music_query。",
    "你必须返回 JSON，不要输出多余解释。",
    "JSON 字段必须是：",
    "- say：要播报给用户的话，短，像电台主持人",
    "- action：play / pause / next / recommend / ask",
    "- music_query：需要搜索的音乐关键词。play、next、recommend 时必须给出",
    "- mood：当前音乐情绪标签，例如 focus / night / soft / energetic / emo",
    "- reason：内部原因，给系统看",
    "- segue：歌曲之间的过渡语",
    "示例：",
    "{\"say\":\"现在是晚上，给你放一组适合写东西的低节奏歌曲。\",\"action\":\"play\",\"music_query\":\"soft english study music\",\"mood\":\"focus\",\"reason\":\"用户处于学习场景，需要低干扰背景音乐\",\"segue\":\"先用一首轻一点的，把注意力放回文字里。\"}"
  ].join("\n");

  return {
    context,
    library,
    messages: [
      { role: "system", content: system },
      { role: "system", content: `用户口味 taste.md:\n${context.taste.slice(0, 10000)}` },
      { role: "system", content: `作息习惯 routines.md:\n${context.routines.slice(0, 6000)}` },
      { role: "system", content: `场景规则 mood-rules.md:\n${context.moodRules.slice(0, 14000)}` },
      { role: "system", content: `当前天气 weather:\n${JSON.stringify(weather)}` },
      { role: "system", content: `今日安排 calendar:\n${JSON.stringify(calendar)}` },
      { role: "system", content: `最近播放 state:\n${JSON.stringify(state)}` },
      { role: "user", content: message || "根据当前状态决定下一步电台行为。" }
    ]
  };
}
