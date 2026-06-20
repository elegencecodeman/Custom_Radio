import { loadEnv } from "./env.js";

loadEnv();

export const privateApi = Object.freeze({
  server: {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 8080)
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat"
  },
  music: {
    baseUrl: process.env.GO_MUSIC_API_BASE_URL || process.env.KUGOU_API_BASE_URL || "",
    source: process.env.GO_MUSIC_SOURCE || "kugou",
    sources: (process.env.GO_MUSIC_SOURCES || process.env.GO_MUSIC_SOURCE || "netease,qq,kugou,kuwo,migu")
      .split(",")
      .map((source) => source.trim())
      .filter(Boolean)
  },
  fishAudio: {
    apiKey: process.env.FISH_AUDIO_API_KEY || "",
    baseUrl: process.env.FISH_AUDIO_BASE_URL || "https://api.fish.audio",
    model: process.env.FISH_AUDIO_MODEL || "s2-pro",
    referenceId: process.env.FISH_AUDIO_REFERENCE_ID || "",
    sampleRate: Number(process.env.FISH_AUDIO_SAMPLE_RATE || 44100),
    mp3Bitrate: Number(process.env.FISH_AUDIO_MP3_BITRATE || 128),
    proxy: process.env.FISH_AUDIO_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ""
  },
  feishu: {
    appId: process.env.FEISHU_APP_ID || "",
    appSecret: process.env.FEISHU_APP_SECRET || ""
  },
  weather: {
    apiKey: process.env.OPENWEATHER_API_KEY || ""
  },
  upnp: {
    rendererUrl: process.env.UPNP_RENDERER_URL || ""
  }
});

export function assertConfigured(name, value) {
  if (!value) {
    const error = new Error(`${name} is not configured. Put it in server/.env.`);
    error.code = "CONFIG_MISSING";
    throw error;
  }
}
