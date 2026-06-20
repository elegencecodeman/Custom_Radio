import { askDeepSeek, fallbackBrain } from "./brain/deepseek.js";
import { buildPrompt, getLibrary, loadUserContext, summarizeTaste } from "./brain/prompt.js";
import { getTrackKey, resolveMusicQueue } from "./apis/music.js";
import { getWeather, getWeatherFallback } from "./apis/weather.js";
import { getTodayCalendar } from "./apis/calendar.js";
import { createTtsReference, readCachedTts } from "./apis/tts.js";
import { getTodaySchedule } from "./scheduler.js";
import { appendMessage, getState, pausePlayback, playQueuedTrack, playTrack, setDecision } from "./state/store.js";

export async function handleChat(message, environment = {}) {
  appendMessage({ role: "user", content: message });

  const baseState = getState();
  const weather = await getWeatherState(environment.location || "Dongguan");
  const calendar = await getTodayState();
  const prompt = buildPrompt({ message, state: baseState, weather, calendar });

  let brainDecision;
  try {
    brainDecision = await askDeepSeek(prompt.messages);
  } catch (error) {
    brainDecision = fallbackBrain({ userText: message });
    brainDecision.warning = error.code === "CONFIG_MISSING" ? error.message : "DeepSeek unavailable; used local fallback.";
  }

  const execution = await executeDecision(brainDecision, prompt.library);
  appendMessage({ role: "assistant", content: brainDecision.say });

  const nextState = execution.state || setDecision(execution.decision);
  return {
    decision: brainDecision,
    execution: execution.decision || null,
    state: nextState,
    context: { weather, calendar }
  };
}

export function getNow() {
  return getState();
}

export function getTaste() {
  const { playlists } = loadUserContext();
  return summarizeTaste(playlists);
}

export function getPlanToday() {
  return getTodaySchedule();
}

export async function getNextLocal() {
  const { playlists } = loadUserContext();
  const library = getLibrary(playlists);

  const currentState = getState();
  if (currentState.queue?.length) {
    const [track, ...remainingQueue] = currentState.queue;
    const decision = {
      action: "next",
      say: "收到，给你换一首更顺耳的。",
      track,
      queue: remainingQueue,
      music_query: currentState.prefs?.lastDecision?.music_query || "",
      mood: currentState.prefs?.lastDecision?.mood || "flow",
      reason: "沿用上一轮用户需求，从当前推荐队列切到下一首。",
      segue: "这首继续保持刚才的方向。",
      playbackOrder: [{ type: "song", track }]
    };
    return {
      decision,
      execution: decision,
      state: playQueuedTrack(track, remainingQueue)
    };
  }

  const lastDecision = currentState.prefs?.lastDecision;
  const brainDecision = lastDecision?.music_query
    ? {
        ...lastDecision,
        action: "next",
        say: "收到，按刚才的方向再换一首。",
        reason: "当前队列已空，沿用上一轮 music_query 重新搜索相近歌曲。"
      }
    : fallbackBrain({ userText: "换一首" });

  const execution = await executeDecision(brainDecision, library, {
    excludeKeys: buildPlayedTrackKeys(currentState)
  });
  return {
    decision: brainDecision,
    execution: execution.decision || null,
    state: execution.state || getState()
  };
}

export function playSpecificTrack(track) {
  return { state: playTrack(track) };
}

export function pauseCurrentTrack() {
  return { state: pausePlayback() };
}

export async function getWeatherState(location) {
  try {
    return await getWeather(location);
  } catch (error) {
    const fallback = getWeatherFallback(location);
    return {
      ...fallback,
      status: error.code === "CONFIG_MISSING" ? fallback.status : "error",
      summary: error.code === "CONFIG_MISSING" ? fallback.summary : "Weather API request failed.",
      warning: error.message
    };
  }
}

export async function getTodayState() {
  try {
    return await getTodayCalendar();
  } catch (error) {
    return { ...getTodaySchedule(), warning: error.message };
  }
}

export function getTtsAudio(id) {
  return readCachedTts(id);
}

async function executeDecision(brainDecision, library, options = {}) {
  if (brainDecision.action === "pause") {
    return { state: pausePlayback() };
  }

  if (brainDecision.action === "ask") {
    const announcement = await createTtsReference(brainDecision.say);
    const decision = {
      announcement,
      action: brainDecision.action,
      say: brainDecision.say,
      music_query: brainDecision.music_query,
      mood: brainDecision.mood,
      reason: brainDecision.reason,
      segue: brainDecision.segue,
      playbackOrder: buildPlaybackOrder(announcement, [])
    };
    return { decision };
  }

  const queue = await resolveMusicQueue(library, brainDecision.music_query, 8, options);
  const announcement = await createTtsReference(brainDecision.say);
  const decision = {
    announcement,
    action: brainDecision.action,
    say: brainDecision.say,
    music_query: brainDecision.music_query,
    mood: brainDecision.mood,
    track: queue[0] || null,
    queue: queue.slice(1),
    reason: brainDecision.reason,
    segue: brainDecision.segue,
    playbackOrder: buildPlaybackOrder(announcement, queue)
  };

  return { decision };
}

function buildPlayedTrackKeys(state) {
  const keys = new Set();
  if (state.now) keys.add(getTrackKey(state.now));
  for (const play of state.plays || []) {
    if (play.track) keys.add(getTrackKey(play.track));
  }
  return keys;
}

function buildPlaybackOrder(announcement, queue) {
  const order = [];

  if (announcement && ["ready", "cached"].includes(announcement.status)) {
    order.push({
      type: "tts",
      id: announcement.id,
      text: announcement.text,
      url: announcement.url,
      status: announcement.status
    });
  }

  return order.concat(queue.map((track) => ({ type: "song", track })));
}
