const bars = [44, 70, 38, 92, 58, 82, 46, 76, 62, 90, 52, 68, 42, 80, 56, 74];

export function Player({
  track,
  playback,
  isPlaying,
  progress,
  audioRef,
  onToggle,
  onNext,
  onPrevious,
  onEnded,
  onTimeUpdate
}) {
  return (
    <section className="glass-panel relative overflow-hidden rounded-3xl p-6 lg:p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div className="grid gap-7 lg:grid-cols-[280px_1fr]">
        <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-3xl border border-cyan-200/20 bg-slate-950 shadow-neon">
          <img className="h-full w-full object-cover opacity-90" src={track.cover} alt="" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-cyan-300/10" />
          <div className="absolute inset-5 rounded-full border border-cyan-200/20" style={{ animation: "pulse-ring 4s ease-in-out infinite" }} />
          <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
            <p className="hud-label">Now Transmitting</p>
            <p className="mt-1 truncate text-sm text-cyan-50">{track.source || "Claudio Radio"}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
              <span className="hud-label">{isPlaying ? "Live signal stable" : "Standby channel"}</span>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white lg:text-6xl">{track.title}</h1>
            <p className="mt-3 text-lg text-slate-300">{track.artist}</p>
          </div>

          <div className="mt-8">
            <div className="mb-5 flex h-20 items-end gap-1.5 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
              {bars.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 origin-bottom rounded-full bg-gradient-to-t from-violet-500 via-cyan-300 to-white"
                  style={{
                    height: `${isPlaying ? height : Math.max(18, height / 3)}%`,
                    animation: isPlaying ? `equalize ${1.15 + index * 0.04}s ease-in-out infinite` : "none",
                    animationDelay: `${index * 0.05}s`
                  }}
                />
              ))}
            </div>

            <audio
              ref={audioRef}
              className="mb-4 w-full accent-cyan-300"
              controls
              preload="none"
              onEnded={onEnded}
              onTimeUpdate={onTimeUpdate}
            />

            <div className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between font-mono text-xs text-slate-400">
                <span>{playback.status || "idle"}</span>
                <span>{track.duration || "--:--"}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button className="control-button" type="button" onClick={onPrevious} aria-label="Previous">&lt;</button>
              <button
                className="grid h-14 w-14 place-items-center rounded-full border border-cyan-200/50 bg-cyan-300 text-slate-950 shadow-[0_0_34px_rgba(34,211,238,0.34)] transition duration-300 hover:scale-105"
                type="button"
                onClick={onToggle}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button className="control-button" type="button" onClick={onNext} aria-label="Next">&gt;</button>
              <div className="ml-3 hidden h-11 items-center rounded-full border border-white/10 bg-white/5 px-4 font-mono text-xs text-cyan-100 sm:flex">
                Neural DJ · {track.bpm || "--"} BPM
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
