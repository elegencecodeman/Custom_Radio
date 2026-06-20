import { getTodayFallback } from "./apis/calendar.js";

export function getTodaySchedule() {
  return getTodayFallback();
}

export function startScheduler({ broadcast } = {}) {
  const timer = setInterval(() => {
    broadcast?.("scheduler:tick", {
      now: new Date().toISOString(),
      schedule: getTodaySchedule()
    });
  }, 60_000);

  return () => clearInterval(timer);
}
