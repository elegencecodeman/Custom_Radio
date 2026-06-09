import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { privateApi, assertConfigured } from "../config/private-api.js";

export function getCachedTtsPath(id) {
  return resolve(process.cwd(), "cache", "tts", `${id}.mp3`);
}

export function readCachedTts(id) {
  const filePath = getCachedTtsPath(id);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath);
}

export async function synthesizeSpeech(text) {
  assertConfigured("FISH_AUDIO_API_KEY", privateApi.fishAudio.apiKey);

  const body = buildFishTtsBody(text);
  const fetchOptions = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${privateApi.fishAudio.apiKey}`,
      "Content-Type": "application/json",
      "model": privateApi.fishAudio.model
    },
    body: JSON.stringify(body)
  };

  if (privateApi.fishAudio.proxy) {
    fetchOptions.dispatcher = new ProxyAgent(privateApi.fishAudio.proxy);
  }

  let response;
  try {
    response = await undiciFetch(`${privateApi.fishAudio.baseUrl}/v1/tts`, fetchOptions);
  } catch (error) {
    const cause = error.cause?.code ? ` (${error.cause.code})` : "";
    const proxyHint = privateApi.fishAudio.proxy ? "" : " Set FISH_AUDIO_PROXY in server/.env if you need a proxy.";
    throw new Error(`Fish Audio network error: ${error.message}${cause}.${proxyHint}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Fish Audio TTS failed: ${response.status} ${detail}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const detail = await response.text();
    throw new Error(`Fish Audio returned JSON instead of audio: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function createTtsReference(text) {
  const id = createHash("sha256").update(`${privateApi.fishAudio.referenceId}:${text}`).digest("base64url").slice(0, 32);
  const filePath = getCachedTtsPath(id);

  if (existsSync(filePath)) {
    return { id, text, url: `/api/tts/${id}`, status: "cached" };
  }

  try {
    const audio = await synthesizeSpeech(text);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, audio);
    return { id, text, url: `/api/tts/${id}`, status: "ready" };
  } catch (error) {
    return {
      id,
      text,
      url: null,
      status: "failed",
      warning: error.message
    };
  }
}

function buildFishTtsBody(text) {
  const body = {
    text,
    format: "mp3",
    sample_rate: privateApi.fishAudio.sampleRate,
    mp3_bitrate: privateApi.fishAudio.mp3Bitrate,
    temperature: 0.7,
    top_p: 0.7,
    chunk_length: 300,
    normalize: true,
    latency: "normal",
    max_new_tokens: 1024,
    repetition_penalty: 1.2,
    min_chunk_length: 50,
    condition_on_previous_chunks: true,
    early_stop_threshold: 1,
    prosody: {
      speed: 1,
      volume: 0,
      normalize_loudness: true
    }
  };

  if (privateApi.fishAudio.referenceId) {
    body.reference_id = privateApi.fishAudio.referenceId;
  }

  return body;
}
