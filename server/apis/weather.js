import { privateApi, assertConfigured } from "../config/private-api.js";

export async function getWeather(location = "Dongguan") {
  assertConfigured("OPENWEATHER_API_KEY", privateApi.weather.apiKey);
  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("q", location);
  url.searchParams.set("appid", privateApi.weather.apiKey);
  url.searchParams.set("units", "metric");
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Weather API failed: ${response.status} ${detail}`);
  }
  const data = await response.json();
  return normalizeOpenWeather(data, location);
}

export function getWeatherFallback(location = "Dongguan") {
  return {
    location,
    status: "not_configured",
    summary: "Weather API key is not configured yet.",
    temperature: null
  };
}

function normalizeOpenWeather(data, fallbackLocation) {
  const weather = data.weather?.[0] || {};
  return {
    location: data.name || fallbackLocation,
    status: "ok",
    summary: weather.description || weather.main || "unknown",
    condition: weather.main || "unknown",
    temperature: round(data.main?.temp),
    feelsLike: round(data.main?.feels_like),
    humidity: data.main?.humidity ?? null,
    windSpeed: round(data.wind?.speed),
    cloudiness: data.clouds?.all ?? null,
    sunrise: data.sys?.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : null,
    sunset: data.sys?.sunset ? new Date(data.sys.sunset * 1000).toISOString() : null,
    raw: data
  };
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10) / 10;
}
