// 여행 중 모드: 오늘이 여행 날이면 "지금 무엇을, 언제 출발해야 하는지"를 계산한다.
// 위치를 주면(GPS) 지금 있는 곳에서 다음 장소까지 다시 계산하고, 입장 마감·문 닫는 시간에 늦는지 본다.
import { travel, hoursFor } from "./planner.js";

// 한국 시간 기준 오늘 날짜와 분
export function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600e3);
  return { date: k.toISOString().slice(0, 10), min: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

/**
 * trip: planTrip 결과, now: {date, min}, here: {lat,lng} 또는 null, move: 이동수단
 * 반환: null(오늘은 여행 날이 아님) 또는 { dayIdx, state, item, idx, leaveBy, travelMin, arrive, late, deadline }
 *   state: "before"(첫 일정 전) | "at"(지금 일정 중) | "next"(다음 일정으로 이동할 때) | "done"(오늘 일정 끝)
 */
export function todayStatus(trip, now, here = null, move = "car") {
  const dayIdx = trip.days.findIndex((d) => d.date === now.date);
  if (dayIdx < 0) return null;
  const items = trip.days[dayIdx].items;
  if (!items.length) return null;
  const cur = items.findIndex((it) => now.min >= it.start && now.min < it.end);
  if (cur >= 0 && !here) return { dayIdx, state: "at", item: items[cur], idx: cur, leaveAt: items[cur].end };
  const idx = items.findIndex((it) => it.start > now.min || (here && it.end > now.min && cur < 0));
  if (idx < 0) return { dayIdx, state: "done" };
  const it = items[idx];
  // 이동 시간: 위치가 있으면 지금 위치에서 다시 계산, 없으면 일정에 잡힌 이동 시간
  const travelMin = here ? travel(here, it.place, move).min : it.travelMin || 0;
  const leaveBy = it.start - travelMin;
  const arrive = now.min + travelMin;
  // 늦으면 안 되는 시각: 입장 마감 → 문 닫는 시간 (축제·여러 가게가 모인 곳은 문 닫는 시간만)
  let deadline = null;
  if (it.place.cat !== "festival") {
    const h = hoursFor(it.place, now.date);
    deadline = h.lastEntry ?? h.close;
  }
  const late = deadline != null && arrive > deadline;
  return { dayIdx, state: idx === 0 && cur < 0 && now.min < items[0].start ? "before" : "next", item: it, idx, leaveBy, travelMin, arrive, late, deadline };
}
