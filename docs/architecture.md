# Claudio Radio Architecture

## Layers

1. User context
   - `output/taste.md`
   - `output/mood-rules.md`
   - `output/playlists.json`

2. Local brain
   - `server/router.js` decides intent.
   - `server/context/assembler.js` builds the six-part prompt.
   - `server/brain/deepseek.js` calls DeepSeek.
   - `server/state/store.js` keeps local session state.

3. MCP tool belt
   - `server/mcp/registry.js` exposes tool definitions.
   - `server/mcp/tools.js` isolates each external service.
   - Tools are opt-in, scoped, and never receive raw secrets from the frontend.

4. PWA
   - `web/index.html` player.
   - `web/app.js` API and WebSocket client.
   - `web/styles.css` interface system.
   - `web/manifest.webmanifest` and `web/sw.js` install/offline shell.

## HTTP Contract

- `POST /api/chat`: user says mood, scene, or command.
- `GET /api/now`: current track, narration, queue, status.
- `GET /api/next`: ask local brain for the next item.
- `GET /api/taste`: summarized personal profile.
- `GET /api/plan/today`: day schedule slots.
- `GET /health`: server health.
- `WS /stream`: live events for chat, queue, and now playing.

## Secret Rule

Real keys belong only in `.env.local`. That file is ignored and loaded by `server/config/private-api.js`.
