import { privateApi, assertConfigured } from "../config/private-api.js";

export async function getTodayCalendar() {
  assertConfigured("FEISHU_APP_ID", privateApi.feishu.appId);
  assertConfigured("FEISHU_APP_SECRET", privateApi.feishu.appSecret);
  return {
    status: "not_implemented",
    events: []
  };
}

export function getTodayFallback() {
  return {
    date: new Date().toISOString().slice(0, 10),
    events: [
      { time: "09:00", title: "Focus radio", mood: "work" },
      { time: "14:00", title: "Afternoon flow", mood: "rnb" },
      { time: "23:00", title: "Late night healing", mood: "soft" }
    ]
  };
}
