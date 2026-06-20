export async function api(path, options = {}) {
  const { timeoutMs = 45000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
