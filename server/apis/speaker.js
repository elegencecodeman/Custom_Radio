import { privateApi, assertConfigured } from "../config/private-api.js";

export async function castToSpeaker(audioUrl) {
  assertConfigured("UPNP_RENDERER_URL", privateApi.upnp.rendererUrl);
  const response = await fetch(privateApi.upnp.rendererUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioUrl })
  });
  if (!response.ok) throw new Error(`Speaker API failed: ${response.status}`);
  return response.json();
}

export function speakerStatus() {
  return {
    enabled: Boolean(privateApi.upnp.rendererUrl),
    status: privateApi.upnp.rendererUrl ? "configured" : "planned"
  };
}
