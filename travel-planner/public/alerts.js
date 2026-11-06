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
