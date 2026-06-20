import { useEffect, useMemo, useRef, useState } from "react";
import { radioApi } from "./api.js";
import { connectRadioStream } from "./ws.js";
import { Player } from "./Player.jsx";

const fallbackTrack = {
  title: "等待 Claudio 开播",
  artist: "local radio",
  duration: "--:--",
  bpm: 84,
  source: "AI Radio",
  cover: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80"
};

const quickPrompts = ["晚上写论文", "开车提神", "睡前放松", "来点不打扰的 R&B"];

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function labelTrack(track) {
  if (!track) return fallbackTrack;
  return {
    ...fallbackTrack,
    ...track,
    title: track.title || track.songName || track.name || fallbackTrack.title,
    artist: track.artist || track.nameEn || track.singerName || fallbackTrack.artist,
    source: track.source || fallbackTrack.source,
    cover: track.cover || track.raw?.cover || fallbackTrack.cover,
    duration: track.duration ? formatDuration(track.duration) : track.durationText || fallbackTrack.duration
  };
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const min = Math.floor(seconds / 60);
  const sec = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${min}:${sec}`;
}

function normalizeEvents(today) {
  return (today?.events || []).map((item) => ({
    time: item.time || "now",
    title: item.title || item.summary || "Calendar event",
    tone: item.mood || item.tone || ""
  }));
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s,./|:;!?()[\]{}"'_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function collectTrackText(track) {
  if (!track) return "";
  return [
    track.title,
    track.songName,
    track.name,
    track.artist,
    track.artistName,
    track.singerName,
    track.album,
    track.albumName,
    ...(track.tags || []),
    track.raw ? JSON.stringify(track.raw) : ""
  ].filter(Boolean).join(" ");
}

function getPlayableScore(tracks) {
  if (!tracks.length) return 0;
  const playable = tracks.filter((track) => track.playable !== false && (track.url || track.streamUrl || track.id)).length;
  return playable / tracks.length;
}

function calculateSignalAnalysis({ decision, execution, state, currentTrack, queue, mode, events, history }) {
  const activeDecision = decision || execution || state?.prefs?.lastDecision || {};
  const tracks = [currentTrack, ...queue].filter(Boolean);
  const queryTerms = tokenize([activeDecision.music_query, activeDecision.mood, mode].filter(Boolean).join(" "));
  const trackText = tracks.map(collectTrackText).join(" ").toLowerCase();
  const matchedTerms = [...new Set(queryTerms.filter((term) => trackText.includes(term)))];
  const queryScore = queryTerms.length ? matchedTerms.length / new Set(queryTerms).size : 0;
  const playableScore = getPlayableScore(tracks);
  const hasDecision = Boolean(activeDecision.music_query || activeDecision.mood || activeDecision.reason);
  const eventText = events.map((event) => `${event.title} ${event.tone}`).join(" ").toLowerCase();
  const contextTerms = tokenize([activeDecision.mood, mode].filter(Boolean).join(" "));
  const contextScore = contextTerms.length && eventText
    ? contextTerms.filter((term) => eventText.includes(term)).length / contextTerms.length
    : hasDecision ? 0.45 : 0;
  const historyKeys = new Set(history.map((item) => collectTrackText(item.track).toLowerCase()).filter(Boolean));
  const repeatPenalty = tracks.some((track) => historyKeys.has(collectTrackText(track).toLowerCase())) ? 0.1 : 0;
  const base = hasDecision ? 0.38 : 0.18;
  const score = Math.round(
    Math.max(0.08, Math.min(0.98, base + queryScore * 0.28 + playableScore * 0.24 + contextScore * 0.16 - repeatPenalty)) * 100
  );

  const signals = [];
  if (activeDecision.mood) signals.push(`mood: ${activeDecision.mood}`);
  if (activeDecision.music_query) signals.push(`query: ${activeDecision.music_query}`);
  signals.push(`${tracks.length} tracks`);
  signals.push(`${Math.round(playableScore * 100)}% playable`);
  if (matchedTerms.length) signals.push(`${matchedTerms.length} term hits`);

  return {
    score,
    label: hasDecision ? "live match" : "waiting",
    signals: signals.slice(0, 4)
  };
}

export default function App() {
  const audioRef = useRef(null);
  const [state, setState] = useState(null);
  const [decision, setDecision] = useState(null);
  const [execution, setExecution] = useState(null);
  const [weather, setWeather] = useState(null);
  const [today, setToday] = useState(null);
  const [message, setMessage] = useState("来点晚上写论文听的歌");
  const [mode, setMode] = useState("学习");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackOrder, setPlaybackOrder] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("connecting");
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    Promise.allSettled([
      radioApi.now(),
      radioApi.weather("Dongguan"),
      radioApi.today()
    ]).then(([nowResult, weatherResult, todayResult]) => {
      if (nowResult.status === "fulfilled") setState(nowResult.value);
      if (weatherResult.status === "fulfilled") setWeather(weatherResult.value);
      if (todayResult.status === "fulfilled") setToday(todayResult.value);
      setStatusText("online");
    });

    const socket = connectRadioStream((packet) => {
      if (packet.payload?.state) setState(packet.payload.state);
      if (packet.payload?.decision) setDecision(packet.payload.decision);
      if (packet.payload?.execution) {
        setExecution(packet.payload.execution);
        adoptPlaybackOrder(packet.payload.execution.playbackOrder || []);
      }
    });
    socket.addEventListener("open", () => setStatusText("online"));
    socket.addEventListener("close", () => setStatusText("offline"));
    return () => socket.close();
  }, []);

  function adoptPlaybackOrder(order, shouldAutoplay = false) {
    const playable = order.filter((item) => {
      if (item.type === "tts") return item.status !== "failed" && Boolean(item.url);
      return item.url || (item.track?.url && item.track?.playable !== false);
    });
    setPlaybackOrder(playable);
    setPlaybackIndex(0);
    if (shouldAutoplay && playable.length) {
      setTimeout(() => playOrderItem(playable[0]), 0);
    }
  }

  async function playOrderItem(item) {
    const audio = audioRef.current;
    if (!audio || !item) return;
    const url = item.url || item.track?.url;
    if (!url) return;

    audio.src = url;
    try {
      await audio.play();
      setIsPlaying(true);
      setStatusText(item.type === "tts" ? "announcing" : "playing");
    } catch {
      setStatusText("tap play");
      setIsPlaying(false);
    }
  }

  async function sendPrompt(text = message) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatusText("thinking");
    try {
      const payload = await radioApi.chat(trimmed, {
        now: new Date().toISOString(),
        location: "Dongguan",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      setDecision(payload.decision);
      setExecution(payload.execution);
      setState(payload.state);
      if (payload.context?.weather) setWeather(payload.context.weather);
      if (payload.context?.calendar) setToday(payload.context.calendar);
      adoptPlaybackOrder(payload.execution?.playbackOrder || [], true);
      setStatusText(payload.execution?.track ? "playing" : "online");
    } catch (error) {
      setStatusText("request failed");
      setDecision({
        say: "这次请求没有及时返回，可以检查后端服务、DeepSeek、音乐 API 或代理配置。",
        reason: error.message
      });
    }
  }

  async function nextTrack() {
    setStatusText("loading next");
    try {
      const payload = await radioApi.next();
      setDecision(payload.decision);
      setExecution(payload.execution);
      setState(payload.state);
      adoptPlaybackOrder(payload.execution?.playbackOrder || [], true);
    } catch (error) {
      setStatusText("request failed");
      setDecision({
        say: "切歌请求失败了，先检查后端服务是否还在线。",
        reason: error.message
      });
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (isPlaying) {
      await radioApi.pause();
      audio?.pause();
      setIsPlaying(false);
      setStatusText("paused");
      return;
    }

    if (audio?.src) {
      try {
        await audio.play();
        setIsPlaying(true);
        setStatusText("playing");
      } catch {
        setStatusText("tap play");
      }
      return;
    }

    if (playbackOrder[playbackIndex]) {
      await playOrderItem(playbackOrder[playbackIndex]);
      return;
    }

    await nextTrack();
  }

  function onAudioEnded() {
    const nextIndex = playbackIndex + 1;
    setPlaybackIndex(nextIndex);
    if (playbackOrder[nextIndex]) playOrderItem(playbackOrder[nextIndex]);
    else {
      setIsPlaying(false);
      setStatusText("online");
    }
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress(Math.min(100, (audio.currentTime / audio.duration) * 100));
  }

  const currentTrack = labelTrack(execution?.track || state?.now);
  const queue = execution?.queue || state?.queue || [];
  const history = (state?.plays || []).slice(-5).reverse();
  const events = normalizeEvents(today);
  const announcement = execution?.announcement || state?.announcements?.at?.(-1);
  const signalAnalysis = useMemo(
    () => calculateSignalAnalysis({ decision, execution, state, currentTrack, queue, mode, events, history }),
    [decision, execution, state, currentTrack, queue, mode, events, history]
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.24),transparent_58%)]" />

      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-5 py-5 lg:px-8">
        <TopBar now={now} weather={weather} statusText={statusText} />

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="grid gap-5">
            <Player
              track={currentTrack}
              playback={state?.playback || { status: statusText }}
              isPlaying={isPlaying}
              progress={progress}
              audioRef={audioRef}
              onToggle={togglePlay}
              onNext={nextTrack}
              onPrevious={() => setPlaybackIndex(Math.max(0, playbackIndex - 1))}
              onEnded={onAudioEnded}
              onTimeUpdate={onTimeUpdate}
            />

            <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
              <AiBroadcast decision={decision} announcement={announcement} />
              <UserInput message={message} setMessage={setMessage} onSubmit={sendPrompt} />
            </div>

            <RecommendationList queue={queue} />
          </div>

          <SidePanel mode={mode} setMode={setMode} events={events} history={history} signalAnalysis={signalAnalysis} />
        </div>
      </div>
    </main>
  );
}

function TopBar({ now, weather, statusText }) {
  const weatherText = weather?.temperature
    ? `${weather.location || "Dongguan"} · ${weather.temperature}°C`
    : weather?.summary || "Weather fallback";

  return (
    <header className="glass-panel flex flex-col gap-4 rounded-3xl px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="hud-label">Claudio Neural Radio Console</p>
        <h2 className="mt-1 text-xl font-semibold text-white">个人 AI 电台中控台</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusPill label="TIME" value={formatTime(now)} />
        <StatusPill label="WEATHER" value={weatherText} />
        <StatusPill label="LINK" value={statusText} active />
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-violet-400 text-sm font-bold text-slate-950">C</div>
          <div>
            <p className="text-xs text-slate-400">User</p>
            <p className="text-sm text-white">Claudio</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ label, value, active = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
      <p className="hud-label">{label}</p>
      <p className={`mt-1 truncate text-sm ${active ? "text-cyan-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

function AiBroadcast({ decision, announcement }) {
  return (
    <section className="glass-panel relative overflow-hidden rounded-3xl p-5">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-cyan-300/10 to-transparent" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="hud-label">AI Broadcast</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">Claudio 正在播报</h3>
          </div>
          <span className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-3 py-1 font-mono text-xs text-cyan-100">
            {announcement?.status || "STANDBY"}
          </span>
        </div>
        <p className="text-lg leading-8 text-slate-100">
          {decision?.say || "输入一句你想听的场景，Claudio 会先生成电台播报，再为你选择可播放的歌曲。"}
        </p>
        <div className="mt-5 rounded-2xl border border-violet-300/20 bg-violet-400/10 p-4">
          <p className="hud-label">Reason</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {decision?.reason || "等待 DeepSeek 根据 taste、routines、天气、日程和播放历史做出决策。"}
          </p>
          {decision?.music_query && (
            <p className="mt-3 font-mono text-xs text-cyan-200">music_query: {decision.music_query}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function UserInput({ message, setMessage, onSubmit }) {
  return (
    <section className="glass-panel rounded-3xl p-5">
      <p className="hud-label">Intent Input</p>
      <h3 className="mt-1 text-2xl font-semibold text-white">我想听什么</h3>
      <form className="mt-5 flex gap-3" onSubmit={(event) => { event.preventDefault(); onSubmit(message); }}>
        <input
          className="min-w-0 flex-1 rounded-2xl border border-cyan-200/20 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:shadow-[0_0_24px_rgba(34,211,238,0.12)]"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="来点晚上写论文听的歌"
        />
        <button className="rounded-2xl border border-cyan-200/40 bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]" type="submit">
          发送
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
            type="button"
            onClick={() => { setMessage(prompt); onSubmit(prompt); }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}

function RecommendationList({ queue }) {
  const items = queue.length ? queue : [];
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="hud-label">Recommendation Queue</p>
          <h3 className="mt-1 text-2xl font-semibold text-white">推荐歌曲列表</h3>
        </div>
        <span className="font-mono text-xs text-slate-400">{items.length} MATCHES</span>
      </div>
      <div className="grid gap-3">
        {items.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">暂无推荐，先发一句你想听什么。</div>}
        {items.map((song, index) => (
          <article
            key={`${song.id || song.title}-${index}`}
            className="group grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition duration-300 hover:border-cyan-300/30 hover:bg-cyan-300/[0.06] hover:shadow-neon md:grid-cols-[40px_1fr_auto]"
          >
            <div className="font-mono text-sm text-cyan-200/70">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <h4 className="font-medium text-white">{song.title || song.songName}</h4>
              <p className="mt-1 text-sm text-slate-400">{song.artist}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[song.source, song.playable ? "playable" : "no-url"].filter(Boolean).map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-2.5 py-1 font-mono text-[11px] text-cyan-100">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs text-slate-400">
              <span>{formatDuration(song.duration)}</span>
              <span className={song.playable ? "text-cyan-200" : "text-rose-300"}>{song.playable ? "ready" : "no audio"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SidePanel({ mode, setMode, events, history, signalAnalysis }) {
  return (
    <aside className="grid gap-5">
      <section className="glass-panel rounded-3xl p-5">
        <p className="hud-label">Current Mode</p>
        <h3 className="mt-1 text-2xl font-semibold text-white">{mode}模式</h3>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {["学习", "放松", "睡眠"].map((item) => (
            <button
              key={item}
              className={`rounded-2xl border px-3 py-3 text-sm transition ${
                mode === item
                  ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100 shadow-neon"
                  : "border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/30 hover:text-cyan-100"
              }`}
              type="button"
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-5">
        <p className="hud-label">Today</p>
        <h3 className="mt-1 text-2xl font-semibold text-white">今日安排</h3>
        <div className="mt-5 space-y-3">
          {(events.length ? events : [{ time: "now", title: "No calendar data", tone: "fallback" }]).map((item) => (
            <div key={`${item.time}-${item.title}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="font-mono text-xs text-cyan-200">{item.time}</p>
              <p className="mt-1 text-sm text-white">{item.title}</p>
              <p className="mt-1 text-xs text-slate-400">{item.tone}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-5">
        <p className="hud-label">History</p>
        <h3 className="mt-1 text-2xl font-semibold text-white">播放历史</h3>
        <div className="mt-5 space-y-3">
          {(history.length ? history : [{ track: { title: "暂无播放历史", artist: "Claudio" } }]).map((item, index) => {
            const track = labelTrack(item.track);
            return (
              <div key={`${track.title}-${index}`} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.8)]" />
                {track.title} · {track.artist}
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-panel relative overflow-hidden rounded-3xl p-5">
        <div className="absolute inset-x-0 -top-16 h-28 bg-cyan-300/10 blur-2xl" />
        <p className="hud-label">Signal Analysis</p>
        <div className="relative mt-4 aspect-square rounded-full border border-cyan-200/20 p-5">
          <div className="grid h-full place-items-center rounded-full border border-violet-300/20 bg-slate-950/70">
            <div className="text-center">
              <p className="text-4xl font-semibold text-white">{signalAnalysis.score}%</p>
              <p className="mt-1 font-mono text-xs text-cyan-200">{signalAnalysis.label}</p>
            </div>
          </div>
          <div className="absolute inset-3 rounded-full border border-cyan-300/20" style={{ animation: "pulse-ring 3.2s ease-in-out infinite" }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {signalAnalysis.signals.map((signal) => (
            <span key={signal} className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-2.5 py-1 font-mono text-[11px] text-cyan-100">
              {signal}
            </span>
          ))}
        </div>
      </section>
    </aside>
  );
}
