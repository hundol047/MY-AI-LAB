// 일정 품질 기준: 운영시간 충돌이 없어도 사람이 보기에 어색한 동선이 늘지 않게 막는다
// (권역 5 × 동행 4 × 이동 3 × 취향 3 × 날짜 2 × 1~3일 = 1,080개 일정, 약 2,160일)
// 기준을 넘으면 데이터나 엔진을 바꾼 뒤 동선이 나빠진 것이다
import assert from "node:assert/strict";
import { planTrip } from "../public/planner.js";

const R = ["gangneung", "seorak", "chuncheon", "pyeongchang", "wonju"];
let days = 0;
const c = { gap60: 0, zigzag: 0, farStart: 0, leg75: 0, drive4h: 0, noDinner: 0, noLunch: 0, sameDish: 0, lateDayTrip: 0, mealFirst: 0, cafe3: 0 };
const DISH = /막국수|닭갈비|순두부|물회|추어탕|송어|곤드레|해장국|냉면/;
for (const region of R) for (const who of ["couple", "family", "parents", "pet"]) for (const move of ["car", "taxi", "transit"])
  for (const likes of [["sea", "food"], ["culture"], ["nature", "cafe"]]) for (const date of ["2026-11-14", "2027-04-21"]) for (const nd of [1, 2, 3]) {
    const t = planTrip({ region, date, days: nd, who, likes, move }, {});
    t.days.forEach((d, i) => {
      days++;
      const it = d.items;
      for (let k = 1; k < it.length; k++) if (it[k].start - it[k].travelMin - it[k - 1].end >= 60) { c.gap60++; break; }
      const areas = it.map((x) => x.place.area);
      for (let k = 2; k < areas.length; k++) if (areas[k] === areas[k - 2] && areas[k] !== areas[k - 1]) { c.zigzag++; break; }
      if (i > 0 && it[0]?.travelMin >= 60) c.farStart++;
      if (it.some((x) => x.travelMin >= 75)) c.leg75++;
      if (it.reduce((a, x) => a + x.travelMin, 0) >= 240) c.drive4h++;
      if (nd > 1 && i < nd - 1 && !it.some((x) => x.kind === "dinner")) c.noDinner++;
      if (!it.some((x) => x.kind === "lunch")) c.noLunch++;
      const ds = it.filter((x) => x.place.cat === "food").map((x) => (x.place.name.match(DISH) || [])[0]).filter(Boolean);
      if (new Set(ds).size < ds.length) c.sameDish++;
      if (nd === 1 && it.length && it[it.length - 1].end > 19 * 60 + 30) c.lateDayTrip++;
      if (it[0] && it[0].kind !== "visit") c.mealFirst++;
      if (it.filter((x) => x.place.cat === "cafe").length >= 3) c.cafe3++;
    });
  }
const pct = (k) => (c[k] / days) * 100;
const LIMIT = { gap60: 1.5, zigzag: 14, farStart: 9, leg75: 8.5, drive4h: 6, noDinner: 0.5, noLunch: 0.5, sameDish: 0, lateDayTrip: 0, mealFirst: 0.5, cafe3: 0 };
const NAME = { gap60: "60분 넘는 빈 시간", zigzag: "지역 왔다 갔다", farStart: "숙소에서 첫 장소 60분+", leg75: "한 번 이동 75분+", drive4h: "하루 이동 4시간+", noDinner: "숙박일 저녁 없음", noLunch: "점심 없음", sameDish: "같은 음식 두 번", lateDayTrip: "당일치기 19:30 넘김", mealFirst: "식사로 시작", cafe3: "카페 3곳 이상" };
const over = Object.entries(LIMIT).filter(([k, lim]) => pct(k) > lim).map(([k, lim]) => `${NAME[k]} ${pct(k).toFixed(1)}% (기준 ${lim}% 이하)`);
assert.deepEqual(over, [], `일정 품질 기준 초과: ${over.join(", ")}\n전체: ${Object.keys(LIMIT).map((k) => `${NAME[k]} ${pct(k).toFixed(1)}%`).join(" · ")}`);
console.log(`ok - 일정 품질 ${days}일: ` + Object.keys(LIMIT).map((k) => `${NAME[k]} ${pct(k).toFixed(1)}%`).join(" · "));

// 일정 3개 고르기: 3박 4일이면 3개 일정 모두 1~4일차가 있고, 날마다 장소가 있어야 한다.
// 색다른 코스가 추천 장소를 다 빼서 하루에 관광지가 1곳 이하인 날이 많아지지 않게 (권역 5 × 이동 3 × 취향 2)
import { planOptions } from "../public/planner.js";
let optTrips = 0, thinDays = 0;
for (const region of R) for (const move of ["car", "taxi", "transit"]) for (const likes of [["sea", "food"], ["culture"]]) {
  const opts = planOptions({ region, date: "2026-11-14", days: 4, who: "couple", likes, move }, {});
  assert.deepEqual(opts.map((o) => o.key), ["best", "relaxed", "different"], `${region}/${move}: 일정 3개`);
  for (const o of opts) {
    assert.equal(o.trip.days.length, 4, `${region}/${move}/${o.key}: 4일`);
    o.trip.days.forEach((d, i) => {
      assert.ok(d.items.length >= 2, `${region}/${move}/${o.key} ${i + 1}일차 장소 ${d.items.length}곳`);
      if (d.items.filter((x) => x.kind === "visit").length < 2) thinDays++;
    });
  }
  optTrips++;
}
assert.ok(thinDays / (optTrips * 12) <= 0.08, `관광지 1곳 이하인 날 ${thinDays}/${optTrips * 12}`);
console.log(`ok - 3박 4일 일정 3개 × ${optTrips}건: 모두 1~4일차 · 관광지 1곳 이하인 날 ${thinDays}/${optTrips * 12}`);
