import assert from "node:assert/strict";
import { alertsFor, inFireSeason, GUST_WARN } from "../public/alerts.js";
import { PLACES } from "../public/data.js";
const cable = PLACES.find((p) => p.id === "seorak-cable"), beach = PLACES.find((p) => p.id === "gyeongpo-beach"), trail = PLACES.find((p) => p.id === "sea-trail");
assert.deepEqual(alertsFor(cable, "2026-11-10", { gust: GUST_WARN + 2, snow: 0 }).map((a) => a.kind), ["wind"]);
assert.deepEqual(alertsFor(cable, "2026-11-10", { gust: 8, snow: 0 }), []);
assert.deepEqual(alertsFor(cable, "2026-11-10", null), [], "예보 없으면 경고 없음");
assert.deepEqual(alertsFor(beach, "2026-11-10", { gust: 25, snow: 10 }), [], "위험 표시 없는 곳은 경고 없음");
assert.equal(alertsFor(trail, "2026-11-10", { gust: 16 })[0].kind, "wind", "바람·바다 둘 다면 바람 경고 하나만");
assert.ok(inFireSeason("2027-03-10") && inFireSeason("2026-11-20") && !inFireSeason("2026-07-01"));
for (const p of PLACES) for (const r of p.risk || []) assert.ok(["wind", "sea", "snow", "fire", "ski"].includes(r), `${p.id}: ${r}`);
// 기상특보: 강원 구역만 읽고, 시군·바다 구역이 맞는 장소에, 오늘·내일 일정에만 붙인다
import("../public/alerts.js").then(({ parseWarnings, kmaAlertsFor }) => {
  const now = parseWarnings("o 건조주의보 : 강원도(동해평지, 강릉산지), 경상북도(울진평지)\r\no 풍랑주의보 : 강원중부앞바다, 남해동부바깥먼바다\r\no 강풍경보 : 강원도(속초평지)");
  assert.deepEqual(now.map((w) => [w.kind, w.level, w.zones.join("/")]), [["건조", "주의보", "동해평지/강릉산지"], ["풍랑", "주의보", "강원중부앞바다"], ["강풍", "경보", "속초평지"]]);
  const w = { fetchedAt: new Date().toISOString(), now, upcoming: [] }, ctx = (sigun) => ({ warnings: w, sigun, today: "2026-11-07", tomorrow: "2026-11-08" });
  const trailFire = { risk: ["fire"], indoor: false, cat: "nature" }, sea = { risk: ["sea"], cat: "sea" }, cable = { risk: ["wind"], cat: "nature" };
  assert.equal(kmaAlertsFor(trailFire, "2026-11-07", ctx("강릉"))[0].name, "건조주의보");
  assert.equal(kmaAlertsFor(sea, "2026-11-08", ctx("강릉"))[0].level, "warn", "강릉 = 강원중부앞바다 풍랑");
  assert.deepEqual(kmaAlertsFor(sea, "2026-11-08", ctx("삼척")), [], "삼척은 강원남부앞바다");
  assert.equal(kmaAlertsFor(cable, "2026-11-07", ctx("속초"))[0].name, "강풍경보");
  assert.deepEqual(kmaAlertsFor(cable, "2026-11-10", ctx("속초")), [], "모레 이후 일정에는 지금 특보를 붙이지 않음");
  assert.deepEqual(kmaAlertsFor(cable, "2026-11-07", { ...ctx("속초"), warnings: { ...w, fetchedAt: "2026-01-01T00:00:00Z" } }), [], "6시간 넘은 특보는 쓰지 않음");
  console.log("ok - 기상특보 (강원 구역·시군·앞바다·오늘·내일·오래된 자료)");
});
console.log("ok - 통제·운휴 경고 (돌풍·풍랑·적설·산불조심기간·스키 시즌)");
