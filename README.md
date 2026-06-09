# AI Radio Project

 AI Radio is a local-first AI DJ project. It combines a Node.js backend, a React/Vite frontend, weather and calendar context, music search, and TTS announcements to turn a short user prompt into a narrated playback queue.

## Features

- Chat-style radio prompt input
- AI decision layer with DeepSeek plus local fallback logic
- Weather and calendar context for recommendations
- Music queue resolution through `go-music-api`
- TTS announcements for Claudio's spoken intro
- WebSocket stream for live playback and AI updates
- React frontend plus a static `web/public` fallback UI

## Project Layout

```text
smart_radio/
  server/           Node.js backend, routing, schedulers, API adapters
  web/              React frontend and static public assets
  user/             Local user taste, routines, and playlist inputs
  docs/             Notes and supporting documentation
  go-music-api/     Local music search service dependency
  get_song/         Helper tooling for music source workflows
  cache/            Generated local cache data (ignored by git)
  output/           Local output artifacts (ignored by git)
```

## Tech Stack

- Node.js 18+
- React 19
- Vite
- Tailwind CSS
- WebSocket
- DeepSeek API
- Fish Audio API
- OpenWeather API

## How It Works

1. The frontend sends a prompt such as "play something for late-night coding".
2. The backend builds context from current playback state, user taste files, weather, and today's schedule.
3. The AI layer decides whether to speak, pause, or build a music queue.
4. The backend resolves tracks, creates a TTS intro, stores the updated state, and returns a playback order.
5. The frontend plays the TTS item first, then continues through the queue while listening for live updates on `/stream`.

## Getting Started

### 1. Install dependencies

From the repository root:

```powershell
npm install
```

From the frontend directory:

```powershell
npm --prefix web install
```

### 2. Configure environment variables

Copy `.env.example` to `server/.env` and fill in the real values:

```powershell
Copy-Item .env.example server/.env
```

Important variables:

- `DEEPSEEK_API_KEY`
- `GO_MUSIC_API_BASE_URL`
- `FISH_AUDIO_API_KEY`
- `FISH_AUDIO_REFERENCE_ID`
- `OPENWEATHER_API_KEY`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

The loader also supports `.env.local`, but that file should stay local and uncommitted.

### 3. Run the backend

```powershell
npm run dev
```

Default backend address:

```text
http://127.0.0.1:8080
```

### 4. Run the React frontend in development

```powershell
npm run web:dev
```

### 5. Build the frontend for the Node server

```powershell
npm run web:build
npm run dev
```

## Available Scripts

At the repository root:

- `npm run dev` - start the Node backend
- `npm run web:dev` - start the Vite frontend
- `npm run web:build` - build the frontend into `web/dist`
- `npm run check` - syntax-check key backend files

In `web/`:

- `npm run dev` - start Vite
- `npm run build` - production build

## API Surface

- `GET /health`
- `GET /api/now`
- `GET /api/next`
- `POST /api/chat`
- `POST /api/play`
- `POST /api/pause`
- `GET /api/weather`
- `GET /api/today`
- `GET /api/tts/:id`
- `WS /stream`

## Local Data and Secrets

Do not commit these files:

- `server/.env`
- `.env.local`
- `server/db/*.db`
- `cache/`
- `output/`
- `web/dist/`
- `node_modules/`

This repository is prepared so those paths are ignored by git.

## Notes

- Several text strings in the current codebase show encoding issues. That does not block local development, but it is worth cleaning up before a public release.
- The backend serves files from `web/public` directly. The React app in `web/src` is the newer frontend path for Vite-based development.

