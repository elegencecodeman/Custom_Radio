const state = {
  messages: [],
  plays: [],
  announcements: [],
  plan: [],
  prefs: {},
  now: null,
  queue: [],
  playback: {
    status: "idle",
    paused: false,
    updatedAt: new Date().toISOString()
  }
};

export function getState() {
  return structuredClone(state);
}

export function appendMessage(message) {
  state.messages.push({ ...message, at: new Date().toISOString() });
  state.messages = state.messages.slice(-50);
}

export function setDecision(decision) {
  if (decision.music_query || decision.mood || decision.action) {
    state.prefs.lastDecision = {
      action: decision.action || "play",
      music_query: decision.music_query || "",
      mood: decision.mood || "",
      reason: decision.reason || "",
      segue: decision.segue || "",
      say: decision.say || ""
    };
  }

  if (decision.announcement) {
    state.announcements.push({ ...decision.announcement, at: new Date().toISOString() });
    state.announcements = state.announcements.slice(-30);
  }

  if (decision.track) {
    state.now = decision.track;
    state.playback = {
      status: "playing",
      paused: false,
      updatedAt: new Date().toISOString()
    };
    state.plays.push({ track: decision.track, at: new Date().toISOString() });
  }
  if (Array.isArray(decision.queue)) {
    state.queue = decision.queue;
  }
  return getState();
}

export function playQueuedTrack(track, remainingQueue = []) {
  state.now = track;
  state.queue = remainingQueue;
  state.playback = {
    status: "playing",
    paused: false,
    updatedAt: new Date().toISOString()
  };
  state.plays.push({ track, at: new Date().toISOString() });
  return getState();
}

export function playTrack(track) {
  state.now = track;
  state.playback = {
    status: "playing",
    paused: false,
    updatedAt: new Date().toISOString()
  };
  state.plays.push({ track, at: new Date().toISOString() });
  return getState();
}

export function pausePlayback() {
  state.playback = {
    status: "paused",
    paused: true,
    updatedAt: new Date().toISOString()
  };
  return getState();
}

export function buildTodayPlan() {
  const slots = [
    ["07:00", "morning", "清爽开机，不要太 emo"],
    ["09:00", "focus", "写代码，R&B / Soul 稳定节奏"],
    ["14:00", "flow", "下午专注，轻节奏"],
    ["19:00", "memory", "晚间故事感和华语黄金年代"],
    ["23:00", "night", "深夜港乐与低能量治愈"]
  ];
  state.plan = slots.map(([time, mode, note]) => ({ time, mode, note }));
  return state.plan;
}
