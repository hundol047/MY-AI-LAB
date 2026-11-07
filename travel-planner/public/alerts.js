// 그날의 통제·운휴 가능성 경고. 영업시간처럼 확정된 정보가 아니라 "예보·계절상 멈출 수 있음"을 알린다.
// risk (data.js 장소 필드):
//   wind  케이블카·스카이워크·출렁다리·잔도 — 돌풍이 세면 운휴·통제
//   sea   해안 탐방로·해상 시설 — 풍랑(바람이 센 날)에 통제
//   snow  고갯길·고원 — 눈이 쌓이면 길이 막히거나 체인 필요
//   fire  국립공원 탐방로 — 봄·가을 산불조심기간에 일부 구간 통제
//   ski   스키장 — 개장·폐장일이 해마다 다름
// wx: { gust: 그날 최대 돌풍(m/s), snow: 적설(cm), rain: 강수확률(%) } — 예보 범위 밖이면 null

// 케이블카는 보통 초속 15~20m 돌풍에서 운행을 멈춘다(각 시설 안내 기준이 다름). 낮은 쪽으로 잡아 미리 알린다.
export const GUST_WARN = 15;
// 해안 시설은 풍랑특보(바람 14m/s 이상 또는 파고 3m) 때 통제된다. 바다 쪽은 예보 돌풍 14m/s부터 알린다.
export const SEA_WARN = 14;
export const SNOW_WARN = 3; // cm

// 국립공원 산불조심기간 (해마다 공원·구간별로 정해 발표: 대략 봄 2월 말~5월 중순, 가을 11월 중순~12월 중순)
const FIRE_SEASONS = [["03-02", "05-15"], ["11-15", "12-15"]];
export const inFireSeason = (date) => FIRE_SEASONS.some(([a, b]) => date.slice(5) >= a && date.slice(5) <= b);

export function alertsFor(place, date, wx) {
  const risk = place.risk || [];
  const out = [];
  if (wx && wx.gust != null) {
    if (risk.includes("wind") && wx.gust >= GUST_WARN) out.push({ kind: "wind", level: "warn", gust: Math.round(wx.gust) });
    else if (risk.includes("sea") && wx.gust >= SEA_WARN) out.push({ kind: "sea", level: "warn", gust: Math.round(wx.gust) });
  }
  if (wx && risk.includes("snow") && wx.snow >= SNOW_WARN) out.push({ kind: "snow", level: "warn", snow: Math.round(wx.snow) });
  if (risk.includes("fire") && inFireSeason(date)) out.push({ kind: "fire", level: "info" });
  if (risk.includes("ski")) out.push({ kind: "ski", level: "info" });
  return out;
}

// 출발 전에 확인할 공식 안내 (어느 일정에나). 깊은 주소는 바뀌기 쉬워 각 기관의 첫 화면으로 연결한다
export const OFFICIAL_CHECKS = [
  { key: "parks", label: "국립공원 탐방로 통제", url: "https://www.knps.or.kr" },
  { key: "weather", label: "기상특보", url: "https://www.weather.go.kr" },
  { key: "road", label: "고속도로·도로 상황", url: "https://www.roadplus.co.kr" },
];

// ---------- 기상특보 (기상청 특보 현황, warnings.json) ----------
// "o 건조주의보 : 강원도(동해평지, 삼척평지), 경상북도(울진평지)" → { kind: "건조", level: "주의보", zones: ["동해평지", "삼척평지"] } (강원 것만)
export function parseWarnings(text) {
  const items = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*o\s*(\S+?)(주의보|경보)\s*:\s*(.+)$/);
    if (!m) continue;
    const zones = [];
    const gw = m[3].match(/강원도\(([^)]*)\)/);
    if (gw) zones.push(...gw[1].split(",").map((s) => s.trim()).filter(Boolean));
    for (const sea of m[3].matchAll(/강원(북부|중부|남부)(앞바다|안쪽먼바다|바깥먼바다|먼바다)/g)) zones.push(sea[0]);
    if (zones.length) items.push({ kind: m[1], level: m[2], zones });
  }
  return items;
}
// 시군 → 해상 구역 (기상청 강원 앞바다 구분)
const SEA_ZONE = { 고성: "강원북부", 속초: "강원북부", 양양: "강원중부", 강릉: "강원중부", 동해: "강원남부", 삼척: "강원남부" };
// 특보가 그 장소에 걸리는지: 육상 특보는 "강릉평지·강릉산지"처럼 시군 이름으로 시작하는 구역, 풍랑은 시군의 앞바다
function hits(w, place, sigun) {
  if (!sigun) return false;
  if (w.kind === "풍랑") return !!SEA_ZONE[sigun] && w.zones.some((z) => z.startsWith(SEA_ZONE[sigun]));
  return w.zones.some((z) => z.startsWith(sigun));
}
// 특보 종류별로 어떤 장소에 경고(warn)·안내(info)를 붙이는지
function warningLevel(kind, place) {
  const risk = place.risk || [], outdoor = !place.indoor;
  if (kind === "강풍") return risk.includes("wind") ? "warn" : outdoor ? "info" : null;
  if (kind === "풍랑") return risk.includes("sea") || place.cat === "sea" ? "warn" : null;
  if (kind === "대설") return risk.includes("snow") ? "warn" : "info";
  if (kind === "호우" || kind === "태풍") return outdoor ? "warn" : "info";
  if (kind === "한파" || kind === "폭염") return outdoor ? "info" : null;
  if (kind === "건조") return risk.includes("fire") ? "info" : null;
  return null;
}
// warnings: warnings.json, sigun: 장소의 시군, date: 일정 날짜, today: 오늘(한국 날짜). 특보는 지금 상황이라 오늘·내일 일정에만 붙인다
export function kmaAlertsFor(place, date, { warnings, sigun, today, tomorrow } = {}) {
  if (!warnings || (date !== today && date !== tomorrow)) return [];
  const fresh = Date.now() - new Date(warnings.fetchedAt).getTime() < 6 * 3600e3;
  if (!fresh) return [];
  const out = [];
  for (const [list, prelim] of [[warnings.now || [], false], [warnings.upcoming || [], true]]) for (const w of list) {
    if (!hits(w, place, sigun)) continue;
    const level = warningLevel(w.kind, place);
    if (level) out.push({ kind: "kma", level: prelim ? "info" : level, name: `${w.kind}${w.level}`, prelim });
  }
  return out;
}
