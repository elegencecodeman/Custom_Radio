import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { privateApi } from "./config/private-api.js";
import {
  getNextLocal,
  getNow,
  getTodayState,
  getTtsAudio,
  getWeatherState,
  handleChat,
  pauseCurrentTrack,
  playSpecificTrack
} from "./router.js";
import { startScheduler } from "./scheduler.js";

const webDistDir = resolve(process.cwd(), "web", "dist");
const webPublicDir = resolve(process.cwd(), "web", "public");
const publicDir = existsSync(webDistDir) ? webDistDir : webPublicDir;
const sockets = new Set();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function sendAudio(res, buffer) {
  if (!buffer) return sendJson(res, { error: "tts_not_found" }, 404);
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=31536000"
  });
  res.end(buffer);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function encodeWsFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x81, length]), payload]);
  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

function broadcast(event, payload) {
  const packet = JSON.stringify({ event, payload, at: new Date().toISOString() });
  const frame = encodeWsFrame(packet);
  for (const socket of sockets) {
    if (socket.destroyed || !socket.writable) {
      sockets.delete(socket);
      continue;
    }
    socket.write(frame, (error) => {
      if (error) {
        sockets.delete(socket);
        socket.destroy();
      }
    });
  }
}

function closeWebSocket(socket) {
  if (socket.destroyed) return;
  try {
    socket.end(Buffer.from([0x88, 0x00]));
  } catch {
    socket.destroy();
  }
}

function handleWsData(socket, buffer) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = Boolean(buffer[offset + 1] & 0x80);
    let length = buffer[offset + 1] & 0x7f;
    offset += 2;

    if (length === 126) {
      if (offset + 2 > buffer.length) return;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) return;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    const maskOffset = masked ? 4 : 0;
    if (offset + maskOffset + length > buffer.length) return;
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    offset += maskOffset;
    const payload = buffer.subarray(offset, offset + length);
    offset += length;

    if (opcode === 0x8) {
      sockets.delete(socket);
      closeWebSocket(socket);
      return;
    }

    if (opcode === 0x9) {
      const pongPayload = masked
        ? Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]))
        : payload;
      socket.write(encodeControlFrame(0x0a, pongPayload));
    }
  }
}

function encodeControlFrame(opcode, payload = Buffer.alloc(0)) {
  const length = Math.min(payload.length, 125);
  return Buffer.concat([Buffer.from([0x80 | opcode, length]), payload.subarray(0, length)]);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(join(publicDir, pathname));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": mime[extname(filePath)] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/health") return sendJson(res, { ok: true });
    if (url.pathname === "/api/now") return sendJson(res, getNow());
    if (url.pathname === "/api/next") {
      const data = await getNextLocal();
      broadcast("playback", data);
      return sendJson(res, data);
    }
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = await readBody(req);
      const data = await handleChat(body.message || "", body.environment || {});
      broadcast("ai", data);
      return sendJson(res, data);
    }
    if (url.pathname === "/api/play" && req.method === "POST") {
      const body = await readBody(req);
      const data = playSpecificTrack(body.track || body);
      broadcast("playback", data);
      return sendJson(res, data);
    }
    if (url.pathname === "/api/pause" && req.method === "POST") {
      const data = pauseCurrentTrack();
      broadcast("playback", data);
      return sendJson(res, data);
    }
    if (url.pathname === "/api/weather") {
      return sendJson(res, await getWeatherState(url.searchParams.get("location") || "Dongguan"));
    }
    if (url.pathname === "/api/today") return sendJson(res, await getTodayState());
    if (url.pathname.startsWith("/api/tts/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/tts/", ""));
      return sendAudio(res, getTtsAudio(id));
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/stream") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  sockets.add(socket);
  socket.write(encodeWsFrame(JSON.stringify({ event: "hello", payload: getNow() })));
  socket.on("data", (buffer) => handleWsData(socket, buffer));
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
});

startScheduler({ broadcast });

server.listen(privateApi.server.port, privateApi.server.host, () => {
  console.log(`Claudio Radio running at http://${privateApi.server.host}:${privateApi.server.port}`);
});
