import { privateApi, assertConfigured } from "../config/private-api.js";

const allowedActions = new Set(["play", "pause", "next", "recommend", "ask"]);

export async function askDeepSeek(messages, options = {}) {
  assertConfigured("DEEPSEEK_API_KEY", privateApi.deepseek.apiKey);

  const response = await fetch(`${privateApi.deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${privateApi.deepseek.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model || privateApi.deepseek.model,
      temperature: options.temperature ?? 0.4,
      response_format: { type: "json_object" },
      messages
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  return normalizeDecision(JSON.parse(content));
}

export function normalizeDecision(raw = {}) {
  const action = allowedActions.has(raw.action) ? raw.action : "recommend";
  const query = raw.music_query || raw.playlist_query || "";
  return {
    say: String(raw.say || "我先按你的状态切一组合适的歌。").slice(0, 180),
    action,
    music_query: String(query || defaultQueryFor(action, raw.mood)).slice(0, 160),
    mood: String(raw.mood || "general").slice(0, 40),
    reason: String(raw.reason || "radio_decision").slice(0, 240),
    segue: String(raw.segue || "先从这一首开始。").slice(0, 160)
  };
}

export function fallbackBrain({ userText }) {
  const text = userText || "";
  const isFocus = /论文|写|学习|代码|工作|focus/i.test(text);
  const isNight = /晚上|夜|睡前|深夜/i.test(text);
  const isPause = /暂停|停一下|pause/i.test(text);
  const isNext = /下一首|换一首|next/i.test(text);

  if (isPause) {
    return normalizeDecision({
      say: "好，我先帮你暂停。",
      action: "pause",
      reason: "用户要求暂停播放"
    });
  }

  if (isNext) {
    return normalizeDecision({
      say: "收到，给你换一首更顺耳的。",
      action: "next",
      music_query: "personal taste next song",
      mood: "flow",
      reason: "用户要求切歌",
      segue: "换个方向继续。"
    });
  }

  return normalizeDecision({
    say: isFocus
      ? "晚上写东西别放太炸的，给你切一组低刺激、适合专注的歌。"
      : "我先按你现在的状态，切一组稳一点的私人电台。",
    action: "play",
    music_query: isFocus || isNight ? "focus night english soft rnb" : "personal radio soft pop",
    mood: isFocus ? "focus" : "soft",
    reason: "DeepSeek key 未配置，使用本地规则生成电台决策",
    segue: "先用一首轻一点的，把状态带起来。"
  });
}

function defaultQueryFor(action, mood) {
  if (action === "pause") return "";
  if (action === "ask") return "";
  return `${mood || "soft"} personal radio`;
}
