# Claudio AI Radio

## Structure

```text
ai-radio/
├─ server/
│  ├─ index.js
│  ├─ router.js
│  ├─ brain/
│  │  ├─ deepseek.js
│  │  └─ prompt.js
│  ├─ apis/
│  │  ├─ music.js
│  │  ├─ tts.js
│  │  ├─ weather.js
│  │  ├─ calendar.js
│  │  └─ speaker.js
│  ├─ db/
│  │  ├─ state.db
│  │  └─ schema.sql
│  ├─ scheduler.js
│  └─ .env
├─ web/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ Player.jsx
│  │  ├─ api.js
│  │  └─ ws.js
│  ├─ public/
│  └─ package.json
├─ user/
│  ├─ taste.md
│  ├─ routines.md
│  ├─ mood-rules.md
│  └─ playlists.json
└─ README.md
```

## Run

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:8080`.

Build the React/Tailwind frontend before serving it from the Node server:

```powershell
npm.cmd run web:build
npm.cmd run dev
```

For frontend-only development:

```powershell
npm.cmd run web:dev
```

## API Contract

- `GET /api/now`: current playback state
- `POST /api/chat`: send one user sentence to the radio brain
- `GET /api/next`: pick next track
- `POST /api/play`: play a specified track
- `POST /api/pause`: pause playback
- `GET /api/weather`: fetch weather context
- `GET /api/today`: fetch today's schedule
- `GET /api/tts/:id`: fetch cached TTS audio
- `WS /stream`: push playback, AI narration, and lyric events

Music search uses `guohuiyuan/go-music-api` with `GO_MUSIC_SOURCE=kugou`, then falls back to local Kugou playlist data if that service is unavailable. Fish Audio is used for Claudio's spoken announcements.

Tips: Run `go-music-api` on a different port from Claudio, for example:
   'go run main.go' start 
```text
Claudio:      http://127.0.0.1:8080
go-music-api: http://127.0.0.1:8081
```

API keys live in `server/.env`, which is ignored by git.

Change