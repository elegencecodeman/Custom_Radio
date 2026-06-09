export async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const radioApi = {
  now: () => api("/api/now"),
  chat: (message, environment = {}) => api("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, environment })
  }),
  next: () => api("/api/next"),
  play: (track) => api("/api/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track })
  }),
  pause: () => api("/api/pause", { method: "POST" }),
  weather: (location) => api(`/api/weather?location=${encodeURIComponent(location)}`),
  today: () => api("/api/today")
};
