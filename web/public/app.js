const $ = (selector) => document.querySelector(selector);

const title = $("#title");
const artist = $("#artist");
const reason = $("#reason");
const say = $("#say");
const queue = $("#queue");
const plan = $("#plan");
const tools = $("#tools");
const status = $("#status");
const form = $("#chatForm");
const message = $("#message");
const audio = $("#audio");

let playbackOrder = [];
let playbackIndex = 0;

const apiContract = [
  "GET /api/now",
  "POST /api/chat",
  "GET /api/next",
  "POST /api/play",
  "POST /api/pause",
  "GET /api/weather",
  "GET /api/today",
  "GET /api/tts/:id",
  "WS /stream"
];

function labelTrack(track) {
  if (!track) return { title: "等待 Claudio 开播", artist: "local radio" };
  return {
    title: track.title || track.songName || track.name || "私人电台候选",
    artist: track.artist || track.nameEn || track.name || "Claudio"
  };
}

function renderState(data, options = {}) {
  const state = data.state || data.payload?.state || data.payload || data;
  const decision = data.decision || data.payload?.decision || {};
  const execution = data.execution || data.payload?.execution || {};
  const now = execution.track || state.now;
  const track = labelTrack(now);

  title.textContent = track.title;
  artist.textContent = track.artist;
  reason.textContent = decision.reason || state.playback?.status || "ready";
  say.textContent = decision.say || "本地服务器已连接。";

  const items = execution.queue || state.queue || [];
  queue.innerHTML = items.length
    ? items.map((item) => {
      const t = labelTrack(item);
      const mark = item.playable === false ? " · 无可播链接" : "";
      return `<li>${t.title}<br><small>${t.artist}${mark}</small></li>`;
    }).join("")
    : "<li>暂无队列</li>";

  if (Array.isArray(execution.playbackOrder) && execution.playbackOrder.length) {
    playbackOrder = execution.playbackOrder.filter((item) => item.url || (item.track?.url && item.track?.playable !== false));
    playbackIndex = 0;
    if (options.autoplay) playCurrentOrderItem();
  }
}

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function sendPrompt(text) {
  status.textContent = "thinking";
  const data = await api("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: text,
      environment: {
        now: new Date().toISOString(),
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    })
  });
  renderState(data, { autoplay: true });
  status.textContent = "playing";
}

function playCurrentOrderItem() {
  const item = playbackOrder[playbackIndex];
  if (!item) {
    status.textContent = "online";
    return;
  }

  const url = item.url || item.track?.url;
  if (!url) {
    playbackIndex += 1;
    playCurrentOrderItem();
    return;
  }

  if (item.track) {
    const t = labelTrack(item.track);
    title.textContent = t.title;
    artist.textContent = t.artist;
  }

  audio.src = url;
  audio.play().then(() => {
    status.textContent = item.type === "tts" ? "announcing" : "playing";
  }).catch((error) => {
    status.textContent = "tap play";
    say.textContent = `浏览器阻止了自动播放，请点 Play。${error.message}`;
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = message.value.trim();
  if (!text) return;
  message.value = "";
  await sendPrompt(text);
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendPrompt(button.dataset.prompt));
});

$("#next").addEventListener("click", async () => {
  const data = await api("/api/next");
  renderState(data, { autoplay: true });
});

$("#play").addEventListener("click", async () => {
  if (audio.src) {
    await audio.play();
    status.textContent = "playing";
    return;
  }
  const data = await api("/api/next");
  renderState(data, { autoplay: true });
});

audio.addEventListener("ended", () => {
  playbackIndex += 1;
  playCurrentOrderItem();
});

audio.addEventListener("error", () => {
  status.textContent = "audio error";
  playbackIndex += 1;
  playCurrentOrderItem();
});

async function boot() {
  renderState(await api("/api/now"));

  const today = await api("/api/today");
  plan.innerHTML = (today.events || []).map((slot) => (
    `<li>${slot.time || "now"} · ${slot.title}<br><small>${slot.mood || ""}</small></li>`
  )).join("");

  tools.innerHTML = apiContract.map((item) => `
    <article class="tool" data-enabled="true">
      <strong>${item}</strong>
      <span>ready</span>
    </article>
  `).join("");

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const stream = new WebSocket(`${protocol}://${location.host}/stream`);
  stream.onopen = () => { status.textContent = "online"; };
  stream.onmessage = (event) => renderState(JSON.parse(event.data));
  stream.onclose = () => { status.textContent = "offline"; };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

boot().catch((error) => {
  status.textContent = "error";
  say.textContent = error.message;
});
