// 탐색 목록(관광공사 directory.json)의 장소를 일정에 넣을 수 있는 모양으로 바꾼다.
// 앱이 검토한 장소가 아니므로 unverified로 표시하고, 운영시간은 관광공사 원문에서 읽을 수 있을 때만 쓴다.
import { AREAS } from "./data.js";
import { distanceKm } from "./planner.js";

const DAY = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

// "09:00~18:00 (입장마감 17:00)" → { hours: ["09:00","18:00"], lastEntry: "17:00" }. "상시 개방"·"24시간" → 하루 종일. 못 읽으면 null
export function parseKtoHours(text) {
  const s = String(text || "");
  if (/상시|24\s*시간|연중\s*개방|제한\s*없음/.test(s) && !/\d{1,2}:\d{2}\s*[~∼\-–]/.test(s)) return { hours: ["00:00", "23:59"], lastEntry: null };
  const m = s.match(/(\d{1,2}):(\d{2})\s*[~∼\-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const pad = (h, mm) => `${String(Math.min(23, Number(h))).padStart(2, "0")}:${mm}`;
  let open = pad(m[1], m[2]), close = Number(m[3]) >= 24 ? "23:59" : pad(m[3], m[4]);
  if (close <= open) close = "23:59"; // 자정 넘어 영업
  const last = s.match(/(?:입장|매표|발권|주문)\s*마감\s*:?\s*(\d{1,2}):(\d{2})/);
  return { hours: [open, close], lastEntry: last ? pad(last[1], last[2]) : null };
}

// "매주 월요일, 화요일" → [1, 2]. "연중무휴" → []
export function parseKtoClosed(text) {
  const s = String(text || "");
  const out = new Set();
  for (const m of s.matchAll(/매주\s*([월화수목금토일])(?:요일)?((?:\s*[,·및]\s*[월화수목금토일](?:요일)?)*)/g)) {
    out.add(DAY[m[1]]);
    for (const d of m[2].matchAll(/([월화수목금토일])(?:요일)?/g)) out.add(DAY[d[1]]); // "요일"의 '일'을 일요일로 읽지 않게
  }
  return [...out].sort();
}

const CAT = { 12: "nature", 14: "culture", 28: "nature", 38: "culture", 39: "food" };

export function toPlannerPlace(d) {
  if (!d || d.type === "32" || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return null;
  // 가장 가까운 앱 지역(권역 포함)
  let area = null, best = Infinity;
  for (const [key, a] of Object.entries(AREAS)) { const k = distanceKm(a, d); if (k < best) { best = k; area = key; } }
  if (!area || best > 40) return null; // 앱 지역에서 너무 먼 곳
  const parsed = parseKtoHours(d.hours);
  return {
    id: `dir-${d.id}`, name: d.name, cat: CAT[d.type] || "nature", area, region: AREAS[area].region,
    lat: d.lat, lng: d.lng,
    hours: parsed ? parsed.hours : ["09:00", "18:00"], ...(parsed?.lastEntry ? { lastEntry: parsed.lastEntry } : {}),
    closed: parseKtoClosed(d.closed),
    stay: d.type === "39" ? 60 : d.type === "14" ? 60 : 50, indoor: d.type === "14" || d.type === "39", walk: 1, pop: 1, tags: [],
    desc: d.address || "", unverified: true, hoursText: [d.hours, d.closed].filter(Boolean).join(" · ") || "", hoursGuessed: !parsed,
  };
}
